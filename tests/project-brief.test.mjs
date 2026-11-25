import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanBrief, extractBrief, missingBriefFields } from '../project-brief.js';

test('extracts explicitly named Arabic inputs, including dual storeys and decimal metres', () => {
  const { data, conflicts } = extractBrief('فيلا في الرياض من طابقين بأربع غرف نوم. عرض الأرض ٢٠٫٥ متر، وعمق الأرض ٣٠ م.');
  assert.deepEqual(data, { kind: 'villa', city: 'الرياض', frontage: 20.5, depth: 30, storeys: 2, bedrooms: 4 });
  assert.deepEqual(conflicts, []);
  assert.deepEqual(missingBriefFields(data), []);
});

test('recognises limited English and French patterns and asks for fields left out', () => {
  assert.deepEqual(extractBrief('House in Jeddah with 2 storeys and four bedrooms. Frontage 20 m.').data,
    { kind: 'house', city: 'جدة', frontage: 20, storeys: 2, bedrooms: 4 });
  const { data } = extractBrief('Maison à Riyad, deux étages et trois chambres. Profondeur du terrain 30,5 mètres.');
  assert.deepEqual(data, { kind: 'house', city: 'الرياض', depth: 30.5, storeys: 2, bedrooms: 3 });
  assert.deepEqual(missingBriefFields(data), ['frontage']);
});

test('contradictory sizes remain blank and unlabeled or unsupported units are ignored', () => {
  const result = extractBrief('فيلا. عرض الأرض ٢٠ متر. عرض الأرض ٢٥ متر. عمق الأرض ٩٨ قدم. مجلس ٦ × ٨ م.');
  assert.deepEqual(result.conflicts, ['frontage']);
  assert.deepEqual(result.data, { kind: 'villa' });
  assert.deepEqual(cleanBrief({ kind: '__proto__', city: '', depth: -1, bedrooms: 0, storeys: 1.5 }), { bedrooms: 0 });
});

test('bedroom preview packs supplied dimensions without exceeding the site', async () => {
  const { bedroomBlockPlan } = await import('../project-brief.js');
  const brief = { frontage: 20, depth: 30, bedrooms: 4 };
  const layout = { count: 3, columns: 2, width: 4, roomDepth: 5, x: 2, y: 3 };
  const plan = bedroomBlockPlan(brief, layout);
  assert.equal(plan.references.length, 4);
  assert.deepEqual(plan.rooms.map(({ x, y, w, h }) => [x, y, w, h]), [[2, 3, 4, 5], [6, 3, 4, 5], [2, 8, 4, 5]]);
  assert.ok(plan.rooms.every(room => room.roomUse === 'bedroom' && !room.clearRoom));
  assert.equal(bedroomBlockPlan(brief, { ...layout, x: 13 }).error, 'outside');
  assert.equal(bedroomBlockPlan(brief, { ...layout, y: 21 }).error, 'outside');
  assert.equal(bedroomBlockPlan(brief, { ...layout, count: 5 }).error, 'layout');
  assert.equal(bedroomBlockPlan({ ...brief, depth: null }, layout).error, 'brief');
});

test('mixed-use rooms advance rows by the deepest previous room', async () => {
  const { customRoomBlockPlan } = await import('../project-brief.js');
  const rooms = [
    { name: 'مجلس', roomUse: 'living', w: 4.5, h: 6 },
    { name: 'مطبخ', roomUse: 'kitchen', w: 3.5, h: 3 },
    { name: 'حمّام', roomUse: 'bathroom', w: 2, h: 2 },
  ];
  const brief = { frontage: 10, depth: 8 };
  const layout = { columns: 2, x: 1, y: 0 };
  const result = customRoomBlockPlan(brief, layout, rooms);
  assert.deepEqual(result.rooms.map(({ x, y, w, h }) => [x, y, w, h]),
    [[1, 0, 4.5, 6], [5.5, 0, 3.5, 3], [1, 6, 2, 2]]);
  assert.equal(result.rooms[1].roomUse, 'kitchen');
  assert.equal(result.rooms[1].clearRoom, false);
  assert.equal(customRoomBlockPlan({ ...brief, depth: 7.9 }, layout, rooms).error, 'outside');
  const withBedroom = [...rooms, { name: 'غرفة', roomUse: 'bedroom', w: 3, h: 2 }];
  assert.equal(customRoomBlockPlan(brief, layout, withBedroom).error, 'bedroom-count');
  assert.equal(customRoomBlockPlan({ ...brief, bedrooms: 0 }, layout, withBedroom).error, 'bedroom-count');
  assert.equal(customRoomBlockPlan({ ...brief, bedrooms: 1 }, layout, withBedroom).rooms.length, 4);
});

