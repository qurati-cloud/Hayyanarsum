import test from 'node:test';
import assert from 'node:assert/strict';
import { snap, totalArea, slabArea, slabNetArea, slabParts, slabVolume, length, compliance, dxf, valid, roomProjection, wallParts, wallQuantities } from '../engine.js';

test('slab openings change plan, solids and quantities and cannot overlap or cross an edge', () => {
  const opening = { name:'درج', x:1, y:1.5, w:1, h:2 };
  const slab = { type:'slab', x:1, y:2, w:4, h:5, z:.2, cutouts:[opening] };
  assert.ok(valid(slab));
  assert.equal(slabNetArea(slab), 18);
  assert.equal(slabVolume(slab), 3.6);
  assert.equal(slabParts(slab).reduce((sum, part) => sum +
    (part.base[1][0] - part.base[0][0]) * (part.base[3][1] - part.base[0][1]), 0), 18);
  assert.match(dxf([slab]), /S-OPEN/);
  assert.equal(valid({ ...slab, w:2 }), false);
  assert.equal(valid({ ...slab, cutouts:[opening, { ...opening, x:1.5 }] }), false);
});

test('slab has its own area and volume and projects below the storey elevation', () => {
  const slab = { type:'slab', x:2, y:3, w:4, h:5, z:0.2, levelId:'upper', layer:'S-SLAB' };
  assert.ok(valid(slab));
  assert.equal(slabArea(slab), 20);
  assert.equal(slabVolume(slab), 4);
  assert.equal(totalArea([slab]), 0);
  assert.equal(valid({ ...slab, z:0 }), false);
  const [top] = roomProjection([slab], 0, [{ id:'upper', elevation:3.25 }]).filter(face => face.kind === 'top');
  assert.ok(Math.abs(top.points[0].y - (1.5 - 3.25 * Math.sqrt(.75))) < 1e-9);
  assert.match(dxf([slab]), /S-SLAB/);
});

const wall = {
  type: 'wall', x: 0, y: 0, x2: 3, y2: 4, z: 3, thickness: 0.2, layer: 'A-WALL',
  openings: [{ kind: 'door', offset: 1, width: 1, sill: 0, height: 2 },
    { kind: 'window', offset: 3, width: 1, sill: 1, height: 1 }],
};

test('rotated wall subtracts door and window from area and volume', () => {
  assert.equal(valid(wall), true);
  assert.equal(length(wall), 5);
  const { grossArea, openingArea, netArea, netVolume } = wallQuantities(wall);
  assert.deepEqual([grossArea, openingArea, netArea], [15, 3, 12]);
  assert.ok(Math.abs(netVolume - 2.4) < 1e-9);
  const parts = wallParts(wall);
  const volume = parts.reduce((sum, part) => {
    const [first, second, third] = part.base;
    const width = Math.hypot(second[0] - first[0], second[1] - first[1]);
    const thickness = Math.hypot(third[0] - second[0], third[1] - second[1]);
    return sum + width * thickness * (part.top - part.bottom);
  }, 0);
  assert.ok(Math.abs(volume - netVolume) < 1e-9);
  assert.match(dxf([wall]), /A-DOOR/);
  assert.match(dxf([wall]), /A-GLAZ/);
  assert.ok(roomProjection([wall], 35).length > 3);
});

test('rejects out of bounds, overlapping, and raised door openings', () => {
  const [door, window] = wall.openings;
  for (const invalid of [{ ...window, offset: 4.1 }, { ...window, offset: 1.9 }, { ...window, sill: 2.1 }]) {
    assert.equal(valid({ ...wall, openings: [door, invalid] }), false);
  }
  assert.equal(valid({ ...wall, openings: [{ ...door, sill: 0.1 }] }), false);
  assert.equal(valid({ ...wall, z: undefined, thickness: undefined, openings: undefined }), true);
});

const room = { type: 'room', x: 2, y: 3, w: 4.25, h: 5.125, layer: 'A-WALL' };
test('3D projection uses explicit room heights and rotates the footprint', () => {
  assert.deepEqual(roomProjection([room], 35), []);
  const prism = { ...room, z: 2.8 };
  const faces = roomProjection([prism], 35);
  assert.equal(faces.length, 3);
  assert.equal(faces.filter(face => face.kind === 'top').length, 1);
  assert.notDeepEqual(roomProjection([prism], 215), faces);
  assert.notDeepEqual(roomProjection([{ ...prism, z: 3.2 }], 35), faces);
  assert.equal(valid({ ...room, z: -1 }), false);
});
test('pointer grid and entered geometry use separate precision', () => {
  assert.equal(snap(3.26), 3.5);
  assert.equal(totalArea([room]), 21.78125);
  assert.equal(length({type:'wall', x:0, y:0, x2:3, y2:4}), 5);
  assert.equal(valid({ ...room, w: 0 }), false);
});

test('reference comparisons stay draft on both sides of a limit', () => {
  const input = { buildingType:'apartment', landArea:600, groundArea:390, upperArea:451, roofArea:294, roofBaseArea:420 };
  const result = compliance(input);
  assert.equal(result.length, 4);
  assert.ok(result.every(check => check.status === 'draft' && check.url));
  assert.match(result[0].message, /ضمن القيمة/);
  assert.match(result[1].message, /تتجاوز/);
  assert.match(compliance({ ...input, landArea: 0 })[0].message, /مقامًا موجبًا/);
  assert.equal(compliance({ buildingType: 'villa' })[0].status, 'na');
});

test('metric DXF preserves decimals and flips display Y into CAD Y', () => {
  const output = dxf([room]);
  assert.match(output, /\$ACADVER\r\n1\r\nAC1015/);
  assert.match(output, /\$INSUNITS\r\n70\r\n6/);
  assert.equal((output.match(/\r\nLINE\r\n/g) || []).length, 4);
  assert.match(output, /21\r\n-8\.125/);
});
