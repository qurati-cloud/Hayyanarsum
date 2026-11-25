export const snap = (value, step = 0.5) => Math.round(value / step) * step;
export function nearestCadEndpoint(point, shapes, radius) {
  let nearest = null;
  let shortest = radius ** 2;
  for (const shape of shapes) {
    if (shape.type !== 'cadLine') continue;
    for (const [x, y] of [[shape.x, shape.y], [shape.x2, shape.y2]]) {
      const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
      if (distance > shortest || (nearest && distance === shortest)) continue;
      shortest = distance;
      nearest = { x, y };
    }
  }
  return nearest;
}

export const area = shape => shape.type === 'room' ? shape.w * shape.h : 0;
export const slabArea = shape => shape.w * shape.h;
export const slabOpeningArea = shape => (shape.cutouts ?? []).reduce((sum, cut) => sum + cut.w * cut.h, 0);
export const slabNetArea = shape => Math.max(0, slabArea(shape) - slabOpeningArea(shape));
export const slabVolume = shape => slabNetArea(shape) * shape.z;
export const isLinear = shape => shape?.type === 'wall' || shape?.type === 'cadLine';
export const length = shape => isLinear(shape) ? Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y) : 0;
export const totalArea = shapes => shapes.reduce((sum, shape) => sum + area(shape), 0);

export const groundLevel = Object.freeze({ id: 'ground', name: 'الطابق الأرضي', elevation: 0 });

export function validateLevels(levels = [groundLevel]) {
  if (!Array.isArray(levels) || !levels.length || levels.length > 100) {
    throw new TypeError('Invalid storey list');
  }
  const identifiers = new Set();
  return levels.map(level => {
    if (!level || typeof level.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(level.id) ||
      identifiers.has(level.id) || typeof level.name !== 'string' || !level.name.trim() ||
      !Number.isFinite(level.elevation) || Math.abs(level.elevation) > 1e6) {
      throw new TypeError('Invalid storey');
    }
    identifiers.add(level.id);
    return { id: level.id, name: level.name.trim().slice(0, 160), elevation: level.elevation };
  });
}

export function elementLevel(shape, levels) {
  return levels.find(level => level.id === (shape.levelId ?? 'ground')) ?? (shape.levelId == null ? levels[0] : undefined);
}

export function validHeight(height) {
  return Number.isFinite(height) && height >= 0.01 && height <= 1000;
}

const tolerance = 1e-9;

export function validSlabCutouts(slab) {
  if (slab.cutouts === undefined) return true;
  if (!Array.isArray(slab.cutouts) || slab.cutouts.length > 30) return false;
  return slab.cutouts.every((cut, index) => {
    if (!cut || typeof cut.name !== 'string' || !cut.name.trim() ||
      ![cut.x, cut.y, cut.w, cut.h].every(Number.isFinite) ||
      cut.x <= tolerance || cut.y <= tolerance || cut.w < .01 || cut.h < .01 ||
      cut.x + cut.w >= slab.w - tolerance || cut.y + cut.h >= slab.h - tolerance) return false;
    return slab.cutouts.slice(0, index).every(other =>
      cut.x + cut.w <= other.x + tolerance || other.x + other.w <= cut.x + tolerance ||
      cut.y + cut.h <= other.y + tolerance || other.y + other.h <= cut.y + tolerance);
  });
}

export function slabParts(slab) {
  const cutouts = slab.cutouts ?? [];
  const divisions = [...new Set([0, slab.w, ...cutouts.flatMap(cut => [cut.x, cut.x + cut.w])])].sort((a, b) => a - b);
  const parts = [];
  for (let index = 1; index < divisions.length; index++) {
    const left = divisions[index - 1];
    const right = divisions[index];
    const holes = cutouts.filter(cut => cut.x <= left && cut.x + cut.w >= right).sort((a, b) => a.y - b.y);
    const add = (min, max) => {
      if (max <= min) return;
      const x = slab.x + left, x2 = slab.x + right, y = slab.y + min, y2 = slab.y + max;
      parts.push({ base: [[x, y], [x2, y], [x2, y2], [x, y2]], bottom: -slab.z, top: 0 });
    };
    let last = 0;
    for (const cut of holes) {
      add(last, cut.y);
      last = Math.max(last, cut.y + cut.h);
    }
    add(last, slab.h);
  }
  return parts;
}

