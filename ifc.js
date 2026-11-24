import { elementLevel, length, slabArea, slabNetArea, slabVolume, valid, validateLevels, wallQuantities } from './engine.js';

const ifcAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const missing = '$';

function globalId(uuid = crypto.randomUUID()) {
  let value = BigInt('0x' + uuid.replaceAll('-', ''));
  let result = '';
  for (let index = 0; index < 22; index++) {
    result = ifcAlphabet[Number(value & 63n)] + result;
    value >>= 6n;
  }
  return "'" + result + "'";
}

function stepString(value) {
  const escaped = Array.from(String(value), character => {
    const code = character.codePointAt(0);
    if (code < 32 || code === 127) return ' ';
    if (character === "'") return "''";
    if (character === '\\' || code > 126) {
      const wide = code > 0xffff;
      return (wide ? '\\X4\\' : '\\X2\\') + code.toString(16).toUpperCase().padStart(wide ? 8 : 4, '0') + '\\X0\\';
    }
    return character;
  });
  return "'" + escaped.join('') + "'";
}

function real(value) {
  if (!Number.isFinite(value)) throw new TypeError('IFC requires finite coordinates');
  const [mantissa, exponent] = String(value).split('e');
  const decimal = mantissa.includes('.') ? mantissa : mantissa + '.';
  return exponent === undefined ? decimal : decimal + 'E' + exponent;
}

const tuple = values => '(' + values.join(',') + ')';
const mode = '.ELEMENT.';
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export const isIfcWall = shape => shape?.type === 'wall' && shape.thickness != null && valid(shape);
export const isIfcSlab = shape => shape?.type === 'slab' && valid(shape);

