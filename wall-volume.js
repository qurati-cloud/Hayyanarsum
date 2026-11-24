import { elementLevel, groundLevel, valid, wallParts, wallQuantities } from './engine.js';

const maxWork = 3_000_000;

// Split the XY sweep wherever a footprint starts, ends, or two boundary edges cross.
// Within each strip the union's section length is linear, so its midpoint integrates exactly.
function footprintUnion(polygons, spend) {
  const events = new Set();
  const edgeSets = polygons.map(polygon => polygon.flatMap(([x, y], index) => {
    events.add(x);
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    if (x === nextX) return [];
    const slope = (nextY - y) / (nextX - x);
    return [{ low: Math.min(x, nextX), high: Math.max(x, nextX), at: value => y + (value - x) * slope }];
  }));
  const edges = edgeSets.flat();
  spend(edges.length ** 2 / 2);
  for (let i = 0; i < edges.length; i++) {
    const first = edges[i];
    for (let j = 0; j < i; j++) {
      const second = edges[j];
      const low = Math.max(first.low, second.low);
      const high = Math.min(first.high, second.high);
      if (high <= low) continue;
      const left = first.at(low) - second.at(low);
      const right = first.at(high) - second.at(high);
      if ((left < 0 && right > 0) || (left > 0 && right < 0)) {
        events.add(low + (high - low) * left / (left - right));
      }
    }
  }
  const positions = [...events].sort((a, b) => a - b);
  spend(positions.length * edges.length);
  let area = 0;
  for (let index = 1; index < positions.length; index++) {
    const left = positions[index - 1];
    const width = positions[index] - left;
    const x = left + width / 2;
    const intervals = [];
    for (const boundary of edgeSets) {
      const crossings = boundary.filter(edge => edge.low <= x && x < edge.high).map(edge => edge.at(x));
      if (crossings.length >= 2) intervals.push([Math.min(...crossings), Math.max(...crossings)]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    for (const [low, high] of intervals) {
      if (high > end) {
        area += (high - Math.max(low, end)) * width;
        end = high;
      }
    }
  }
  return area;
}

export function wallVolumeSummary(shapes, storeys = [groundLevel]) {
  const walls = shapes.filter(shape => shape.type === 'wall' && shape.thickness != null && valid(shape) && elementLevel(shape, storeys));
  const omitted = shapes.filter(shape => shape.type === 'wall').length - walls.length;
  const separateVolume = walls.reduce((volume, wall) => volume + wallQuantities(wall).netVolume, 0);
  const parts = walls.flatMap(wall => {
    const { elevation } = elementLevel(wall, storeys);
    return wallParts(wall).map(part => ({ ...part, bottom: part.bottom + elevation, top: part.top + elevation }));
  });
  const levels = [...new Set(parts.flatMap(part => [part.bottom, part.top]))].sort((a, b) => a - b);
  let work = 0;
  const limit = Symbol('volume computation limit');
  const spend = amount => {
    work += amount;
    if (work > maxWork) throw limit;
  };
  try {
    spend(levels.length * parts.length);
    let unionVolume = 0;
    for (let index = 1; index < levels.length; index++) {
      const bottom = levels[index - 1];
      const height = levels[index] - bottom;
      const footprints = parts.filter(part => part.bottom <= bottom && part.top >= levels[index]).map(part => part.base);
      unionVolume += footprintUnion(footprints, spend) * height;
    }
    // Bound floating-point drift at the no-overlap and fully empty limits.
    const netVolume = walls.length === 1 ? separateVolume : Math.max(0, Math.min(separateVolume, unionVolume));
    const overlap = separateVolume - netVolume;
    return { separateVolume, netVolume, overlap, omitted, walls: walls.length };
  } catch (error) {
    if (error !== limit) throw error;
    return { separateVolume, netVolume: null, overlap: null, omitted, walls: walls.length };
  }
}