export function validWallDetails(wall) {
  const { z, thickness, openings } = wall;
  if (z == null && thickness == null && openings == null) return true;
  if (!validHeight(z) || !validHeight(thickness) || !Array.isArray(openings) || openings.length > 50) return false;
  const wallLength = length(wall);
  const sortedOpenings = [...openings];
  for (const opening of sortedOpenings) {
    if (!opening || !['door', 'window'].includes(opening.kind)) return false;
    const { offset, width, sill, height, kind } = opening;
    if (!Number.isFinite(offset) || offset < 0 || !validHeight(width) || !validHeight(height) ||
      !Number.isFinite(sill) || sill < 0 || (kind === 'door' && sill !== 0) ||
      offset + width > wallLength + tolerance || sill + height > z + tolerance) return false;
  }
  sortedOpenings.sort((left, right) => left.offset - right.offset);
  return sortedOpenings.every((opening, index) => {
    const previous = sortedOpenings[index - 1];
    return !previous || previous.offset + previous.width <= opening.offset + tolerance;
  });
}

export function wallFootprint(wall, start, end) {
  const fullLength = length(wall);
  const dx = (wall.x2 - wall.x) / fullLength;
  const dy = (wall.y2 - wall.y) / fullLength;
  const half = wall.thickness / 2;
  const point = (distance, side) => [
    wall.x + distance * dx - side * half * dy,
    wall.y + distance * dy + side * half * dx,
  ];
  return [point(start, -1), point(end, -1), point(end, 1), point(start, 1)];
}

export function wallSpans(wall) {
  const endOfWall = length(wall);
  let lastEnd = 0;
  const spans = [];
  for (const opening of [...wall.openings].sort((left, right) => left.offset - right.offset)) {
    const start = Math.max(lastEnd, opening.offset);
    const end = Math.min(endOfWall, opening.offset + opening.width);
    if (start > lastEnd) spans.push({ start: lastEnd, end: start });
    spans.push({ start, end, opening });
    lastEnd = end;
  }
  if (lastEnd < endOfWall) spans.push({ start: lastEnd, end: endOfWall });
  return spans;
}

export function wallParts(wall) {
  const parts = [];
  for (const { start, end, opening } of wallSpans(wall)) {
    const base = wallFootprint(wall, start, end);
    if (!opening) {
      parts.push({ base, bottom: 0, top: wall.z });
      continue;
    }
    if (opening.sill > 0) parts.push({ base, bottom: 0, top: opening.sill });
    const head = opening.sill + opening.height;
    if (head < wall.z) parts.push({ base, bottom: head, top: wall.z });
  }
  return parts;
}

export function wallQuantities(wall) {
  const grossArea = length(wall) * wall.z;
  const openingArea = wall.openings.reduce((sum, opening) => sum + opening.width * opening.height, 0);
  const netArea = Math.max(0, grossArea - openingArea);
  return { grossArea, openingArea, netArea, netVolume: netArea * wall.thickness };
}

export function roomProjection(shapes, degrees, levels = [groundLevel]) {
  const angle = degrees * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const faces = [];
  const project = ([x, y, z]) => {
    const depth = x * sine + y * cosine;
    return { x: x * cosine - y * sine, y: depth * 0.5 - z * Math.sqrt(0.75), depth: depth * Math.sqrt(0.75) + z * 0.5 };
  };
  function addPrism(shape, footprint, bottom, height) {
    const base = footprint.map(([x, y]) => [x, y, bottom]);
    const top = footprint.map(([x, y]) => [x, y, height]);
    const add = (vertices, kind) => {
      const points = vertices.map(project);
      const depth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
      faces.push({ points, depth, kind, id: shape.id, layer: shape.layer });
    };
    for (let corner = 0; corner < 4; corner++) {
      const next = (corner + 1) % 4;
      const dx = base[next][0] - base[corner][0];
      const dy = base[next][1] - base[corner][1];
      if (dy * sine - dx * cosine > 0) add([base[corner], base[next], top[next], top[corner]], 'side');
    }
    add(top, 'top');
  }
  for (const shape of shapes) {
    const level = elementLevel(shape, levels);
    if (!level || !validHeight(shape.z)) continue;
    if (shape.type === 'wall') {
      for (const part of wallParts(shape)) addPrism(shape, part.base, part.bottom + level.elevation, part.top + level.elevation);
    } else if (shape.type === 'slab') {
      for (const part of slabParts(shape)) addPrism(shape, part.base, part.bottom + level.elevation, level.elevation);
    } else {
      const { x, y, w, h, z } = shape;
      addPrism(shape, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], level.elevation, level.elevation + z);
    }
  }
  return faces.sort((left, right) => left.depth - right.depth);
}

