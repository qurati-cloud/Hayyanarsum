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

test('automatic placement finds a narrower row configuration inside the supplied setbacks', async () => {
  const { customRoomBlockPlan } = await import('../project-brief.js');
  const brief = { frontage: 13, depth: 13 };
  const layout = { automatic: true, setbacks: { left: 2, right: 3, front: 3, rear: 2 } };
  const rooms = [
    { name: 'مجلس', w: 5, h: 5 },
    { name: 'مطبخ', w: 3, h: 3 },
    { name: 'مدخل', w: 4, h: 3 },
  ];
  const plan = customRoomBlockPlan(brief, layout, rooms);
  assert.equal(plan.columns, 2);
  assert.deepEqual(plan.rooms.map(({ name, x, y, w, h }) => [name, x, y, w, h]),
    [['مجلس', 2, 3, 5, 5], ['مطبخ', 7, 3, 3, 3], ['مدخل', 2, 8, 4, 3]]);
  assert.equal(customRoomBlockPlan({ ...brief, depth: 12.99 }, layout, rooms).error, 'auto-fit');
  assert.equal(customRoomBlockPlan(brief, layout, [{ ...rooms[0], h: null }]).error, 'layout');
  assert.equal(customRoomBlockPlan(brief, { ...layout, automatic: false }, rooms).error, 'layout');
});

test('automatic placement with explicit dimensions starts at the lot origin when setbacks are disabled', async () => {
  const { bedroomBlockPlan } = await import('../project-brief.js');
  const plan = bedroomBlockPlan({ frontage: 8, depth: 8, bedrooms: 2 },
    { automatic: true, count: 2, width: 4, roomDepth: 3 });
  assert.equal(plan.columns, 2);
  assert.deepEqual(plan.rooms.map(({ x, y }) => [x, y]), [[0, 0], [4, 0]]);
  assert.equal(plan.references.length, 4);
});

test('explicit setback lines extract metres in Arabic, English and French including zero', async () => {
  const { extractBriefSetbacks } = await import('../project-brief.js');
  const expected = { left: 0, right: 1.5, front: 3, rear: 2 };
  for (const description of [
    'الارتداد الأمامي: ٣ م\nالارتداد الخلفي: ۲ متر\n- الارتداد الأيسر: ٠ م\nارتداد أيمن: ١٫٥ م',
    'Front setback: 3 m.\nBack setback: 2 meters\nLeft setback: 0 m\nRight setback: 1.5 m',
    'Recul avant: 3 m\r\nRetrait arrière: 2 mètres\r\nRecul gauche: 0 m\r\nRecul droit: 1,5 mètre',
  ]) {
    assert.deepEqual(extractBriefSetbacks(description), { setbacks: expected, conflicts: [], invalid: [] });
  }
  assert.equal(extractBriefSetbacks('the parcel has a left setback of 3m').setbacks, null);
});

test('setbacks stay unresolved for missing, conflicting and unsupported values', async () => {
  const { extractBriefSetbacks, customRoomBlockPlan } = await import('../project-brief.js');
  const extracted = extractBriefSetbacks(
    'Front setback: 3 m\nRecul avant: 4 m\nBack setback: 12 ft\nLeft setback:\nRight setback: 0 m\nRight setback: 0.0 m',
  );
  assert.deepEqual(extracted, { setbacks: { left: null, right: 0, front: null, rear: null },
    conflicts: ['front'], invalid: ['rear'] });
  for (const bad of ['-2 m', '2–3 m', '3', '3 m or 4 m', '1000001 m']) {
    const result = extractBriefSetbacks('Front setback: 3 m\nFront setback: ' + bad);
    assert.equal(result.setbacks.front, null);
    assert.deepEqual(result.invalid, ['front']);
  }
  const brief = { frontage: 12, depth: 15 };
  const room = { name: 'مجلس', w: 5, h: 6 };
  assert.equal(customRoomBlockPlan(brief, { automatic: true, setbacks: extracted.setbacks }, [room]).error, 'setbacks');
  const plan = customRoomBlockPlan(brief, {
    automatic: true, setbacks: { ...extracted.setbacks, front: 4, rear: 2, left: 1 },
  }, [room]);
  assert.deepEqual(plan.envelope, { left: 1, front: 4, right: 12, rear: 13 });
  assert.deepEqual([plan.rooms[0].x, plan.rooms[0].y], [1, 4]);
});

test('whole-line lot dimensions and explicit counts work in Arabic, English and French', () => {
  const expected = { frontage: 20.5, depth: 30, storeys: 2, bedrooms: 4 };
  assert.deepEqual(extractBrief('أبعاد الأرض: ٢٠٫٥ × ٣٠ متر\nعدد الطوابق: ٢\nعدد غرف النوم: ٤').data, expected);
  assert.deepEqual(extractBrief('Plot dimensions: 20.5 by 30 meters.\nFloor count: 2\nBedroom count: four').data, expected);
  assert.deepEqual(extractBrief('Dimensions du terrain : 20,5 par 30 mètres\r\nNombre d’étages : deux\r\nNombre de chambres : 4').data, expected);
  assert.deepEqual(extractBrief('فيلا في الرياض من طابقين و٤ غرف نوم.').data,
    { kind: 'villa', city: 'الرياض', storeys: 2, bedrooms: 4 });
  assert.deepEqual(extractBrief('فيلا في الرياض ب٢ طوابق وبأربع غرف نوم.').data,
    { kind: 'villa', city: 'الرياض', storeys: 2, bedrooms: 4 });
});

