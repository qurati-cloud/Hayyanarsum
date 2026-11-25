import assert from 'node:assert/strict';
import test from 'node:test';
import { readDxf } from '../dxf-import.js';
import { dxf, length, wallFromCadLine, wallQuantities } from '../engine.js';

const drawing = (entities, unit = '6') => [
  '0', 'SECTION', '2', 'HEADER', ...(unit === '' ? [] : ['9', '$INSUNITS', '70', unit]),
  '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF', '',
].join('\r\n');
const line = ['0', 'LINE', '8', 'My-Source', '10', '1000', '20', '2000', '11', '2500', '21', '4000'];

test('scale and mirror coordinates, preserving DXF layers during export and reimport', () => {
  const { lines, skipped, unit } = readDxf(drawing(line, '4'), 1);
  const [shape] = lines;
  assert.deepEqual([shape.x, shape.y, shape.x2, shape.y2, length(shape)], [1, -2, 2.5, -4, 2.5]);
  assert.equal(shape.cadLayer, 'My-Source');
  assert.equal(unit, 4);
  assert.equal(skipped, 0);
  assert.deepEqual(readDxf(dxf(lines)).lines, lines);
});

test('unitless and missing drawings require a supported explicit fallback', () => {
  for (const unit of ['0', '']) {
    assert.throws(() => readDxf(drawing(line, unit)), /unit-required/);
    assert.equal(readDxf(drawing(line, unit), 5).lines[0].x, 10);
  }
  assert.throws(() => readDxf(drawing(line, '7'), 6), /unit-unsupported/);
});

test('closed polylines include their closing segment, curves and layouts are counted as skips', () => {
  const polyline = ['0', 'LWPOLYLINE', '90', '3', '70', '1', '10', '1', '20', '1',
    '10', '4', '20', '1', '10', '4', '20', '3'];
  const { lines, skipped } = readDxf(drawing([
    ...polyline, ...polyline, '42', '.5', ...line, '30', '3', ...line, '67', '1', '0', 'CIRCLE',
  ]));
  assert.equal(lines.length, 3);
  assert.deepEqual([lines[2].x, lines[2].y, lines[2].x2, lines[2].y2], [4, -3, 1, -1]);
  assert.equal(skipped, 4);
});

test('reject binary, partial files and an over-limit import', () => {
  assert.throws(() => readDxf('AutoCAD Binary DXF\r\n\x1a\0'), /format/);
  assert.throws(() => readDxf(drawing(line).replace('EOF', '')), /format/);
  assert.throws(() => readDxf(drawing([...line, ...line]), null, 1), /limit/);
});

test('an imported CAD segment becomes a wall at its metric coordinates only after valid dimensions', () => {
  const [imported] = readDxf(drawing(line, '4')).lines;
  const reference = { ...imported, id: 'cad1', levelId: 'upper' };
  assert.equal(wallFromCadLine(reference, { thickness: .2 }), null);
  assert.equal(wallFromCadLine(reference, { thickness: -.2, z: 3 }), null);
  const wall = wallFromCadLine(reference, { name: 'جدار', thickness: .2, z: 3 });
  assert.deepEqual(wall, {
    id: 'cad1', levelId: 'upper', x: 1, y: -2, x2: 2.5, y2: -4,
    type: 'wall', layer: 'A-WALL', name: 'جدار', thickness: .2, z: 3, openings: [],
  });
  assert.ok(Math.abs(wallQuantities(wall).netVolume - 1.5) < 1e-10);
  assert.equal(reference.type, 'cadLine');
});
