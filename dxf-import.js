import { valid } from './engine.js';

const metresPerUnit = { 1: .0254, 2: .3048, 4: .001, 5: .01, 6: 1 };
export const dxfUnitLabels = { 1: 'بوصة', 2: 'قدم', 4: 'مليمتر', 5: 'سنتيمتر', 6: 'متر' };
export const maximumDxfBytes = 5 * 1024 * 1024;

function groups(text) {
  if (text.length > maximumDxfBytes || text.includes('\0')) throw new Error('format');
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length % 2) throw new Error('format');
  const records = [];
  for (let index = 0; index < lines.length; index += 2) {
    const code = lines[index].trim();
    if (!/^\d{1,4}$/.test(code)) throw new Error('format');
    if (code === '999') continue;
    records.push([Number(code), lines[index + 1].trim()]);
  }
  return records;
}

function modelEntities(records) {
  let section = '';
  let seenEntities = false;
  let unit = null;
  let entity;
  const list = [];
  for (let index = 0; index < records.length; index++) {
    const [code, value] = records[index];
    if (code === 0 && value === 'EOF') {
      if (section || !seenEntities || index !== records.length - 1) throw new Error('format');
      return { list, unit };
    }
    if (code === 0 && value === 'SECTION') {
      if (section || records[index + 1]?.[0] !== 2) throw new Error('format');
      section = records[++index][1];
      if (!section || (section === 'ENTITIES' && seenEntities)) throw new Error('format');
      seenEntities ||= section === 'ENTITIES';
    } else if (code === 0 && value === 'ENDSEC') {
      if (!section) throw new Error('format');
      section = '';
    } else if (section === 'HEADER' && code === 9 && value === '$INSUNITS' && records[index + 1]?.[0] === 70) {
      unit = Number(records[index + 1][1]);
    } else if (section === 'ENTITIES') {
      if (code === 0) {
        entity = { type: value, data: [] };
        list.push(entity);
      } else if (entity) entity.data.push([code, value]);
      else throw new Error('format');
    }
  }
  throw new Error('format');
}

const decimal = raw => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/.test(raw) ? Number(raw) : NaN;

function segments({ type, data }, scale) {
  const group = code => data.find(record => record[0] === code)?.[1];
  const value = (code, fallback = NaN) => {
    const raw = group(code);
    return raw === undefined ? fallback : decimal(raw);
  };
  if (value(67, 0) !== 0 || (group(410) && group(410).toUpperCase() !== 'MODEL') ||
      value(39, 0) !== 0 || value(210, 0) !== 0 || value(220, 0) !== 0 || value(230, 1) !== 1) return [];
  const cadLayer = (group(8) || '0').slice(0, 160);
  const make = (a, b) => ({
    type: 'cadLine', layer: 'CAD-REF', cadLayer, name: 'خط DXF · ' + cadLayer,
    x: a[0] * scale, y: -a[1] * scale, x2: b[0] * scale, y2: -b[1] * scale,
  });
  if (type === 'LINE') {
    return value(30, 0) === 0 && value(31, 0) === 0
      ? [make([value(10), value(20)], [value(11), value(21)])] : [];
  }
  if (type !== 'LWPOLYLINE' || value(38, 0) !== 0 ||
      data.some(([code, raw]) => [40, 41, 42, 43].includes(code) && decimal(raw) !== 0)) return [];
  const vertices = [];
  for (const [code, raw] of data) {
    if (code === 10) vertices.push([decimal(raw)]);
    if (code === 20) {
      if (vertices.at(-1)?.length !== 1) return [];
      vertices.at(-1).push(decimal(raw));
    }
  }
  if (vertices.length < 2 || vertices.length !== value(90) || vertices.some(point => point.length !== 2)) return [];
  const edges = vertices.slice(1).map((point, index) => make(vertices[index], point));
  if (value(70, 0) & 1) edges.push(make(vertices.at(-1), vertices[0]));
  return edges;
}

export function readDxf(text, fallbackUnit, limit = 5000) {
  const { list, unit } = modelEntities(groups(text));
  const selectedUnit = unit === 0 || unit === null ? fallbackUnit : unit;
  const scale = metresPerUnit[selectedUnit];
  if (!scale) throw new Error(unit === 0 || unit === null ? 'unit-required' : 'unit-unsupported');
  const lines = [];
  let skipped = 0;
  for (const entity of list) {
    if (entity.type !== 'LINE' && entity.type !== 'LWPOLYLINE') {
      skipped++;
      continue;
    }
    const edges = segments(entity, scale);
    if (!edges.length || !edges.every(valid)) {
      skipped++;
      continue;
    }
    if (lines.length + edges.length > limit) throw new Error('limit');
    for (const edge of edges) lines.push(edge);
  }
  return { lines, skipped, unit: Number(selectedUnit) };
}