export function valid(shape) {
  if (!shape || !['room', 'wall', 'slab', 'cadLine'].includes(shape.type)) return false;
  const values = !isLinear(shape)
    ? [shape.x, shape.y, shape.w, shape.h, shape.x + shape.w, shape.y + shape.h, shape.w * shape.h]
    : [shape.x, shape.y, shape.x2, shape.y2, length(shape)];
  if (shape.type === 'cadLine') return values.every(Number.isFinite) && length(shape) > 0 &&
    values.slice(0, 4).every(value => Math.abs(value) <= 1e9);
  return values.every(Number.isFinite) &&
    (shape.type === 'wall' ? length(shape) > 0 && validWallDetails(shape)
      : shape.w > 0 && shape.h > 0 && (shape.type === 'slab'
        ? validHeight(shape.z) && validSlabCutouts(shape) && Number.isFinite(slabVolume(shape))
        : shape.z == null || validHeight(shape.z)));
}

export function wallFromCadLine(line, { name, thickness, z }) {
  if (line?.type !== 'cadLine' || !valid(line) || !validHeight(thickness) || !validHeight(z)) return null;
  const { id, levelId, x, y, x2, y2 } = line;
  return { id, levelId, x, y, x2, y2, type: 'wall', layer: 'A-WALL', name, thickness, z, openings: [] };
}

export const residentialReference = Object.freeze({
  authority: 'وزارة البلديات والإسكان',
  title: 'اشتراطات إنشاء المباني السكنية',
  url: 'https://balady.gov.sa/sites/default/files/2024-12/ashtratat%20a%27nsha%20almbany%20alsknyt%20almnshwrt%20%60ly%20mwq%60%20alwzart%20.pdf',
  section: '4-2',
  edition: null,
  effectiveDate: null,
  jurisdiction: 'السعودية، مع مراجعة الضوابط المحلية للموقع',
  status: 'draft',
});

export function compliance(input) {
  if (input.buildingType !== 'apartment') {
    return [{ status: 'na', title: 'نطاق القواعد', message: 'هذه المقارنة تخص العمائر السكنية والسكنية التجارية.', source: '—' }];
  }
  const ratios = [
    ['نسبة بناء الدور الأرضي', input.groundArea, input.landArea, 65],
    ['نسبة بناء الدور الأول أو المتكرر المدخل', input.upperArea, input.landArea, 75],
    ['نسبة بناء الملحق العلوي', input.roofArea, input.roofBaseArea, 70],
  ];
  const results = ratios.map(([title, numerator, denominator, limit], index) => {
    const ratio = numerator / denominator * 100;
    const complete = numerator >= 0 && denominator > 0 && Number.isFinite(ratio);
    return {
      title,
      status: complete ? 'draft' : 'pending',
      message: complete
        ? `النسبة المحسوبة ${ratio.toFixed(2)}%، والقيمة المرجعية ${limit}%. ${ratio > limit ? 'تتجاوز القيمة المرجعية.' : 'ضمن القيمة المرجعية.'} تطبيق الشرط على الموقع وتاريخ نفاذه قيد المراجعة.`
        : 'أدخل مساحة غير سالبة ومقامًا موجبًا للمقارنة.',
      source: `${residentialReference.title}، ${residentialReference.section}، بند ${index + 1}`,
      url: residentialReference.url,
    };
  });
  results.push({
    title: 'الارتدادات ومواقف السيارات',
    status: 'draft',
    message: 'الفحص معلق. تحتاج الارتدادات إلى بيانات مستقلة لكل واجهة وحد مجاور، ومواقف المحلات إلى عدد المحلات ومساحاتها.',
    source: 'اشتراطات إنشاء المباني السكنية، 4-2، البنود 4–6',
    url: residentialReference.url,
  });
  return results;
}

