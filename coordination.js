import { elementLevel, groundLevel, length, slabParts, valid, wallFootprint, wallParts } from './engine.js';

export const minimumReportedOverlap = 1e-9;
const maxChecks = 750_000;
const maxResults = 2_000;

function boundsOf(points) {
  const x = points.map(point => point[0]);
  const y = points.map(point => point[1]);
  return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
}

function intersects([left, bottom, right, top], [otherLeft, otherBottom, otherRight, otherTop]) {
  return right > otherLeft && left < otherRight && top > otherBottom && bottom < otherTop;
}

function clipAt(polygon, axis, edge, sign) {
  return polygon.flatMap((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const inside = (point[axis] - edge) * sign >= 0;
    const previousInside = (previous[axis] - edge) * sign >= 0;
    const vertices = [];
    if (inside !== previousInside) {
      const other = 1 - axis;
      const ratio = (edge - previous[axis]) / (point[axis] - previous[axis]);
      const crossing = [];
      crossing[axis] = edge;
      crossing[other] = previous[other] + ratio * (point[other] - previous[other]);
      vertices.push(crossing);
    }
    if (inside) vertices.push(point);
    return vertices;
  });
}

function intersectionArea(polygon, [left, bottom, right, top]) {
  polygon = clipAt(polygon, 0, left, 1);
  polygon = clipAt(polygon, 0, right, -1);
  polygon = clipAt(polygon, 1, bottom, 1);
  polygon = clipAt(polygon, 1, top, -1);
  if (polygon.length < 3) return 0;
  // Translate to a vertex before taking cross products to preserve precision at large offsets.
  const [x, y] = polygon[0];
  let areaTwice = 0;
  for (let i = 2; i < polygon.length; i++) {
    const [ax, ay] = polygon[i - 1];
    const [bx, by] = polygon[i];
    areaTwice += (ax - x) * (by - y) - (ay - y) * (bx - x);
  }
  return Math.abs(areaTwice) / 2;
}

export function roomWallFootprintReview(rooms, floorShapes) {
  const walls = [];
  let omitted = 0;
  for (const wall of floorShapes) {
    if (wall.type !== 'wall') continue;
    if (!valid(wall) || wall.thickness == null) {
      omitted++;
      continue;
    }
    const footprint = wallFootprint(wall, 0, length(wall));
    const bounds = boundsOf(footprint);
    if (!bounds.every(Number.isFinite)) {
      omitted++;
      continue;
    }
    walls.push({ wall, footprint, bounds });
  }
  const overlaps = new Map();
  for (const [index, room] of rooms.entries()) {
    const rectangle = [room.x, room.y, room.x + room.w, room.y + room.h];
    let largest = minimumReportedOverlap;
    for (const { wall, bounds, footprint } of walls) {
      if (!intersects(bounds, rectangle)) continue;
      const area = intersectionArea(footprint, rectangle);
      if (!Number.isFinite(area) || area <= largest) continue;
      largest = area;
      overlaps.set(index, { wall, area });
    }
  }
  return { overlaps, omitted };
}

export function wallSlabClashes(shapes, levels = [groundLevel]) {
  const walls = [];
  const slabs = [];
  const pairs = [];
  let omitted = 0;
  let checks = 0;
  for (const shape of shapes) {
    if (shape.type !== 'wall' && shape.type !== 'slab') continue;
    const level = elementLevel(shape, levels);
    if (!valid(shape) || !level || (shape.type === 'wall' && shape.thickness == null)) {
      omitted++;
      continue;
    }
    const { elevation } = level;
    if (shape.type === 'wall') {
      const bounds = boundsOf(wallFootprint(shape, 0, length(shape)));
      if (!bounds.every(Number.isFinite)) { omitted++; continue; }
      walls.push({ shape, elevation, bounds });
    } else {
      const { x, y, w, h } = shape;
      slabs.push({ shape, elevation, bounds: [x, y, x + w, y + h] });
    }
  }

  const result = { pairs, omitted, walls: walls.length, slabs: slabs.length, complete: true };
  for (const wall of walls) {
    let parts;
    for (const slab of slabs) {
      const slabBottom = slab.elevation - slab.shape.z;
      if (++checks > maxChecks) return { ...result, complete: false };
      if (wall.elevation >= slab.elevation || wall.elevation + wall.shape.z <= slabBottom ||
          !intersects(wall.bounds, slab.bounds)) continue;
      parts ??= wallParts(wall.shape).map(part => ({ ...part, bounds: boundsOf(part.base) }));
      slab.rectangles ??= slabParts(slab.shape).map(part => boundsOf(part.base));
      let volume = 0;
      for (const part of parts) {
        const depth = Math.min(wall.elevation + part.top, slab.elevation) -
          Math.max(wall.elevation + part.bottom, slabBottom);
        if (depth <= 0) continue;
        for (const rectangle of slab.rectangles) {
          if (++checks > maxChecks) return { ...result, complete: false };
          if (intersects(part.bounds, rectangle)) volume += intersectionArea(part.base, rectangle) * depth;
        }
      }
      if (volume > minimumReportedOverlap) {
        if (!Number.isFinite(volume) || pairs.length === maxResults) return { ...result, complete: false };
        pairs.push({ wall: wall.shape, slab: slab.shape, volume });
      }
    }
  }
  return result;
}
