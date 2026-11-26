import { area, dxf, normalizeNumericInput, residentialRoomMetadata, validHeight } from './engine.js';

export const briefFields = {
  kind: { question: 'ما نوع المبنى السكني؟' },
  city: { question: 'في أي مدينة يقع المشروع؟' },
  frontage: { question: 'كم يبلغ عرض الأرض على الشارع بالمتر؟' },
  depth: { question: 'كم يبلغ عمق الأرض بالمتر؟' },
  storeys: { question: 'كم عدد الطوابق المطلوبة؟' },
  bedrooms: { question: 'كم عدد غرف النوم المطلوبة في المشروع؟' },
};

const buildingPatterns = {
  villa: /فيلا|ڤيلا|\bvilla\b/iu,
  house: /منزل|بيت|\bhouse\b|\bmaison\b/iu,
  apartment: /عمارة سكنية|\bapartment building\b|\bimmeuble résidentiel\b/iu,
};
const cityNames = {
  الرياض: /الرياض|\briyadh\b|\briyad\b/iu,
  جدة: /جدة|جده|\bjeddah\b|\bdjeddah\b/iu,
  الدمام: /الدمام|\bdammam\b/iu,
  مكة: /مكة|مكه|\bmakkah\b|\bmecca\b|\bla mecque\b/iu,
  'المدينة المنورة': /المدينة المنورة|المدينه المنوره|\bmadinah\b|\bm[eé]dine\b/iu,
  الخبر: /الخبر|\bal[- ]khobar\b/iu,
  أبها: /أبها|ابها|\babha\b/iu,
};
const words = { 'ثلاث': 3, 'ثلاثة': 3, 'أربع': 4, 'أربعة': 4, 'اربع': 4, 'اربعة': 4,
  'خمس': 5, 'خمسة': 5, one: 1, two: 2, three: 3, four: 4, five: 5,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };

export function cleanBrief(input) {
  const value = {};
  if (!input || typeof input !== 'object') return value;
  if (Object.hasOwn(buildingPatterns, input.kind)) value.kind = input.kind;
  if (typeof input.city === 'string' && input.city.trim()) value.city = input.city.trim().slice(0, 160);
  for (const key of ['frontage', 'depth']) {
    if (Number.isFinite(input[key]) && input[key] > 0 && input[key] <= 1e6) value[key] = input[key];
  }
  for (const key of ['storeys', 'bedrooms']) {
    if (Number.isInteger(input[key]) && input[key] >= (key === 'bedrooms' ? 0 : 1) && input[key] <= 100) value[key] = input[key];
  }
  return value;
}

const decimal = String.raw`(\d+(?:[.,]\d+)?)`;
const centimetres = /^(?:سم|سنتيمتر(?:ات)?|cm|centim(?:[eè]tres?|eters?))$/iu;
const millimetres = /^(?:مم|مل{1,2}يمتر(?:ات)?|mm|millim(?:[eè]tres?|eters?))$/iu;
const metricUnit = String.raw`(\p{L}+)(?![\p{L}\p{M}\p{N}]|\s*[/^]|\s*(?:مربع(?:ة)?|مكعب(?:ة)?|carr[ée]s?|squared?|cub(?:ed|ic|es?))(?![\p{L}\p{M}\p{N}]))`;
const metricLength = String.raw`${decimal}\s*${metricUnit}`;
const metricPair = String.raw`${decimal}(?:\s*${metricUnit})?\s*(?:×|x|في|by|par)\s*${metricLength}`;

function metres(value, unit) {
  if (!value || !unit) return NaN;
  const exponent = centimetres.test(unit) ? 'e-2' : millimetres.test(unit) ? 'e-3' :
    /^(?:م|متر|m(?:[eè]tres?|eters?)?)$/iu.test(unit) ? 'e0' : null;
  return exponent === null ? NaN : Number(value.replace(',', '.') + exponent);
}

