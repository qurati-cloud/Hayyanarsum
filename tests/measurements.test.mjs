import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanMeasurements, groundLevel, measureSegment } from '../engine.js';

const segment = { levelId: groundLevel.id, x: 1.375, y: 2.125, x2: 4.375, y2: -1.875 };
test('measurements retain precise coordinates and signed differences', () => {
  assert.deepEqual(measureSegment(segment), { dx: 3, dy: -4, distance: 5 });
  assert.deepEqual(measureSegment({ x: 1, y: 2, x2: 1.125, y2: 2 }), { dx: .125, dy: 0, distance: .125 });
  assert.equal(measureSegment({ ...segment, x2: segment.x, y2: segment.y }), null);
  assert.equal(measureSegment({ ...segment, x: Infinity }), null);
});
test('project restoration keeps valid measurements, validates storeys and ignores cached distances', () => {
  const inputs = [null, { ...segment, distance: 15 }, { ...segment, levelId: 'missing' }, { ...segment, x: '1.375' }];
  assert.deepEqual(cleanMeasurements(inputs, [groundLevel]), [segment]);
  assert.deepEqual(cleanMeasurements(undefined, [groundLevel]), []);
});
