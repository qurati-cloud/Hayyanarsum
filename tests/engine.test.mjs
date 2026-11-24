import test from 'node:test';
import assert from 'node:assert/strict';
import { snap, totalArea, length, compliance, dxf, valid } from '../engine.js';

const room = { type: 'room', x: 2, y: 3, w: 4.25, h: 5.125, layer: 'A-WALL' };
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
