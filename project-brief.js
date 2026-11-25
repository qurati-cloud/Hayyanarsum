import { dxf, normalizeNumericInput, residentialRoomMetadata } from './engine.js';

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
const metricUnit = String.raw`(?:متر|م|m(?:[eè]tres?|eters?)?)(?![\p{L}\p{M}\p{N}/^]|\s*(?:مربع(?:ة)?|مكعب(?:ة)?|carr[ée]s?|square|cub(?:ed|ic|es?))(?![\p{L}\p{M}\p{N}]))`;
const axisDimensions = {
  frontage: String.raw`(?:عرض (?:الأرض|الارض|الواجهة)|\bfrontage|largeur (?:du terrain|de façade))`,
  depth: String.raw`(?:عمق (?:الأرض|الارض)|\b(?:plot )?depth|profondeur(?: du terrain)?)`,
};
const plotPair = new RegExp(String.raw`^\s*(?:أبعاد الأرض|ابعاد الارض|lot dimensions|plot dimensions|dimensions du terrain)\s*:\s*${decimal}\s*(?:×|x|في|by|par)\s*${decimal}\s*${metricUnit}\.?\s*$`, 'gmu');

const countTerms = {
  storeys: /(?:طوابق|طابق|أدوار|ادوار|دور|storeys?|stories|floors?|étages?)/u,
  bedrooms: /(?:غرف(?:ة)? نوم|bedrooms?|chambres?)/u,
};
const countLabels = {
  storeys: /(?:عدد (?:الطوابق|الأدوار|الادوار)|(?:storey|floor) count|nombre d['’]étages)/u,
  bedrooms: /(?:عدد غرف النوم|bedroom count|nombre de chambres)/u,
};
const countValue = raw => Object.hasOwn(words, raw) ? words[raw] : /^\d+$/u.test(raw) ? Number(raw) : NaN;

export function extractBrief(description) {
  const source = normalizeNumericInput(description.slice(0, 4000).normalize('NFKC').toLowerCase()).replace(/[\u064B-\u065F\u0670]/gu, '');
  const candidates = Object.fromEntries(Object.keys(briefFields).map(key => [key, new Set()]));
  const add = (key, value) => {
    const clean = cleanBrief({ [key]: value });
    if (Object.hasOwn(clean, key)) candidates[key].add(clean[key]);
  };
  for (const [kind, pattern] of Object.entries(buildingPatterns)) if (pattern.test(source)) add('kind', kind);
  for (const [city, pattern] of Object.entries(cityNames)) if (pattern.test(source)) add('city', city);
  for (const [key, label] of Object.entries(axisDimensions)) {
    const explicit = new RegExp(String.raw`${label}\s*[:=]?\s*${decimal}\s*${metricUnit}`, 'gu');
    for (const match of source.matchAll(explicit)) add(key, Number(match[1].replace(',', '.')));
  }
  for (const match of source.matchAll(plotPair)) {
    add('frontage', Number(match[1].replace(',', '.')));
    add('depth', Number(match[2].replace(',', '.')));
  }
  for (const [key, term] of Object.entries(countTerms)) {
    const inline = new RegExp(String.raw`(?<![\p{L}\p{M}\p{N}.,+−-])(?:(?:وب?|ب)(?=\d|أربع|اربع|ثلاث|خمس))?(\d+|[\p{L}]+)[ \t]*${term.source}(?![\p{L}\p{M}\p{N}]|[ \t]+count\b)`, 'gu');
    for (const match of source.matchAll(inline)) {
      const prefix = source.slice(Math.max(0, match.index - 30), match.index);
      if (/\d[ \t]*(?:[-–—]|to|or|à|ou|إلى|أو)[ \t]*$/u.test(prefix)) continue;
      add(key, countValue(match[1]));
    }
    const labeled = new RegExp(String.raw`^\s*${countLabels[key].source}\s*:\s*(\d+|[\p{L}]+)\.?\s*$`, 'gmu');
    for (const match of source.matchAll(labeled)) add(key, countValue(match[1]));
  }
  if (/(?:^|[^\p{L}])(?:طابقان|طابقين|دوران|دورين)(?![\p{L}])/u.test(source)) add('storeys', 2);
  if (/(?:^|[^\p{L}])(?:غرفتا نوم|غرفتي نوم)(?![\p{L}])/u.test(source)) add('bedrooms', 2);

  const data = {}, conflicts = [];
  for (const [key, options] of Object.entries(candidates)) {
    if (options.size === 1) data[key] = [...options][0];
    else if (options.size > 1) conflicts.push(key);
  }
  return { data, conflicts };
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
    const metric = /^(\d+(?:[.,]\d+)?)\s*(?:م|متر|m|m[eè]tres?|meters?)\.?$/iu.exec(normalizeNumericInput(match[2]));
    const value = metric ? Number(metric[1].replace(',', '.')) : NaN;
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

function roomShape({ name, w, h, roomUse }, x, y) {
  return { type: 'room', layer: 'A-WALL', name: name.trim().slice(0, 160),
    ...residentialRoomMetadata(roomUse, false), x, y, w, h, z: null };
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

function layoutWithCoordinates(blocks, bounds, outside) {
  const rooms = [];
  for (const block of blocks) {
    const { x, y, w, h } = block;
    const right = x + w, rear = y + h;
    if (!validCoordinate(x) || !validCoordinate(y) || right <= x || rear <= y) {
      return { error: 'coordinates', names: [block.name] };
    }
    if (!fits(bounds.left, x) || !fits(bounds.front, y) || !fits(right, bounds.right) || !fits(rear, bounds.rear)) {
      return { error: outside, names: [block.name] };
    }
    const overlap = rooms.find(room =>
      !fits(right, room.x) && !fits(room.x + room.w, x) &&
      !fits(rear, room.y) && !fits(room.y + room.h, y));
    if (overlap) return { error: 'room-overlap', names: [overlap.name, block.name] };
    rooms.push(roomShape(block, x, y));
  }
  return { rooms };
}

function placeRoomBlocks(brief, { columns, x, y, setbacks, automatic, coordinates }, blocks) {
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
    const placement = layoutWithCoordinates(blocks, bounds, outside);
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

export function customRoomBlockPlan(brief, layout, rooms) {
  const { bedrooms } = cleanBrief(brief);
  const count = rooms.filter(room => room.roomUse === 'bedroom').length;
  if (count && bedrooms === undefined) return { error: 'bedroom-count' };
  if (bedrooms !== undefined && count > bedrooms) return { error: 'bedroom-count' };
  return placeRoomBlocks(brief, layout, rooms);
}

export function briefPreviewDxf(plan) {
  const outlines = plan.rooms.map(room => ({ ...room, layer: 'A-ROOM' }));
  return dxf([...plan.references, ...outlines]);
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
      ...(validCoordinate(room.y) ? { y: room.y } : {}) }];
  });
}

const customRoomPrefix = /^(?:فراغ|space|espace)\s+/iu;
const roomDimensions = new RegExp('^' + decimal + String.raw`\s*(?:×|x|في|par|by)\s*` +
  decimal + String.raw`\s*` + metricUnit + '\\.?$', 'iu');

export function extractBriefRooms(description) {
  const rooms = new Map();
  const unresolved = new Set();
  for (const line of description.slice(0, 4000).normalize('NFKC').split(/\r?\n/u)) {
    const [rawName, rawDimensions, ...extra] = line.split(':');
    if (rawDimensions === undefined || extra.length) continue;
    const label = normalizeNumericInput(rawName.replace(/^\s*[-•]\s*/u, ''));
    const custom = customRoomPrefix.test(label);
    const name = label.replace(customRoomPrefix, '').trim();
    if (!name || name.length > 160) continue;
    const key = name.toLowerCase().replace(/[\u064B-\u065F\u0670]/gu, '').replace(/\s+/gu, ' ');
    const kind = key.replace(/\s+\d+$/u, '').trim();
    const use = Object.keys(roomLabels).find(type => roomLabels[type].test(kind));
    if ((!use && !custom) || (!rooms.has(key) && rooms.size >= 100)) continue;

    const dimensions = normalizeNumericInput(rawDimensions);
    const match = roomDimensions.exec(dimensions);
    const [room] = cleanBriefRooms([{ name, roomUse: use,
      w: match ? Number(match[1].replace(',', '.')) : null, h: match ? Number(match[2].replace(',', '.')) : null }]);
    const complete = room.w !== null && room.h !== null;
    const prior = rooms.get(key);
    if (!complete && dimensions) unresolved.add(key);
    if (prior?.w != null && prior.h != null && complete && (prior.w !== room.w || prior.h !== room.h)) unresolved.add(key);
    if (!prior || (prior.w === null && complete)) rooms.set(key, room);
  }
  return [...rooms].map(([key, room]) => unresolved.has(key) ? { ...room, w: null, h: null } : room);
}