test('paired and standalone dimensions share conflict detection and require linear units', () => {
  const result = extractBrief('أبعاد الأرض: ٢٠ × ٣٠ م\nعرض الأرض: ٢٥ م\nعدد غرف النوم: ٢\nبيت بأربع غرف نوم.');
  assert.deepEqual(result, { data: { kind: 'house', depth: 30 }, conflicts: ['frontage', 'bedrooms'] });
  for (const description of [
    'أبعاد الأرض: ٢٠ × ٣٠ م²', 'أبعاد الأرض: ٢٠ × ٣٠ م مربع', 'عرض الأرض: 20 متر مربع',
    'Plot dimensions: 20 × 30 ft', 'Frontage: 20 m²', 'Depth: 30 m^3',
    'Dimensions du terrain : 20 × 30 mètres carrés', 'أبعاد الأرض: ٢٠ × ٣٠ بدون وحدة',
    '3.5 bedrooms', '2 - 3 storeys', '3 to 4 bedrooms', '2 à 4 chambres',
  ]) assert.deepEqual(extractBrief(description).data, {}, description);
});

test('explicit custom room prefixes keep names and dimensions without inferring a use', async () => {
  const { extractBriefRooms, customRoomBlockPlan } = await import('../project-brief.js');
  const rooms = extractBriefRooms(
    'أبعاد الأرض: ١٠ × ١٢ م\nفراغ مخزن الحديقة: ٢٫٥ × ٣ م\nSpace Laundry: 2 by 2 meters\nEspace Atelier : 3 par 4 mètres\nالمقاول: أحمد',
  );
  assert.deepEqual(rooms, [
    { name: 'مخزن الحديقة', roomUse: '', w: 2.5, h: 3 },
    { name: 'Laundry', roomUse: '', w: 2, h: 2 },
    { name: 'Atelier', roomUse: '', w: 3, h: 4 },
  ]);
  const plan = customRoomBlockPlan({ frontage: 10, depth: 12 }, { automatic: true }, rooms);
  assert.deepEqual(plan.rooms.map(({ name, x, y, w, h }) => [name, x, y, w, h]),
    [['مخزن الحديقة', 0, 0, 2.5, 3], ['Laundry', 2.5, 0, 2, 2], ['Atelier', 4.5, 0, 3, 4]]);
});

test('a named room is kept for review when its dimensions are missing, inconsistent, or use an unsupported unit', async () => {
  const { extractBriefRooms, customRoomBlockPlan } = await import('../project-brief.js');
  const rooms = extractBriefRooms(
    'فراغ مخزن:\nSpace Laundry: 2 × 3 m\nSpace Laundry: 2 × 4 m\nEspace Atelier: 3 × 4 m²\nEspace Atelier: 3 × 4 m\nSpace Bedroom 1: 4 × 5 m',
  );
  assert.deepEqual(rooms, [
    { name: 'مخزن', roomUse: '', w: null, h: null },
    { name: 'Laundry', roomUse: '', w: null, h: null },
    { name: 'Atelier', roomUse: '', w: null, h: null },
    { name: 'Bedroom 1', roomUse: 'bedroom', w: 4, h: 5 },
  ]);
  assert.equal(customRoomBlockPlan({ frontage: 10, depth: 12, bedrooms: 1 }, { automatic: true }, rooms).error, 'layout');
});

test('the preview exports metric room and lot outlines without mutating the plan', async () => {
  const { briefPreviewDxf, customRoomBlockPlan } = await import('../project-brief.js');
  const { readDxf } = await import('../dxf-import.js');
  const plan = customRoomBlockPlan({ frontage: 10, depth: 12 },
    { columns: 1, x: 1.25, y: 2.5 }, [{ name: 'مطبخ', roomUse: 'kitchen', w: 3.5, h: 2.25 }]);
  const result = readDxf(briefPreviewDxf(plan));
  assert.equal(result.lines.length, 8);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.lines.map(line => line.cadLayer), [
    'SITE-LOT', 'SITE-LOT', 'SITE-LOT', 'SITE-LOT', 'A-ROOM', 'A-ROOM', 'A-ROOM', 'A-ROOM',
  ]);
  assert.deepEqual(result.lines.filter(line => line.cadLayer === 'A-ROOM')
    .map(({ x, y, x2, y2 }) => [x, y, x2, y2]),
    [[1.25, 2.5, 4.75, 2.5], [4.75, 2.5, 4.75, 4.75],
     [4.75, 4.75, 1.25, 4.75], [1.25, 4.75, 1.25, 2.5]]);
  assert.equal(plan.rooms[0].layer, 'A-WALL');
});
