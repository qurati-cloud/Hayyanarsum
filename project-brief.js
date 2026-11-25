import { normalizeNumericInput, residentialRoomMetadata } from './engine.js';

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

export function extractBrief(description) {
  const source = normalizeNumericInput(description.slice(0, 4000).normalize('NFKC').toLowerCase()).replace(/[\u064B-\u065F\u0670]/gu, '');
  const candidates = Object.fromEntries(Object.keys(briefFields).map(key => [key, new Set()]));
  const add = (key, value) => {
    const clean = cleanBrief({ [key]: value });
    if (Object.hasOwn(clean, key)) candidates[key].add(clean[key]);
  };
  for (const [kind, pattern] of Object.entries(buildingPatterns)) if (pattern.test(source)) add('kind', kind);
  for (const [city, pattern] of Object.entries(cityNames)) if (pattern.test(source)) add('city', city);
  for (const match of source.matchAll(/(?:عرض (?:الأرض|الارض|الواجهة)|frontage|largeur (?:du terrain|de façade))\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:متر|م(?=$|\s|[،,.؛])|m(?:ètres?|eters?)?\b)/giu)) {
    add('frontage', Number(match[1].replace(',', '.')));
  }
  for (const match of source.matchAll(/(?:عمق (?:الأرض|الارض)|(?:plot )?depth|profondeur(?: du terrain)?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:متر|م(?=$|\s|[،,.؛])|m(?:ètres?|eters?)?\b)/giu)) {
    add('depth', Number(match[1].replace(',', '.')));
  }
  const count = raw => Object.hasOwn(words, raw) ? words[raw] : Number(raw);
  for (const match of source.matchAll(/(?:^|[^\p{L}\p{N}.,+−-])([\p{L}]+|\d+)\s*(?:طوابق|طابق|أدوار|ادوار|دور|storeys?|stories|floors?|étages?)(?![\p{L}])/giu)) {
    add('storeys', count(match[1]));
  }
  for (const match of source.matchAll(/(?:^|[^\p{L}\p{N}.,+−-])([\p{L}]+|\d+)\s*(?:غرف(?:ة)? نوم|bedrooms?|chambres?)(?![\p{L}])/giu)) {
    add('bedrooms', count(match[1].replace(/^ب(?=أربع|اربع|ثلاث|خمس)/u, '')));
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

function layoutRows(blocks, columns, x, y, bounds, fits) {
  const rooms = [];
  let top = y;
  for (let start = 0; start < blocks.length; start += columns) {
    const row = blocks.slice(start, start + columns);
    let left = x, rowHeight = 0;
    for (const block of row) {
      const { name, w, h, roomUse } = block;
      if (!fits(left + w, bounds.right) || !fits(top + h, bounds.rear)) return null;
      rooms.push({ type: 'room', layer: 'A-WALL', name: name.trim().slice(0, 160),
        ...residentialRoomMetadata(roomUse, false), x: left, y: top, w, h, z: null });
      left += w;
      rowHeight = Math.max(rowHeight, h);
    }
    top += rowHeight;
  }
  return rooms;
}

function placeRoomBlocks(brief, { columns, x, y, setbacks, automatic }, blocks) {
  const { frontage, depth } = cleanBrief(brief);
  if (!frontage || !depth) return { error: 'brief' };
  if (!blocks.length || blocks.length > 100 || blocks.some(({ name, w, h }) =>
    typeof name !== 'string' || !name.trim() ||
    ![w, h].every(value => Number.isFinite(value) && value > 0))) return { error: 'layout' };
  if (!automatic && (!Number.isInteger(columns) || columns < 1 || columns > blocks.length ||
      ![x, y].every(value => Number.isFinite(value) && value >= 0))) return { error: 'layout' };
  const fits = (used, available) => used <= available + Math.abs(available) * Number.EPSILON * 4;
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
  if (automatic) {
    x = bounds.left;
    y = bounds.front;
  } else if (!fits(bounds.left, x) || !fits(bounds.front, y)) {
    return { error: outside };
  }

  // Keep the supplied room order and try wider rows first.
  let rooms = null;
  for (let candidate = automatic ? blocks.length : columns; candidate >= 1; candidate--) {
    rooms = layoutRows(blocks, candidate, x, y, bounds, fits);
    if (rooms || !automatic) {
      columns = candidate;
      break;
    }
  }
  if (!rooms) return { error: automatic ? 'auto-fit' : outside };
  const references = rectangularReferences(lot, 'SITE-LOT', 'حد الأرض');
  if (envelope) references.push(...rectangularReferences(envelope, 'SITE-LIMIT', 'حد مرجعي للتوزيع'));
  return { frontage, depth, envelope, references, rooms, columns };
}

export function bedroomBlockPlan(brief, layout) {
  const { frontage, depth, bedrooms } = cleanBrief(brief);
  if (!frontage || !depth || bedrooms === undefined) return { error: 'brief' };
  const { count, width, roomDepth } = layout;
  if (!Number.isInteger(count) || count < 1 || count > bedrooms) return { error: 'layout' };
  const blocks = Array.from({ length: count }, (_, index) => ({
    name: 'غرفة نوم ' + (index + 1), roomUse: 'bedroom', w: width, h: roomDepth,
  }));
  return placeRoomBlocks(brief, layout, blocks);
}

export function customRoomBlockPlan(brief, layout, rooms) {
  const { bedrooms } = cleanBrief(brief);
  const count = rooms.filter(room => room.roomUse === 'bedroom').length;
  if (count && bedrooms === undefined) return { error: 'bedroom-count' };
  if (bedrooms !== undefined && count > bedrooms) return { error: 'bedroom-count' };
  return placeRoomBlocks(brief, layout, rooms);
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
      w: dimension(room.w), h: dimension(room.h) }];
  });
}

export function extractBriefRooms(description) {
  const rooms = new Map();
  const conflicts = new Set();
  for (const line of description.slice(0, 4000).split(/\r?\n/u)) {
    const [rawName, rawDimensions, ...extra] = line.split(/[:：]/u);
    if (rawDimensions === undefined || extra.length) continue;
    const name = normalizeNumericInput(rawName.trim().replace(/^[-•]\s*/u, ''));
    const key = name.toLowerCase().replace(/[\u064B-\u065F\u0670]/gu, '');
    const kind = key.replace(/\s+\d+$/u, '').trim();
    const use = Object.keys(roomLabels).find(type => roomLabels[type].test(kind));
    if (!use || (!rooms.has(key) && rooms.size >= 100)) continue;
    const match = /^([0-9]+(?:[.,][0-9]+)?)\s*(?:×|x|في|par|by)\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:م|متر|m|mètres?|meters?)$/iu.exec(normalizeNumericInput(rawDimensions));
    const [room] = cleanBriefRooms([{ name, roomUse: use,
      w: match ? Number(match[1].replace(',', '.')) : null, h: match ? Number(match[2].replace(',', '.')) : null }]);
    const prior = rooms.get(key);
    if (!prior || (!prior.w && room.w)) rooms.set(key, room);
    else if (prior.w && room.w && (prior.w !== room.w || prior.h !== room.h)) conflicts.add(key);
  }
  return [...rooms].map(([key, room]) => conflicts.has(key) ? { ...room, w: null, h: null } : room);
}