export function exportIfc(shapes, projectName = 'Hayyanarsum', levels) {
  const walls = shapes.filter(isIfcWall);
  const slabs = shapes.filter(isIfcSlab);
  if (!walls.length && !slabs.length) throw new TypeError('No modeled building elements to export');
  const storeys = validateLevels(levels);
  const data = [];
  const entity = (type, ...args) => {
    const ref = '#' + (data.length + 1);
    data.push(ref + '=' + type + tuple(args) + ';');
    return ref;
  };
  const root = (name, id) => [globalId(id), missing, stepString(name), missing];
  const point = coordinates => entity('IFCCARTESIANPOINT', tuple(coordinates.map(real)));
  const direction = coordinates => entity('IFCDIRECTION', tuple(coordinates.map(real)));
  const axisZ = direction([0, 0, 1]);
  const axisX = direction([1, 0, 0]);
  const placement3d = (x, y, z, reference = axisX) =>
    entity('IFCAXIS2PLACEMENT3D', point([x, y, z]), axisZ, reference);
  const local = (parent, x, y, z, reference) =>
    entity('IFCLOCALPLACEMENT', parent, placement3d(x, y, z, reference));
  const context = entity('IFCGEOMETRICREPRESENTATIONCONTEXT', missing, "'Model'", '3', '1.E-7',
    placement3d(0, 0, 0), missing);
  const body = entity('IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
    "'Body'", "'Model'", '*', '*', '*', '*', context, missing, '.MODEL_VIEW.', missing);
  const units = entity('IFCUNITASSIGNMENT', tuple([
    entity('IFCSIUNIT', '*', '.LENGTHUNIT.', missing, '.METRE.'),
    entity('IFCSIUNIT', '*', '.AREAUNIT.', missing, '.SQUARE_METRE.'),
    entity('IFCSIUNIT', '*', '.VOLUMEUNIT.', missing, '.CUBIC_METRE.'),
    entity('IFCSIUNIT', '*', '.PLANEANGLEUNIT.', missing, '.RADIAN.'),
  ]));
  const title = String(projectName || 'Hayyanarsum').slice(0, 160);
  const project = entity('IFCPROJECT', ...root(title), missing, missing, missing, tuple([context]), units);
  const sitePlacement = local(missing, 0, 0, 0);
  const site = entity('IFCSITE', ...root('Site'), missing, sitePlacement, missing, missing, mode,
    missing, missing, missing, missing, missing);
  const buildingPlacement = local(sitePlacement, 0, 0, 0);
  const building = entity('IFCBUILDING', ...root('Building'), missing, buildingPlacement, missing, missing, mode,
    missing, missing, missing);
  const spatial = new Map(storeys.map(level => {
    const placement = local(buildingPlacement, 0, 0, level.elevation);
    const ref = entity('IFCBUILDINGSTOREY', ...root(level.name), missing, placement, missing, missing, mode, real(level.elevation));
    return [level.id, { ref, placement, contained: [] }];
  }));
  entity('IFCRELAGGREGATES', ...root(''), project, tuple([site]));
  entity('IFCRELAGGREGATES', ...root(''), site, tuple([building]));
  entity('IFCRELAGGREGATES', ...root(''), building, tuple([...spatial.values()].map(level => level.ref)));

  function box(width, thickness, height) {
    const profile = entity('IFCRECTANGLEPROFILEDEF', '.AREA.', missing, missing, real(width), real(thickness));
    const solid = entity('IFCEXTRUDEDAREASOLID', profile, placement3d(width / 2, 0, 0), axisZ, real(height));
    const representation = entity('IFCSHAPEREPRESENTATION', body, "'Body'", "'SweptSolid'", tuple([solid]));
    return entity('IFCPRODUCTDEFINITIONSHAPE', missing, missing, tuple([representation]));
  }

  function quantities(wall, reference, width) {
    const { grossArea, netArea, netVolume } = wallQuantities(wall);
    const measures = [
      ['LENGTH', 'Length', width], ['LENGTH', 'Width', wall.thickness], ['LENGTH', 'Height', wall.z],
      ['AREA', 'GrossSideArea', grossArea], ['AREA', 'NetSideArea', netArea], ['VOLUME', 'NetVolume', netVolume],
    ].map(([type, label, value]) => entity('IFCQUANTITY' + type, stepString(label), missing, missing, real(value), missing));
    const set = entity('IFCELEMENTQUANTITY', ...root('Qto_WallBaseQuantities'), missing, tuple(measures));
    entity('IFCRELDEFINESBYPROPERTIES', ...root(''), tuple([reference]), set);
  }

  for (const wall of walls) {
    const level = elementLevel(wall, storeys);
    const storey = spatial.get(level?.id);
    if (!storey) throw new TypeError('Wall refers to an unknown storey');
    const width = length(wall);
    // Map the screen's downward Y into IFC's upward Y, preserving the start and orientation.
    const axis = direction([(wall.x2 - wall.x) / width, (wall.y - wall.y2) / width, 0]);
    const pose = local(storey.placement, wall.x, -wall.y, 0, axis);
    const stableId = uuidPattern.test(wall.id) ? wall.id : undefined;
    const wallRef = entity('IFCWALL', ...root(wall.name || 'Wall', stableId), missing, pose,
      box(width, wall.thickness, wall.z), stepString(wall.id || ''), '.NOTDEFINED.');
    storey.contained.push(wallRef);
    quantities(wall, wallRef, width);
    for (const opening of wall.openings) {
      const isDoor = opening.kind === 'door';
      const label = isDoor ? 'Door' : 'Window';
      const openingPose = local(pose, opening.offset, 0, opening.sill);
      // A millimetre of overrun on each face keeps the void through the wall thickness.
      const voidRef = entity('IFCOPENINGELEMENT', ...root(label + ' opening'), missing, openingPose,
        box(opening.width, wall.thickness + 0.002, opening.height), missing, '.OPENING.');
      entity('IFCRELVOIDSELEMENT', ...root(''), wallRef, voidRef);
      const fillPose = local(openingPose, 0, 0, 0);
      const fill = entity(isDoor ? 'IFCDOOR' : 'IFCWINDOW', ...root(label), missing, fillPose,
        missing, missing, real(opening.height), real(opening.width), isDoor ? '.DOOR.' : '.WINDOW.', '.NOTDEFINED.', missing);
      entity('IFCRELFILLSELEMENT', ...root(''), voidRef, fill);
      storey.contained.push(fill);
    }
  }
  for (const slab of slabs) {
    const storey = spatial.get(elementLevel(slab, storeys)?.id);
    if (!storey) throw new TypeError('Slab refers to an unknown storey');
    const pose = local(storey.placement, slab.x, -(slab.y + slab.h / 2), -slab.z);
    const stableId = uuidPattern.test(slab.id) ? slab.id : undefined;
    const ref = entity('IFCSLAB', ...root(slab.name || 'Slab', stableId), missing, pose,
      box(slab.w, slab.h, slab.z), stepString(slab.id || ''), '.FLOOR.');
    storey.contained.push(ref);
    for (const cut of slab.cutouts ?? []) {
      const cutPose = local(pose, cut.x, slab.h / 2 - cut.y - cut.h / 2, -.001);
      const opening = entity('IFCOPENINGELEMENT', ...root(cut.name), missing, cutPose,
        box(cut.w, cut.h, slab.z + .002), missing, '.OPENING.');
      entity('IFCRELVOIDSELEMENT', ...root(''), ref, opening);
    }
    const measures = [
      ['LENGTH', 'Width', slab.z],
      ['AREA', 'GrossArea', slabArea(slab)], ['AREA', 'NetArea', slabNetArea(slab)],
      ['VOLUME', 'GrossVolume', slabArea(slab) * slab.z], ['VOLUME', 'NetVolume', slabVolume(slab)],
    ].map(([type, label, value]) => entity('IFCQUANTITY' + type, stepString(label), missing, missing, real(value), missing));
    const set = entity('IFCELEMENTQUANTITY', ...root('Qto_SlabBaseQuantities'), missing, tuple(measures));
    entity('IFCRELDEFINESBYPROPERTIES', ...root(''), tuple([ref]), set);
  }
  for (const { ref, contained } of spatial.values()) {
    if (contained.length) entity('IFCRELCONTAINEDINSPATIALSTRUCTURE', ...root(''), tuple(contained), ref);
  }
  return [
    'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('Hayyanarsum building model'),'2;1');",
    "FILE_NAME('hayyanarsum.ifc'," + stepString(new Date().toISOString()) + ",(''),(''),'Hayyanarsum','Hayyanarsum','');",
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;', ...data, 'ENDSEC;', 'END-ISO-10303-21;', '',
  ].join('\n');
}
