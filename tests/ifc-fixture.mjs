import { exportIfc } from '../ifc.js';

const wall = {
  id: '22334455-6677-4899-aabb-ccddeeff0011',
  name: "جدار 'أ' \\ اختبار",
  type: 'wall', x: 1, y: 2, x2: 4, y2: 6, z: 3, thickness: 0.2,
  openings: [
    { kind: 'door', offset: 1, width: 1, sill: 0, height: 2 },
    { kind: 'window', offset: 3, width: 1, sill: 1, height: 1 },
  ],
};
process.stdout.write(exportIfc([wall], 'مشروع الاختبار'));
