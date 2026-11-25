import { slabNetArea, valid, wallQuantities } from './engine.js';

const text = (value, max = 180) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = value => Number.isFinite(value) ? value : null;
const positive = value => Number.isFinite(value) && value > 0;
export const thermalKinds = { wall: 'جدار خارجي', roof: 'سقف خارجي' };
export const elementThermalKind = shape => shape.type === 'wall' && shape.thickness != null ? 'wall'
  : shape.type === 'slab' ? 'roof' : null;

export function cleanAssembly(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    id: text(input.id, 80),
    name: text(input.name),
    kind: typeof input.kind === 'string' && Object.hasOwn(thermalKinds, input.kind) ? input.kind : 'wall',
    inside: number(input.inside),
    outside: number(input.outside),
    layers: Array.isArray(input.layers) ? input.layers.slice(0, 30).map(raw => ({
      name: text(raw?.name), mm: number(raw?.mm), conductivity: number(raw?.conductivity),
    })) : [],
    target: number(input.target),
    city: text(input.city),
    reference: text(input.reference, 300),
  };
}

export function cleanThermalAssemblies(values) {
  if (!Array.isArray(values)) return [];
  const ids = new Set();
  return values.slice(0, 100).map(cleanAssembly).filter(assembly => {
    if (!assembly.id || ids.has(assembly.id) || !assembly.name || !evaluateAssembly(assembly)) return false;
    ids.add(assembly.id);
    return true;
  });
}

export function evaluateAssembly(assembly) {
  const { inside, outside, layers } = assembly;
  if (!positive(inside) || !positive(outside) || !Array.isArray(layers) || !layers.length || layers.length > 30) return null;
  const resistances = [];
  for (const layer of layers) {
    if (!positive(layer.mm) || !positive(layer.conductivity)) return null;
    const resistance = layer.mm / 1000 / layer.conductivity;
    if (!positive(resistance)) return null;
    resistances.push(resistance);
  }
  const totalResistance = resistances.reduce((total, resistance) => total + resistance, inside + outside);
  const transmittance = 1 / totalResistance;
  if (!positive(totalResistance) || !positive(transmittance)) return null;
  return { resistances, totalResistance, transmittance };
}

export function compareAssembly(assembly, city) {
  const result = evaluateAssembly(assembly);
  if (!result || !positive(assembly.target)) return { status: 'none' };
  if (!assembly.reference || !assembly.city || assembly.city !== text(city)) return { status: 'pending' };
  const difference = result.transmittance - assembly.target;
  const within = difference <= Number.EPSILON * Math.max(result.transmittance, assembly.target) * 4;
  return { status: 'reference', within, difference, reference: assembly.reference };
}

export function evaluateEnvelopeElement(shape, assemblies) {
  if (!shape.thermalId || !valid(shape)) return null;
  const assembly = assemblies.get(shape.thermalId);
  if (!assembly || assembly.kind !== elementThermalKind(shape)) return null;
  const result = evaluateAssembly(assembly);
  if (!result) return null;
  const area = assembly.kind === 'wall' ? wallQuantities(shape).netArea : slabNetArea(shape);
  const conductance = area * result.transmittance;
  if (!Number.isFinite(conductance)) return null;
  return { assembly, area, transmittance: result.transmittance, conductance };
}

export function evaluateEnvelopeOpening(opening) {
  if (!['door', 'window'].includes(opening.kind) || !positive(opening.thermalU) ||
      typeof opening.thermalRef !== 'string' || !opening.thermalRef.trim() ||
      !positive(opening.width) || !positive(opening.height)) return null;
  const area = opening.width * opening.height;
  const conductance = area * opening.thermalU;
  if (!Number.isFinite(conductance) || !positive(area)) return null;
  return { area, transmittance: opening.thermalU, conductance, reference: opening.thermalRef.trim() };
}

export const minimumTemperatureC = -273.15;

export function cleanTransmissionScenario(input) {
  const { indoorC, outdoorC } = input ?? {};
  const reference = text(input?.reference, 300);
  if (!Number.isFinite(indoorC) || !Number.isFinite(outdoorC) ||
      indoorC < minimumTemperatureC || outdoorC < minimumTemperatureC || !reference) return null;
  return { indoorC, outdoorC, reference };
}

export function evaluateTransmission(scenario, conductances) {
  const input = cleanTransmissionScenario(scenario);
  if (!input || !conductances.length) return null;
  const deltaK = input.indoorC - input.outdoorC;
  const watts = conductances.map(value => Number.isFinite(value) && value >= 0 ? value * deltaK : NaN);
  const totalW = watts.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(totalW)) return null;
  return { deltaK, watts, totalW };
}