function metresPair([, first, firstUnit, second, secondUnit]) {
  return [metres(first, firstUnit ?? secondUnit), metres(second, secondUnit)];
}

const standaloneLength = new RegExp(String.raw`^${metricLength}\.?$`, 'iu');

const axisDimensions = {
  frontage: String.raw`(?:عرض (?:الأرض|الارض|الواجهة)|\bfrontage|largeur (?:du terrain|de façade))`,
  depth: String.raw`(?:عمق (?:الأرض|الارض)|\b(?:plot )?depth|profondeur(?: du terrain)?)`,
};
const plotPair = new RegExp(String.raw`^\s*(?:أبعاد الأرض|ابعاد الارض|lot dimensions|plot dimensions|dimensions du terrain)\s*:\s*${metricPair}\.?\s*$`, 'gmu');

const countTerms = {
  storeys: /(?:طوابق|طابق|أدوار|ادوار|دور|storeys?|stories|floors?|étages?)/u,
  bedrooms: /(?:غرف(?:ة)? نوم|bedrooms?|chambres?)/u,
};
const countLabels = {
  storeys: /(?:عدد (?:الطوابق|الأدوار|الادوار)|(?:storey|floor) count|nombre d['’]étages)/u,
  bedrooms: /(?:عدد غرف النوم|bedroom count|nombre de chambres)/u,
};
const countValue = raw => Object.hasOwn(words, raw) ? words[raw] : /^\d+$/u.test(raw) ? Number(raw) : NaN;

export function extractBrief(description, { includeEvidence = false } = {}) {
  const raw = description.slice(0, 4000);
  const original = raw.trimStart();
  const source = normalizeNumericInput(original.normalize('NFKC').toLowerCase()).replace(/[\u064B-\u065F\u0670]/gu, '');
  const candidates = Object.fromEntries(Object.keys(briefFields).map(key => [key, new Set()]));
  const lines = includeEvidence ? original.split('\n') : [];
  const lineOffset = includeEvidence ? raw.slice(0, raw.length - original.length).split('\n').length - 1 : 0;
  const evidence = {};
  const add = (key, value, match) => {
    const clean = cleanBrief({ [key]: value });
    if (!Object.hasOwn(clean, key) || candidates[key].has(clean[key])) return;
    candidates[key].add(clean[key]);
    if (includeEvidence) {
      const start = match.index + match[0].search(/\S/u);
      const end = match.index + match[0].trimEnd().length;
      const firstLine = source.slice(0, start).split('\n').length;
      const lastLine = source.slice(0, end).split('\n').length;
      const text = lines.slice(firstLine - 1, lastLine).join('\n').trim();
      (evidence[key] ??= []).push({ value: clean[key], line: firstLine + lineOffset, text });
    }
  };
  for (const [kind, pattern] of Object.entries(buildingPatterns)) {
    const match = pattern.exec(source);
    if (match) add('kind', kind, match);
  }
  for (const [city, pattern] of Object.entries(cityNames)) {
    const match = pattern.exec(source);
    if (match) add('city', city, match);
  }
  for (const [key, label] of Object.entries(axisDimensions)) {
    const explicit = new RegExp(String.raw`${label}\s*[:=]?\s*${metricLength}`, 'gu');
    for (const match of source.matchAll(explicit)) add(key, metres(match[1], match[2]), match);
  }
  for (const match of source.matchAll(plotPair)) {
    const [frontage, depth] = metresPair(match);
    if ([frontage, depth].every(Number.isFinite)) {
      add('frontage', frontage, match);
      add('depth', depth, match);
    }
  }
  for (const [key, term] of Object.entries(countTerms)) {
    const inline = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}.,+−-])(?:(?:وب?|ب)(?=\d|أربع|اربع|ثلاث|خمس))?(\d+|[\p{L}]+)[ \t]*${term.source}(?![\p{L}\p{M}\p{N}]|[ \t]+count\b)`, 'gu');
    for (const match of source.matchAll(inline)) {
      const prefix = source.slice(Math.max(0, match.index - 30), match.index);
      if (/\d[ \t]*(?:[-–—]|to|or|à|ou|إلى|أو)[ \t]*$/u.test(prefix)) continue;
      add(key, countValue(match[1]), match);
    }
    const labeled = new RegExp(String.raw`^\s*${countLabels[key].source}\s*:\s*(\d+|[\p{L}]+)\.?\s*$`, 'gmu');
    for (const match of source.matchAll(labeled)) add(key, countValue(match[1]), match);
  }
  const dualStoreys = /(?:^|[^\p{L}])(?:طابقان|طابقين|دوران|دورين)(?![\p{L}])/u.exec(source);
  const dualBedrooms = /(?:^|[^\p{L}])(?:غرفتا نوم|غرفتي نوم)(?![\p{L}])/u.exec(source);
  if (dualStoreys) add('storeys', 2, dualStoreys);
  if (dualBedrooms) add('bedrooms', 2, dualBedrooms);

  const data = {}, conflicts = [];
  for (const [key, options] of Object.entries(candidates)) {
    if (options.size === 1) data[key] = [...options][0];
    else if (options.size > 1) conflicts.push(key);
  }
  if (includeEvidence) for (const entries of Object.values(evidence)) entries.sort((a, b) => a.line - b.line);
  return { data, conflicts, ...(includeEvidence ? { evidence } : {}) };
}

export function missingBriefFields(data) {
  return Object.keys(briefFields).filter(key => !Object.hasOwn(data, key));
}

export const setbackSides = ['left', 'right', 'front', 'rear'];

export function cleanSetbacks(input) {
  if (!input || typeof input !== 'object') return null;
  return Object.fromEntries(setbackSides.map(side => [
    side, validSetback(input[side]) ? input[side] : null,
  ]));
}

const setbackLabels = {
  left: /^(?:ارتداد (?:ال)?[أا]يسر|left setback|(?:retrait|recul) gauche)$/iu,
  right: /^(?:ارتداد (?:ال)?[أا]يمن|right setback|(?:retrait|recul) droit)$/iu,
  front: /^(?:ارتداد (?:ال)?[أا]مامي|front setback|(?:retrait|recul) avant)$/iu,
  rear: /^(?:ارتداد (?:ال)?خلفي|(?:rear|back) setback|(?:retrait|recul) arri[eè]re)$/iu,
};
const validSetback = value => Number.isFinite(value) && value >= 0 && value <= 1e6;

export function extractBriefSetbacks(description) {
  const unrecognized = new Set();
  const candidates = new Map();
  for (const line of description.slice(0, 4000).normalize('NFKC').split(/\r?\n/u)) {
    const match = /^\s*(?:[-•]\s*)?([^:]+):\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    const label = match[1].trim().replace(/[\u064B-\u065F\u0670]/gu, '').replace(/\s+/gu, ' ').replace(/^الارتداد /u, 'ارتداد ');
    const side = setbackSides.find(key => setbackLabels[key].test(label));
    if (!side) continue;
    if (!candidates.has(side)) candidates.set(side, new Set());
    if (!match[2]) continue;
    const metric = standaloneLength.exec(normalizeNumericInput(match[2]));
    const value = metric ? metres(metric[1], metric[2]) : NaN;
    if (validSetback(value)) candidates.get(side).add(value);
    else unrecognized.add(side);
  }

  const conflicts = [];
  const setbacks = candidates.size ? cleanSetbacks(Object.fromEntries([...candidates].map(([side, values]) => {
    if (values.size > 1) conflicts.push(side);
    return [side, values.size === 1 && !unrecognized.has(side) ? [...values][0] : null];
  }))) : null;
  return { setbacks, conflicts, invalid: [...unrecognized] };
}

function rectangularReferences({ left, right, front, rear }, cadLayer, name) {
  const corners = [[left, front], [right, front], [right, rear], [left, rear]];
  return corners.map(([x, y], index) => {
    const [x2, y2] = corners[(index + 1) % 4];
    return { type: 'cadLine', layer: 'CAD-REF', cadLayer, name: name + ' ' + (index + 1), x, y, x2, y2 };
  });
}

function roomShape({ name, w, h, roomUse, z }, x, y) {
  return { type: 'room', layer: 'A-WALL', name: name.trim().slice(0, 160),
    ...residentialRoomMetadata(roomUse, false), x, y, w, h, z: validHeight(z) ? z : null };
}

const validCoordinate = value => Number.isFinite(value) && value >= 0 && value <= 1e6;
const fits = (used, available) => used <= available + Math.abs(available) * Number.EPSILON * 4;

function layoutRows(blocks, columns, x, y, bounds) {
  const rooms = [];
  let top = y;
  for (let start = 0; start < blocks.length; start += columns) {
    const row = blocks.slice(start, start + columns);
    let left = x, rowHeight = 0;
    for (const block of row) {
      if (!fits(left + block.w, bounds.right) || !fits(top + block.h, bounds.rear)) return null;
      rooms.push(roomShape(block, left, top));
      left += block.w;
      rowHeight = Math.max(rowHeight, block.h);
    }
    top += rowHeight;
  }
  return rooms;
}

function intervalsOverlap(start, end, otherStart, otherEnd) {
  return !fits(end, otherStart) && !fits(otherEnd, start);
}

export function briefRoomConflict(proposedRooms, currentShapes) {
  const currentRooms = currentShapes.filter(shape => shape.type === 'room');
  for (const room of proposedRooms) {
    const existing = currentRooms.find(shape =>
      intervalsOverlap(room.x, room.x + room.w, shape.x, shape.x + shape.w) &&
      intervalsOverlap(room.y, room.y + room.h, shape.y, shape.y + shape.h));
    if (existing) return { proposed: room.name, existing: existing.name };
  }
  return null;
}

function proposedCoordinate(block, bounds, placed) {
  const yOptions = block.y == null
    ? [...new Set([bounds.front, ...placed.map(room => room.y + room.h)])]
      .filter(y => y >= bounds.front).sort((a, b) => a - b)
    : [block.y];
  const ordered = [...placed].sort((a, b) => a.x - b.x);
  for (const y of yOptions) {
    if (!fits(y + block.h, bounds.rear)) break;
    let x = block.x ?? bounds.left;
    for (const room of ordered) {
      if (!intervalsOverlap(y, y + block.h, room.y, room.y + room.h)) continue;
      if (fits(x + block.w, room.x)) break;
      if (fits(room.x + room.w, x)) continue;
      if (block.x != null) {
        x = Infinity;
        break;
      }
      x = room.x + room.w;
    }
    if (fits(x + block.w, bounds.right)) return { x, y };
  }
  return null;
}

function layoutWithCoordinates(blocks, bounds, outside, fillMissing, obstacles) {
  const rooms = [];
  const suggestedIndices = [];
  const indices = blocks.map((_, index) => index);
  const missingCount = ({ x, y }) => Number(x == null) + Number(y == null);
  // Reserve fully specified rectangles first, then honor single-axis constraints before free placements.
  if (fillMissing) indices.sort((a, b) => missingCount(blocks[a]) - missingCount(blocks[b]));
  const placed = [];
  for (const index of indices) {
    const block = blocks[index];
    let { x, y } = block;
    const { w, h } = block;
    const missing = missingCount(block);
    const allowed = value => validCoordinate(value) || (fillMissing && value == null);
    if (!allowed(x) || !allowed(y)) return { error: 'coordinates', names: [block.name] };
    if ((x != null && (!fits(bounds.left, x) || !fits(x + w, bounds.right))) ||
        (y != null && (!fits(bounds.front, y) || !fits(y + h, bounds.rear)))) return { error: outside, names: [block.name] };
    if (missing) {
      const proposal = proposedCoordinate(block, bounds, [...obstacles, ...placed]);
      if (!proposal) return { error: 'partial-fit', names: [block.name] };
      ({ x, y } = proposal);
      suggestedIndices.push(index);
    }
    if (x + w <= x || y + h <= y) return { error: 'coordinates', names: [block.name] };
    const overlap = placed.find(room =>
      intervalsOverlap(x, x + w, room.x, room.x + room.w) &&
      intervalsOverlap(y, y + h, room.y, room.y + room.h));
    if (overlap) return { error: 'room-overlap', names: [overlap.name, block.name] };
    rooms[index] = roomShape(block, x, y);
    placed.push(rooms[index]);
  }
  return { rooms, suggestedIndices };
}

function placeRoomBlocks(brief, { columns, x, y, setbacks, automatic, coordinates, fillMissing }, blocks, currentShapes = []) {
  const { frontage, depth } = cleanBrief(brief);
  if (!frontage || !depth) return { error: 'brief' };
  if (!blocks.length || blocks.length > 100 || blocks.some(({ name, w, h }) =>
    typeof name !== 'string' || !name.trim() ||
    ![w, h].every(value => Number.isFinite(value) && value > 0))) return { error: 'layout' };
  if (!automatic && !coordinates && (!Number.isInteger(columns) || columns < 1 || columns > blocks.length ||
      ![x, y].every(value => Number.isFinite(value) && value >= 0))) return { error: 'layout' };
  const lot = { left: 0, front: 0, right: frontage, rear: depth };
  let envelope = null;
  if (setbacks != null) {
    const offsets = cleanSetbacks(setbacks);
    if (!offsets || setbackSides.some(side => offsets[side] === null)) return { error: 'setbacks' };
    envelope = { left: offsets.left, front: offsets.front, right: frontage - offsets.right, rear: depth - offsets.rear };
    if (fits(envelope.right, envelope.left) || fits(envelope.rear, envelope.front)) return { error: 'setback-size' };
  }
  const bounds = envelope ?? lot;
  const outside = envelope ? 'outside-setbacks' : 'outside';
  const references = rectangularReferences(lot, 'SITE-LOT', 'حد الأرض');
  if (envelope) references.push(...rectangularReferences(envelope, 'SITE-LIMIT', 'حد مرجعي للتوزيع'));
  const site = { frontage, depth, envelope, references };
  if (coordinates) {
    const obstacles = fillMissing ? currentShapes.filter(shape => shape.type === 'room' &&
      intervalsOverlap(bounds.left, bounds.right, shape.x, shape.x + shape.w) &&
      intervalsOverlap(bounds.front, bounds.rear, shape.y, shape.y + shape.h)) : [];
    const placement = layoutWithCoordinates(blocks, bounds, outside, fillMissing, obstacles);
    return placement.error ? placement : { ...site, ...placement };
  }

  if (automatic) {
    x = bounds.left;
    y = bounds.front;
  } else if (!fits(bounds.left, x) || !fits(bounds.front, y)) {
    return { error: outside };
  }
  // Keep the supplied room order and try wider rows first.
  for (let candidate = automatic ? blocks.length : columns; candidate >= 1; candidate--) {
    const rooms = layoutRows(blocks, candidate, x, y, bounds);
    if (rooms) return { ...site, rooms, columns: candidate };
    if (!automatic) break;
  }
  return { error: automatic ? 'auto-fit' : outside };
}

export function bedroomBlockPlan(brief, layout) {
  const { frontage, depth, bedrooms } = cleanBrief(brief);
  if (!frontage || !depth || bedrooms === undefined) return { error: 'brief' };
  const { count, width, roomDepth } = layout;
  if (!Number.isInteger(count) || count < 1 || count > bedrooms) return { error: 'layout' };
  const blocks = Array.from({ length: count }, (_, index) => ({
    name: 'غرفة نوم ' + (index + 1), roomUse: 'bedroom', w: width, h: roomDepth,
  }));
  return placeRoomBlocks(brief, { ...layout, coordinates: false }, blocks);
}

export function customRoomBlockPlan(brief, layout, rooms, currentShapes) {
  const { bedrooms } = cleanBrief(brief);
  const count = rooms.filter(room => room.roomUse === 'bedroom').length;
  if (count && bedrooms === undefined) return { error: 'bedroom-count' };
  if (bedrooms !== undefined && count > bedrooms) return { error: 'bedroom-count' };
  return placeRoomBlocks(brief, layout, rooms, currentShapes);
}

const sameCoordinate = (a, b) => fits(a, b) && fits(b, a);

export function briefRoomEdges(rooms) {
  const edges = [];
  for (const horizontal of [true, false]) {
    const spans = rooms.flatMap(({ x, y, w, h }) => horizontal
      ? [{ axis: y, start: x, end: x + w }, { axis: y + h, start: x, end: x + w }]
      : [{ axis: x, start: y, end: y + h }, { axis: x + w, start: y, end: y + h }]);
    spans.sort((a, b) => a.axis - b.axis);
    const groups = [];
    for (const { axis, start, end } of spans) {
      if (end <= start) continue;
      let group = groups.at(-1);
      if (!group || !sameCoordinate(group.axis, axis)) {
        group = { axis, events: [] };
        groups.push(group);
      }
      group.events.push({ position: start, delta: 1 }, { position: end, delta: -1 });
    }
    for (const { axis, events } of groups) {
      const points = [];
      for (const { position, delta } of events.sort((a, b) => a.position - b.position)) {
        const last = points.at(-1);
        if (last && sameCoordinate(last.position, position)) last.delta += delta;
        else points.push({ position, delta });
      }
      let covering = 0;
      for (let index = 0; index < points.length - 1; index++) {
        const { position: start, delta } = points[index];
        covering += delta;
        if (covering <= 0) continue;
        const end = points[index + 1].position;
        edges.push({ type: 'cadLine', layer: 'CAD-REF', cadLayer: 'A-ROOM-EDGE',
          name: 'حد فراغ مرجعي ' + (edges.length + 1),
          x: horizontal ? start : axis, y: horizontal ? axis : start,
          x2: horizontal ? end : axis, y2: horizontal ? axis : end });
      }
    }
  }
  return edges;
}

export function briefPreviewDxf(plan) {
  const outlines = plan.roomEdges ?? plan.rooms.map(room => ({ ...room, layer: 'A-ROOM' }));
  return dxf([...plan.references, ...outlines]);
}

export function briefRoomSchedule(plan) {
  return plan.rooms.map((room, index) => {
    const areaM2 = area(room);
    const height = validHeight(room.z) ? room.z : null;
    return { number: index + 1, name: room.name, roomUse: room.roomUse,
      x: room.x, y: room.y, width: room.w, depth: room.h, height,
      areaM2, volumeM3: height === null ? null : areaM2 * height };
  });
}

const roomLabels = {
  bedroom: /^(?:غرفة نوم|bedroom|chambre)$/iu,
  living: /^(?:مجلس|صالة|غرفة طعام|living room|dining room|salon|séjour|salle à manger)$/iu,
  kitchen: /^(?:مطبخ|kitchen|cuisine)$/iu,
  bathroom: /^(?:حمام|حمّام|bathroom|salle de bains?)$/iu,
  toilet: /^(?:دورة مياه|مرحاض|toilet|toilettes?)$/iu,
  corridor: /^(?:ممر|hallway|corridor|couloir)$/iu,
};

export function cleanBriefRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  const dimension = value => Number.isFinite(value) && value > 0 && value <= 1e6 ? value : null;
  return rooms.slice(0, 100).flatMap(room => {
    if (typeof room?.name !== 'string' || !room.name.trim()) return [];
    return [{ name: room.name.trim().slice(0, 160), roomUse: residentialRoomMetadata(room.roomUse, false).roomUse,
      w: dimension(room.w), h: dimension(room.h),
      ...(validCoordinate(room.x) ? { x: room.x } : {}),
      ...(validCoordinate(room.y) ? { y: room.y } : {}),
      ...(validHeight(room.z) ? { z: room.z } : {}) }];
  });
}

const customRoomPrefix = /^(?:فراغ|space|espace)\s+/iu;
const roomDimensions = new RegExp(String.raw`^${metricPair}\.?$`, 'iu');

const roomClause = /^\s*(الموضع|موضع|position|الارتفاع|ارتفاع|height|hauteur)\s*:\s*(.*?)\s*$/iu;

export function extractBriefRooms(description) {
  const rooms = new Map();
  const positions = new Map();
  const heights = new Map();
  const unresolved = new Set();
  for (const line of description.slice(0, 4000).normalize('NFKC').split(/\r?\n/u)) {
    const [roomText, ...details] = line.split(/[;؛]/u);
    const clauses = details.map(part => roomClause.exec(part));
    if (clauses.some(clause => !clause)) continue;
    const [rawName, rawDimensions, ...extra] = roomText.split(':');
    if (rawDimensions === undefined || extra.length) continue;
    const label = normalizeNumericInput(rawName.replace(/^\s*[-•]\s*/u, ''));
    const custom = customRoomPrefix.test(label);
    const name = label.replace(customRoomPrefix, '').trim();
    if (!name || name.length > 160) continue;
    const key = name.toLowerCase().replace(/[\u064B-\u065F\u0670]/gu, '').replace(/\s+/gu, ' ');
    const kind = key.replace(/\s+\d+$/u, '').trim();
    const use = Object.keys(roomLabels).find(type => roomLabels[type].test(kind));
    if ((!use && !custom) || (!rooms.has(key) && rooms.size >= 100)) continue;

    for (const [, label, rawValue] of clauses) {
      const value = normalizeNumericInput(rawValue);
      if (/^(?:الارتفاع|ارتفاع|height|hauteur)$/iu.test(label)) {
        const match = standaloneLength.exec(value);
        const height = match ? metres(match[1], match[2]) : NaN;
        const previous = heights.get(key);
        heights.set(key, validHeight(height) && (previous === undefined || previous === height) ? height : null);
        continue;
      }
      const match = roomDimensions.exec(value);
      const pair = match && metresPair(match);
      const previous = positions.get(key);
      if (!pair?.every(validCoordinate) || previous === null ||
          (previous && (previous[0] !== pair[0] || previous[1] !== pair[1]))) positions.set(key, null);
      else positions.set(key, pair);
    }

    const dimensions = normalizeNumericInput(rawDimensions);
    const match = roomDimensions.exec(dimensions);
    const [w, h] = match ? metresPair(match) : [null, null];
    const [room] = cleanBriefRooms([{ name, roomUse: use, w, h }]);
    const complete = room.w !== null && room.h !== null;
    const prior = rooms.get(key);
    if (!complete && dimensions) unresolved.add(key);
    if (prior?.w != null && prior.h != null && complete && (prior.w !== room.w || prior.h !== room.h)) unresolved.add(key);
    if (!prior || (prior.w === null && complete)) rooms.set(key, room);
  }
  return [...rooms].map(([key, room]) => {
    const dimensions = unresolved.has(key) ? { ...room, w: null, h: null } : room;
    const [x, y] = positions.get(key) ?? [null, null];
    return { ...dimensions, ...(positions.has(key) ? { x, y } : {}),
      ...(heights.has(key) ? { z: heights.get(key) } : {}) };
  });
}