test('explicit room lines populate types and metric dimensions while leaving missing or conflicting sizes blank', async () => {
  const { extractBriefRooms } = await import('../project-brief.js');
  const rooms = extractBriefRooms('عرض الأرض: ٢٠ م\nمجلس: ٤٫٥ × ٦ م\nمطبخ:\nBedroom 2: 3 x 4 m\nCuisine: 2,5 par 3 mètres\nحمام: ٢ × ٢ م\nحمام: ٢ × ٣ م\nCorridor: 5 x 6 ft');
  assert.deepEqual(rooms, [
    { name: 'مجلس', roomUse: 'living', w: 4.5, h: 6 },
    { name: 'مطبخ', roomUse: 'kitchen', w: null, h: null },
    { name: 'Bedroom 2', roomUse: 'bedroom', w: 3, h: 4 },
    { name: 'Cuisine', roomUse: 'kitchen', w: 2.5, h: 3 },
    { name: 'حمام', roomUse: 'bathroom', w: null, h: null },
    { name: 'Corridor', roomUse: 'corridor', w: null, h: null },
  ]);
});

test('user-entered setbacks bound the room arrangement and create a separate DXF reference layer', async () => {
  const { customRoomBlockPlan } = await import('../project-brief.js');
  const { dxf } = await import('../engine.js');
  const brief = { frontage: 10, depth: 14 };
  const layout = { columns: 1, x: 2, y: 3, setbacks: { left: 2, right: 1, front: 3, rear: 2 } };
  const rooms = [{ name: 'مجلس', roomUse: 'living', w: 7, h: 9 }];
  const plan = customRoomBlockPlan(brief, layout, rooms);
  assert.deepEqual(plan.envelope, { left: 2, front: 3, right: 9, rear: 12 });
  const limits = plan.references.filter(line => line.cadLayer === 'SITE-LIMIT');
  assert.deepEqual(limits.map(({ x, y, x2, y2 }) => [x, y, x2, y2]),
    [[2, 3, 9, 3], [9, 3, 9, 12], [9, 12, 2, 12], [2, 12, 2, 3]]);
  assert.match(dxf(plan.references), /SITE-LIMIT/);
  for (const [x, y] of [[1.9, 3], [2, 2.9], [2.1, 3], [2, 3.1]]) {
    assert.equal(customRoomBlockPlan(brief, { ...layout, x, y }, rooms).error, 'outside-setbacks');
  }
});

test('setbacks require all four distances and accept explicit zero', async () => {
  const { bedroomBlockPlan, cleanSetbacks } = await import('../project-brief.js');
  const brief = { frontage: 10, depth: 14, bedrooms: 1 };
  const layout = { columns: 1, x: 0, y: 0, count: 1, width: 10, roomDepth: 14 };
  const zeros = { left: 0, right: 0, front: 0, rear: 0 };
  assert.deepEqual(cleanSetbacks({ ...zeros, front: '' }), { ...zeros, front: null });
  assert.equal(bedroomBlockPlan(brief, { ...layout, setbacks: zeros }).rooms.length, 1);
  assert.equal(bedroomBlockPlan(brief, { ...layout, setbacks: { ...zeros, left: -1 } }).error, 'setbacks');
  assert.equal(bedroomBlockPlan(brief, { ...layout, setbacks: { ...zeros, front: undefined } }).error, 'setbacks');
  assert.equal(bedroomBlockPlan(brief, { ...layout, setbacks: { ...zeros, left: 5, right: 5 } }).error, 'setback-size');
  assert.equal(bedroomBlockPlan(brief, { ...layout, setbacks: { ...zeros, rear: 20 } }).error, 'setback-size');
});
