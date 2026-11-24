import assert from 'node:assert/strict';
import test from 'node:test';
import { slabVolumeSummary, wallVolumeSummary } from '../wall-volume.js';

test('slab union discounts overlapping concrete but retains concrete that fills another slab opening', () => {
  const solid = { type:'slab', x:0, y:0, w:4, h:5, z:.2 };
  const cut = { ...solid, cutouts:[{ name:'درج', x:1, y:1.5, w:1, h:2 }] };
  near(slabVolumeSummary([cut, cut]).netVolume, 3.6);
  const both = slabVolumeSummary([cut, solid]);
  near(both.netVolume, 4);
  near(both.overlap, 3.6);
  near(slabVolumeSummary([cut, { ...cut, levelId:'upper' }],
    [{ id:'ground', elevation:0 }, { id:'upper', elevation:3.25 }]).netVolume, 7.2);
});

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

test('stacked footprints only overlap when wall heights cross the floor elevation', () => {
  const ground = { id: 'ground', name: 'Ground', elevation: 0 };
  const upper = { id: 'upper', name: 'Upper', elevation: 3.25 };
  const baseWall = wall(0, 0, 4, 0);
  const upperWall = { ...baseWall, levelId: 'upper' };
  near(wallVolumeSummary([baseWall, upperWall], [ground, upper]).netVolume, 4.8);
  near(wallVolumeSummary([baseWall, upperWall], [ground, { ...upper, elevation: 2.5 }]).overlap, 0.4);
});
