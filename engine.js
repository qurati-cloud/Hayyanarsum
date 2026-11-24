export const snap = (value, step = 0.5) => Math.round(value / step) * step;
export const area = shape => shape.type === 'room' ? shape.w * shape.h : 0;
export const slabArea = shape => shape.w * shape.h;
export const slabVolume = shape => slabArea(shape) * shape.z;
export const length = shape => shape.type === 'wall' ? Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y) : 0;
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
    } else {
      const { x, y, w, h, z } = shape;
      const bottom = shape.type === 'slab' ? level.elevation - z : level.elevation;
      const top = shape.type === 'slab' ? level.elevation : level.elevation + z;
      addPrism(shape, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], bottom, top);
    }
  }
  return faces.sort((left, right) => left.depth - right.depth);
}

export function valid(shape) {
  if (!shape || !['room', 'wall', 'slab'].includes(shape.type)) return false;
  const values = shape.type !== 'wall'
    ? [shape.x, shape.y, shape.w, shape.h, shape.x + shape.w, shape.y + shape.h, shape.w * shape.h]
    : [shape.x, shape.y, shape.x2, shape.y2, length(shape)];
  return values.every(Number.isFinite) &&
    (shape.type === 'wall' ? length(shape) > 0 && validWallDetails(shape)
      : shape.w > 0 && shape.h > 0 && (shape.type === 'slab'
        ? validHeight(shape.z) && Number.isFinite(slabVolume(shape))
        : shape.z == null || validHeight(shape.z)));
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
      status: 'draft',
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
  }
  return [...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n');
}
