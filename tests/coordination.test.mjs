import assert from 'node:assert/strict';
import test from 'node:test';
import { roomWallFootprintReview, roomWallReviewRows, wallSlabClashes } from '../coordination.js';
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

test('room footprint review reports the largest wall overlap, ignoring face contact and unmodeled walls', () => {
  const room = { type: 'room', x: 1, y: 1, w: 2, h: 2 };
  const smaller = { ...wall, thickness: .25, openings: [{ kind: 'door', offset: 1, width: 2, sill: 0, height: 2 }] };
  const larger = { ...wall, id: 'wide', thickness: .5, y: 2, y2: 2 };
  const centerline = { ...wall, thickness: null, z: null, openings: null };
  const touching = { ...larger, id: 'touch', y: .75, y2: .75 };
  const other = { ...smaller, type: 'cadLine' };
  const { overlaps, omitted } = roomWallFootprintReview([room, { ...room, y: 5 }],
    [smaller, larger, centerline, touching, other]);
  assert.equal(omitted, 1);
  assert.equal(overlaps.size, 1);
  assert.equal(overlaps.get(0).wall, larger);
  near(overlaps.get(0).area, 1);
  near(roomWallFootprintReview([room], [smaller]).overlaps.get(0).area, .25);
  assert.equal(roomWallFootprintReview([room], [touching]).overlaps.size, 0);
});

test('rotated room-wall footprint review clips polygons and rejects bounding-box false positives', () => {
  const offset = 1_000_000;
  const diagonal = { ...wall, x: offset - 2, y: offset - 2, x2: offset + 3, y2: offset + 3 };
  const sameOriginRoom = { type: 'room', x: offset, y: offset, w: 1, h: 1 };
  const falsePositive = { ...sameOriginRoom, x: offset - 1.5, y: offset + 1.5 };
  const { overlaps } = roomWallFootprintReview([sameOriginRoom, falsePositive], [diagonal]);
  const projectedHalfThickness = .2 / Math.SQRT2;
  near(overlaps.get(0).area, 2 * projectedHalfThickness - projectedHalfThickness ** 2);
  assert.equal(overlaps.size, 1);
});

test('wall review export distinguishes overlap, no measured overlap, and walls without usable geometry', () => {
  const rooms = [
    { type: 'room', name: 'مجلس', x: 1, y: 1, w: 2, h: 2 },
    { type: 'room', name: 'غرفة', x: 5, y: 5, w: 2, h: 2 },
  ];
  const level = { name: 'السرداب', elevation: -2.5 };
  const legacy = { ...wall, id: 'legacy', z: null, thickness: null, openings: null };
  const wallReview = roomWallFootprintReview(rooms, [{ ...wall, name: 'جدار' }, legacy]);
  const rows = roomWallReviewRows({ rooms, level, wallReview });
  assert.deepEqual(rows[0].slice(0, 7), [1, 'مجلس', 'السرداب', -2.5, 'تداخل مرصود', 'جدار', 'w1']);
  near(rows[0][7], .2);
  assert.deepEqual(rows[0].slice(8, 10), [1, 1]);
  assert.deepEqual(rows[1].slice(0, 10), [
    2, 'غرفة', 'السرداب', -2.5, 'لم يظهر تداخل ضمن الجدران المفحوصة', '', '', '', 1, 1,
  ]);
  assert.match(rows[0][10], /الفتحات والمناسيب خارج الفحص/);
  const skipped = roomWallReviewRows({ rooms, level, wallReview: roomWallFootprintReview(rooms, [legacy]) });
  assert.deepEqual(skipped[0].slice(4, 10), ['تعذّر الفحص', '', '', '', 0, 1]);
});