const saudiLawUrl = 'https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/cfc97985-4a9f-4012-832b-a9a700f21ed2/1';
export const saudiSources = [
  { category: 'نظام ملزم', title: 'نظام تطبيق كود البناء السعودي', url: saudiLawUrl,
    note: 'المادة الثانية، الفقرة 1. صُدر في 24 يناير 2017. يحدد الفحص نطاق مسار المراجعة.' },
  { category: 'اشتراطات بلدية · نتائج استرشادية', ...residentialReference,
    note: 'العمائر السكنية والسكنية التجارية، 4-2. تاريخ نفاذ النسخة وانطباق الضوابط المحلية قيد التحقق.' },
  { category: 'مرجع فني · مراجعة لازمة', title: 'كود البناء السعودي',
    url: 'https://www.sbc.gov.sa/ar/BC/Pages/BuildingCode/live_browsinghome.aspx',
    note: 'يعرض المركز إصدارات الكود. يتطلب المشروع تأكيد الإصدار والأجزاء المنطبقة لدى الجهة المختصة.' },
  { category: 'موجهات تصميمية مرتبطة بالموقع', title: 'العمارة السعودية',
    url: 'https://architsaudi.dasc.gov.sa/ar/design-guidelines',
    note: 'يُرجع إلى الموجه التصميمي للقطعة والمرحلة ونوع المشروع لتحديد ما يلزم منها.' },
  { category: 'أهداف استراتيجية', title: 'رؤية السعودية 2030',
    url: 'https://www.vision2030.gov.sa/en/overview',
    note: 'مرجع للأهداف والبرامج؛ تتبع المتطلبات الملزمة للأنظمة والاشتراطات ذات الصلة بالمشروع.' },
];

export const saudiTextFields = ['municipality', 'parcelReference', 'buildingType', 'workType', 'localGuide'];
export const saudiNumberFields = ['landArea', 'groundArea', 'upperArea', 'roofArea', 'roofBaseArea',
  'units', 'parking', 'streetWidth', 'frontSetback', 'floorCount', 'shopCount', 'retailArea', 'retailParking'];
export const saudiEdgeKinds = Object.freeze({
  street: 'شارع جانبي أو خلفي',
  neighbor: 'حد مجاور',
  other: 'ممر أو ساحة أو حد آخر',
});

export function cleanSaudiInputs(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const edges = Array.isArray(input.edges) ? input.edges.slice(0, 24).map(value => {
    const edge = value && typeof value === 'object' ? value : {};
    return {
      name: typeof edge.name === 'string' ? edge.name.trim().slice(0, 100) : '',
      kind: typeof edge.kind === 'string' && Object.hasOwn(saudiEdgeKinds, edge.kind) ? edge.kind : 'other',
      streetWidth: Number.isFinite(edge.streetWidth) ? edge.streetWidth : null,
      setback: Number.isFinite(edge.setback) ? edge.setback : null,
    };
  }) : [];
  return {
    ...Object.fromEntries(saudiTextFields.map(key => [key, typeof input[key] === 'string' ? input[key].trim().slice(0, 250) : ''])),
    ...Object.fromEntries(saudiNumberFields.map(key => [key, Number.isFinite(input[key]) ? input[key] : null])),
    edges,
  };
}

