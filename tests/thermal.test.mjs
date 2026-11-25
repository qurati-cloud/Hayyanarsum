import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAssembly, cleanThermalAssemblies, compareAssembly, evaluateAssembly, evaluateEnvelopeElement } from '../thermal.js';

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

test('assigned envelope elements use opaque areas after their openings are removed', () => {
  const roof = { ...assembly, id:'roof', kind:'roof' };
  const assemblies = new Map([[assembly.id, assembly], [roof.id, roof]]);
  const wall = { type:'wall', x:0, y:0, x2:5, y2:0, z:3, thickness:.2, thermalId:assembly.id,
    openings:[{ kind:'door', offset:1, width:1, sill:0, height:2 }] };
  const slab = { type:'slab', x:0, y:0, w:4, h:5, z:.2, thermalId:roof.id,
    cutouts:[{ name:'فتحة', x:1, y:1, w:1, h:2 }] };
  near(evaluateEnvelopeElement(wall, assemblies).conductance, 13 / 1.92);
  near(evaluateEnvelopeElement(slab, assemblies).conductance, 18 / 1.92);
  assert.equal(evaluateEnvelopeElement({ ...wall, thermalId:'roof' }, assemblies), null);
});
