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
const levels = [
  { id: 'ground', name: 'الطابق الأرضي', elevation: 0 },
  { id: 'upper', name: 'الطابق الأول', elevation: 3.25 },
];
const upperWall = { ...wall, id: '22334455-6677-4899-aabb-ccddeeff0012', levelId: 'upper', name: 'جدار علوي' };
process.stdout.write(exportIfc([wall, upperWall], 'مشروع الاختبار', levels));