export function saudiProjectReview(input, city) {
  const scope = ['new', 'renovation', 'change-use', 'extension', 'alteration'].includes(input.workType);
  const knownSite = Boolean(city?.trim() && input.municipality && input.parcelReference);
  const results = [{
    status: scope ? 'review' : 'pending',
    title: 'نطاق نظام تطبيق كود البناء السعودي',
    message: scope
      ? 'نوع العمل المدخل يستلزم مراجعة الكود. ينبغي تأكيد الجزء والإصدار المنطبقين والضوابط الخاصة بالموقع قبل الاعتماد.'
      : 'حدّد نوع العمل لتحديد مسار مراجعة الكود.',
    source: 'نظام تطبيق كود البناء السعودي، المادة الثانية، الفقرة 1',
    url: saudiLawUrl,
  }, {
    status: knownSite ? 'review' : 'pending',
    title: 'ضوابط البلدية والعمارة السعودية',
    message: knownSite
      ? input.localGuide
        ? 'سُجّل مرجع الموقع المدخل: ' + input.localGuide + '. ينبغي التحقق من نسخته ونطاقه لدى الجهة المختصة.'
        : 'سُجّل الموقع. أضف رابط أو رقم الموجه والاشتراط المحلي للقطعة بعد مراجعة الجهة المختصة.'
      : 'أدخل المدينة والبلدية ومرجع قطعة الأرض أو التقرير المساحي.',
    source: 'الموجهات التصميمية للعمارة السعودية',
    url: saudiSources[3].url,
  }];
  if (!knownSite || input.workType !== 'new' || !['apartment', 'mixed-apartment'].includes(input.buildingType)) return results;

  // Empty persisted values are missing inputs, not measurements of zero.
  const comparable = Object.fromEntries(saudiNumberFields.map(key => [key, input[key] ?? NaN]));
  results.push(...compliance({ ...comparable, buildingType: 'apartment' }).slice(0, 3));
  const { units, parking, streetWidth, frontSetback } = comparable;
  const validParking = Number.isSafeInteger(units) && units > 0 && units <= Number.MAX_SAFE_INTEGER / 2 &&
    Number.isSafeInteger(parking) && parking >= 0;
  const requiredParking = Math.ceil(units * 1.5);
  results.push({
    status: validParking ? 'draft' : 'pending',
    title: 'مواقف الشقق داخل حدود الملكية',
    message: validParking
      ? 'الحد في المرجع ' + requiredParking + ' موقفًا، والمدخل ' + parking +
        '. ' + (parking < requiredParking ? 'أقل من العدد المرجعي.' : 'يبلغ العدد المرجعي أو يتجاوزه.') +
        (input.buildingType === 'mixed-apartment' ? ' مواقف الأنشطة التجارية تحتاج فحصًا مستقلًا.' : '')
      : 'أدخل عدد الشقق والمواقف المخصصة لها داخل حدود الملكية.',
    source: 'اشتراطات إنشاء المباني السكنية، 4-2، بند 6',
    url: residentialReference.url,
  });
  const validFront = Number.isFinite(streetWidth) && streetWidth > 0 && Number.isFinite(frontSetback) && frontSetback >= 0;
  const requiredFront = Math.max(streetWidth / 5, 3);
  results.push({
    status: validFront ? 'draft' : 'pending',
    title: 'الارتداد عن الواجهة الأمامية المدخلة',
    message: validFront
      ? 'الحد في المرجع ' + requiredFront.toFixed(2) + ' م. ' +
        (frontSetback < requiredFront ? 'القياس أقل من الحد المرجعي.' : 'القياس يبلغ الحد المرجعي أو يتجاوزه.') +
        ' تُراجع الضوابط المحلية واشتراطات الواجهات الأخرى على حدة.'
      : 'أدخل عرض الشارع الأمامي والارتداد من حدود الملكية إلى حد البناء الأرضي.',
    source: 'اشتراطات إنشاء المباني السكنية، 4-2، بند 4',
    url: residentialReference.url,
  });
  const floorCount = comparable.floorCount;
  for (const [index, edge] of (input.edges ?? []).entries()) {
    const neighboring = edge.kind === 'neighbor';
    const street = edge.kind === 'street';
    const comparableEdge = neighboring ? Number.isSafeInteger(floorCount) && floorCount > 0
      : street && Number.isFinite(edge.streetWidth) && edge.streetWidth > 0;
    const minimum = neighboring ? (floorCount > 5 ? 3 : 2) : Math.max(edge.streetWidth / 5, 2);
    const measured = edge.setback != null && Number.isFinite(edge.setback) && edge.setback >= 0;
    const ready = comparableEdge && measured;
    const label = edge.name || 'الحد ' + (index + 1);
    const message = ready
      ? 'الحد في المرجع ' + minimum.toFixed(2) + ' م، والقياس ' + edge.setback.toFixed(2) +
        ' م. ' + (edge.setback < minimum ? 'القياس أقل من الحد المرجعي.' : 'القياس يبلغ الحد المرجعي أو يتجاوزه.')
      : neighboring ? 'أدخل عدد الأدوار وفق مستند المشروع والارتداد الأرضي لهذا الحد.'
        : street ? 'أدخل عرض الشارع والارتداد الأرضي لهذا الحد.'
          : 'يلزم الرجوع إلى الجهة المختصة لتحديد شرط هذا النوع من الحدود.';
    results.push({
      status: ready ? 'draft' : (neighboring || street ? 'pending' : 'review'),
      title: 'ارتداد ' + label + ' · ' + saudiEdgeKinds[edge.kind],
      message,
      source: 'اشتراطات إنشاء المباني السكنية، 4-2، بند 4؛ قياس الارتداد، 4، بند 11',
      url: residentialReference.url,
    });
  }
  const mixed = input.buildingType === 'mixed-apartment';
  if (mixed) {
    const { shopCount, retailArea, retailParking } = comparable;
    const known = Number.isSafeInteger(shopCount) && shopCount > 0 && Number.isFinite(retailArea) && retailArea > 0 &&
      Number.isSafeInteger(retailParking) && retailParking >= 0;
    const lowerBound = Math.max(shopCount, Math.ceil(retailArea / 45));
    results.push({
      status: known ? 'draft' : 'pending',
      title: 'الحد الأدنى الحسابي لمواقف المحلات',
      message: known
        ? 'الحد الأدنى المستنتج من المساحة الإجمالية وعدد المحلات ' + lowerBound + '، والمدخل ' + retailParking +
          '. ' + (retailParking < lowerBound ? 'العدد أقل من هذا الحد.' : 'العدد يبلغ هذا الحد أو يتجاوزه.') +
          ' تُراجع المساحات المقبولة وتوزيع المواقف لكل محل لدى الجهة المختصة.'
        : 'أدخل عدد المحلات ومساحتها التجارية المعتمدة للحساب والمواقف المخصصة لها داخل الملكية.',
      source: 'اشتراطات إنشاء المباني السكنية، 4-2، بند 5',
      url: residentialReference.url,
    });
  }
  const countKnown = Number.isSafeInteger(units) && units > 0;
  results.push({
    status: mixed || countKnown ? 'review' : 'pending',
    title: 'تحديد نطاق مراجعة الوصول الشامل',
    message: mixed || (countKnown && units >= 4)
      ? 'تندرج هذه الفئة ضمن نطاق مراجعة الوصول الشامل في المرجع. تُراجع المسارات والمواقف والمنحدرات والفراغات وفق الجزء المعني من الكود.'
      : countKnown
        ? 'عدد الوحدات دون عتبة الأربع في هذا البند. تُراجع متطلبات الوصول الأخرى وفق الكود والضوابط المحلية.'
        : 'أدخل عدد الوحدات السكنية لتحديد نطاق هذا البند.',
    source: 'اشتراطات إنشاء المباني السكنية، 5-1-3، بندا 1 و2',
    url: residentialReference.url,
  });
  return results;
}

