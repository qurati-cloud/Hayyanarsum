import assert from 'node:assert/strict';
import test from 'node:test';
import { wallVolumeSummary } from '../wall-volume.js';

const wall = (x, y, x2, y2, extra = {}) =>
  ({ type: 'wall', x, y, x2, y2, thickness: 0.2, z: 3, openings: [], ...extra });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('orthogonal crossing counts the shared volume once', () => {
  const result = wallVolumeSummary([wall(-2, 0, 2, 0), wall(0, -2, 0, 2)]);
  near(result.separateVolume, 4.8);
  near(result.overlap, 0.12);
  near(result.netVolume, 4.68);
});

test('axis ending at a wall centre produces a half-width T junction overlap', () => {
  const result = wallVolumeSummary([wall(-2, 0, 2, 0), wall(0, -2, 0, 0)]);
  near(result.overlap, 0.06);
});

test('diagonal crossing uses the projected shared footprint', () => {
  const result = wallVolumeSummary([wall(-2, 0, 2, 0), wall(-2, -2, 2, 2)]);
  near(result.overlap, .12 * Math.SQRT2);
});

test('opening and differing heights constrain the shared volume by elevation', () => {
  const horizontal = wall(-2, 0, 2, 0, { openings: [{ kind: 'door', offset: 1.5, width: 1, height: 2, sill: 0 }] });
  const vertical = wall(0, -2, 0, 2, { z: 2.5 });
  const result = wallVolumeSummary([horizontal, vertical]);
  near(result.separateVolume, 4);
  near(result.overlap, 0.02);
  near(result.netVolume, 3.98);
});

test('three coincident walls retain one volume, and centre-lines are excluded', () => {
  const model = wall(0, 0, 4, 0);
  const result = wallVolumeSummary([model, model, model, { type:'wall', x:0, y:0, x2:4, y2:0 }]);
  near(result.netVolume, 2.4);
  near(result.overlap, 4.8);
  assert.equal(result.omitted, 1);
});

test('touching end faces and disjoint footprints add no overlap', () => {
  const result = wallVolumeSummary([wall(0, 0, 4, 0), wall(4, 0, 8, 0), wall(0, 20, 4, 20)]);
  near(result.netVolume, 7.2);
  near(result.overlap, 0);
});
