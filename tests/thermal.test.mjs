import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAssembly, cleanThermalAssemblies, compareAssembly, evaluateAssembly } from '../thermal.js';

const assembly = cleanAssembly({
  id: 'wall-1', kind: 'wall', name: 'جدار الاختبار', inside: .13, outside: .04,
  layers: [{ name:'طبقة 1', mm:100, conductivity:.2 }, { name:'طبقة 2', mm:50, conductivity:.04 }],
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);

test('homogeneous layers convert millimetres to metres and include both surface resistances', () => {
  const result = evaluateAssembly(assembly);
  assert.deepEqual(result.resistances, [.5, 1.25]);
  near(result.totalResistance, 1.92);
  near(result.transmittance, 1 / 1.92);
});

test('zero, missing or invalid physical inputs do not produce numeric results', () => {
  assert.equal(evaluateAssembly({ ...assembly, outside: null }), null);
  assert.equal(evaluateAssembly({ ...assembly, layers: [] }), null);
  assert.equal(evaluateAssembly({ ...assembly, layers: [{ mm:100, conductivity:0 }] }), null);
  assert.equal(evaluateAssembly({ ...assembly, inside: -1 }), null);
  assert.equal(cleanThermalAssemblies([assembly, assembly, { ...assembly, id:'bad', inside:0 }]).length, 1);
});

test('target comparison requires the user-entered reference and matching city', () => {
  const withTarget = { ...assembly, target:.5, city:'الرياض', reference:'مرجع اختبار' };
  assert.equal(compareAssembly(assembly, 'الرياض').status, 'none');
  assert.equal(compareAssembly(withTarget, 'جدة').status, 'pending');
  assert.equal(compareAssembly({ ...withTarget, reference:'' }, 'الرياض').status, 'pending');
  assert.equal(compareAssembly(withTarget, 'الرياض').within, false);
  assert.equal(compareAssembly({ ...withTarget, target:1 / 1.92 }, ' الرياض ').within, true);
});