export const residentialSpaceRules = Object.freeze({
  living: Object.freeze({ label: 'مجلس أو صالة أو غرفة طعام', width: 2.8, area: 11.2 }),
  bedroom: Object.freeze({ label: 'غرفة نوم', width: 2.1, area: 6.5 }),
  kitchen: Object.freeze({ label: 'مطبخ', width: 1.8, area: 5 }),
  bathroom: Object.freeze({ label: 'حمّام', width: 1.4, area: 2.8 }),
  toilet: Object.freeze({ label: 'دورة مياه (مرحاض)', width: 1, area: 1.5 }),
  corridor: Object.freeze({ label: 'ممر داخلي سكني', width: .9, area: null }),
});

export function residentialRoomMetadata(use, clear) {
  const roomUse = typeof use === 'string' && Object.hasOwn(residentialSpaceRules, use) ? use : '';
  return { roomUse, clearRoom: Boolean(roomUse && clear === true) };
}

export function saudiModelReview(input, city, shapes, levels = [groundLevel]) {
  if (input.workType !== 'new' || !city?.trim() || !input.municipality || !input.parcelReference ||
      !['apartment', 'mixed-apartment', 'villa'].includes(input.buildingType)) return [];
  const results = [{
    status: 'review',
    title: 'مراجعة الاستدامة وكفاءة الطاقة للمبنى السكني',
    message: 'راجع ترشيد الطاقة والمياه والعزل الحراري للأسطح والجدران وفق أجزاء الكود المدونة في المرجع، بعد تأكيد إصدارها المنطبق. تتطلب المراجعة بيانات المواد وتكوين الغلاف.',
    source: 'اشتراطات إنشاء المباني السكنية، 5-1-2، بندا 1 و2 · SBC 201 وSBC 602',
    url: residentialReference.url,
  }];
  const source = 'اشتراطات إنشاء المباني السكنية، 5-1-4، بند 2، جدول الغرف والفراغات';
  const rooms = shapes.filter(shape => shape.type === 'room' && valid(shape));
  let unclassified = 0;
  for (const room of rooms) {
    const { roomUse, clearRoom } = residentialRoomMetadata(room.roomUse, room.clearRoom);
    if (!roomUse) {
      unclassified++;
      continue;
    }
    const rule = residentialSpaceRules[roomUse];
    const level = elementLevel(room, levels);
    const title = [room.name || 'مساحة', rule.label, level?.name].filter(Boolean).join(' · ');
    const width = Math.min(room.w, room.h);
    const size = area(room);
    const widthLow = width < rule.width - tolerance;
    const areaLow = rule.area !== null && size < rule.area - tolerance;
    const widthText = 'العرض الصافي ' + width.toFixed(2) + ' م، والحد المرجعي ' + rule.width.toFixed(2) + ' م.';
    const areaText = rule.area === null ? '' : ' المساحة الصافية ' + size.toFixed(2) + ' م²، والحد المرجعي ' + rule.area.toFixed(2) + ' م².';
    const shortfalls = [widthLow ? 'العرض' : '', areaLow ? 'المساحة' : ''].filter(Boolean);
    results.push({
      status: clearRoom ? 'draft' : 'pending',
      title,
      message: clearRoom
        ? widthText + areaText + ' ' + (shortfalls.length ? 'أقل من المرجع: ' + shortfalls.join('، ') + '.' : 'المدخلات تبلغ الحدود المرجعية.')
        : 'أكّد أن القياسات تمثل الأبعاد الصافية لهذا الفراغ المستطيل بعد التشطيب.',
      source,
      url: residentialReference.url,
    });
  }
  if (unclassified || !rooms.length) {
    results.push({
      status: 'pending', title: 'تصنيف الفراغات السكنية',
      message: unclassified ? 'عدد المساحات غير المصنفة: ' + unclassified + '. حدّد الاستخدام للفراغات السكنية المعنية.'
        : 'أضف مساحة في المخطط وحدّد استخدامها السكني لبدء المقارنة.',
      source, url: residentialReference.url,
    });
  }
  return results;
}

