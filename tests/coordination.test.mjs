import assert from 'node:assert/strict';
import test from 'node:test';
import { wallSlabClashes } from '../coordination.js';
import { groundLevel } from '../engine.js';

const wall = { id: 'w1', type: 'wall', x: 0, y: 1, x2: 4, y2: 1, z: 3, thickness: .2, openings: [] };
const slab = { id: 's1', type: 'slab', x: 1, y: 0, w: 2, h: 2, z: .25, levelId: 'upper' };
const levelsAt = elevation => [groundLevel, { id: 'upper', name: 'Upper', elevation }];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('tall walls intersect across storeys by penetration depth, while face contacts and disjoint slabs are clear', () => {
  const report = wallSlabClashes([wall, slab], levelsAt(3.15));
  assert.equal(report.complete, true);
  assert.equal(report.pairs.length, 1);
  assert.equal(report.pairs[0].wall.id, 'w1');
  assert.equal(report.pairs[0].slab.id, 's1');
  near(report.pairs[0].volume, 2 * .2 * .1);
  assert.equal(wallSlabClashes([wall, slab], levelsAt(3.25)).pairs.length, 0);
  assert.equal(wallSlabClashes([wall, { ...slab, y: 1.1 }], levelsAt(3)).pairs.length, 0);
  assert.equal(wallSlabClashes([wall, { ...slab, x: 8 }], levelsAt(3)).pairs.length, 0);
});

test('wall windows and slab cutouts remove only their shared solid intersection', () => {
  const withWindow = { ...wall, openings: [{ kind: 'window', offset: 1, width: 1, sill: 1, height: 1 }] };
  const withHole = { ...slab, cutouts: [{ name: 'درج', x: .5, y: .5, w: 1, h: 1 }] };
  near(wallSlabClashes([withWindow, withHole], levelsAt(2)).pairs[0].volume, .5 * .2 * .25);
  const fullyClear = { ...withWindow, openings: [{ ...withWindow.openings[0], width: 2 }] };
  assert.equal(wallSlabClashes([fullyClear, slab], levelsAt(2)).pairs.length, 0);
  const throughSlabHole = { ...wall, x: 1.6, x2: 2.4 };
  assert.equal(wallSlabClashes([throughSlabHole, withHole], levelsAt(2)).pairs.length, 0);
});

test('rotated wall clips by its actual area even away from the drawing origin', () => {
  const offset = 1_000_000;
  const diagonal = { ...wall, x: offset - 2, x2: offset + 2, y: offset - 2, y2: offset + 2 };
  const strip = { ...slab, x: offset - .5, w: 1, y: offset - 2, h: 4 };
  const report = wallSlabClashes([diagonal, strip, { type: 'wall', x: 0, y: 0, x2: 1, y2: 0 }], levelsAt(3));
  near(report.pairs[0].volume, .2 * Math.SQRT2 * .25);
  assert.equal(report.omitted, 1);
});

test('large result sets are explicitly reported as incomplete', () => {
  const walls = Array.from({ length: 50 }, (_, index) => ({ ...wall, id: 'w' + index }));
  const slabs = Array.from({ length: 50 }, (_, index) => ({ ...slab, id: 's' + index }));
  const result = wallSlabClashes([...walls, ...slabs], levelsAt(3));
  assert.equal(result.complete, false);
  assert.equal(result.pairs.length, 2000);
});