export function dxf(shapes) {
  const records = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015',
    '9', '$INSUNITS', '70', '6', '9', '$MEASUREMENT', '70', '1',
    '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  ];
  // The screen has a downwards Y axis; CAD uses an upwards Y axis.
  function line(x, y, x2, y2, layer) {
    records.push('0', 'LINE', '100', 'AcDbEntity', '8', layer,
      '100', 'AcDbLine', '10', x, '20', -y, '30', 0, '11', x2, '21', -y2, '31', 0);
  }
  for (const shape of shapes) {
    if (!valid(shape)) throw new TypeError('Invalid geometry');
    const layer = /^[A-Z0-9_-]{1,40}$/.test(shape.layer) ? shape.layer : '0';
    const { x, y, w, h } = shape;
    if (shape.type === 'cadLine') {
      const sourceLayer = /^[A-Za-z0-9_.-]{1,160}$/.test(shape.cadLayer) ? shape.cadLayer : layer;
      line(x, y, shape.x2, shape.y2, sourceLayer);
      continue;
    }
    if (shape.type === 'wall') {
      if (shape.thickness == null) {
        line(x, y, shape.x2, shape.y2, layer);
        continue;
      }
      for (const span of wallSpans(shape)) {
        const corners = wallFootprint(shape, span.start, span.end);
        const spanLayer = span.opening ? (span.opening.kind === 'door' ? 'A-DOOR' : 'A-GLAZ') : layer;
        corners.forEach(([px, py], index) => line(px, py, ...corners[(index + 1) % corners.length], spanLayer));
      }
      continue;
    }
    line(x, y, x + w, y, layer);
    line(x + w, y, x + w, y + h, layer);
    line(x + w, y + h, x, y + h, layer);
    line(x, y + h, x, y, layer);
    if (shape.type === 'slab') for (const cut of shape.cutouts ?? []) {
      const left = x + cut.x, top = y + cut.y, right = left + cut.w, bottom = top + cut.h;
      const corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
      corners.forEach(([px, py], index) => line(px, py, ...corners[(index + 1) % 4], 'S-OPEN'));
    }
  }
  return [...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n');
}
