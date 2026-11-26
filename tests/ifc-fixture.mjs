import { exportIfc } from '../ifc.js';
import { extractBriefRooms, customRoomBlockPlan } from '../project-brief.js';

const wall = {
  id: '22334455-6677-4899-aabb-ccddeeff0011',
  name: "جدار 'أ' \\ اختبار",
  type: 'wall', x: 1, y: 2, x2: 4, y2: 6, z: 3, thickness: 0.2,
  openings: [
    { kind: 'door', offset: 1, width: 1, sill: 0, height: 2, thermalU: 2, thermalRef: 'نشرة الباب' },
    { kind: 'window', offset: 3, width: 1, sill: 1, height: 1, thermalU: 1.5, thermalRef: 'نشرة النافذة' },
  ],
};
const levels = [
  { id: 'ground', name: 'الطابق الأرضي', elevation: 0 },
  { id: 'upper', name: 'الطابق الأول', elevation: 3.25 },
];
const upperWall = { ...wall, id: '22334455-6677-4899-aabb-ccddeeff0012', levelId: 'upper', name: 'جدار علوي', thermalId:'wall-thermal' };
const slab = { type:'slab', id:'22334455-6677-4899-aabb-ccddeeff0013', name:'بلاطة الدور الأول',
  levelId:'upper', x:1, y:2, w:4, h:5, z:0.2, layer:'S-SLAB',
  cutouts:[{ name:'فتحة الدرج', x:1, y:1.5, w:1, h:2 }], thermalId:'roof-thermal' };
const assemblies = [
  { id:'wall-thermal', kind:'wall', name:'عزل الجدار', inside:.13, outside:.04, layers:[{ mm:100, conductivity:.2 }] },
  { id:'roof-thermal', kind:'roof', name:'عزل السقف', inside:.13, outside:.04, layers:[{ mm:50, conductivity:.04 }] },
];
const brief = extractBriefRooms('مجلس: ٤ × ٥ م؛ الموضع: ١ × ٢ م؛ الارتفاع: ٢٫٨ م\nمطبخ: ٣ × ٣ م؛ الموضع: ٥ × ٢ م');
const { rooms } = customRoomBlockPlan({ frontage: 20, depth: 30 }, { coordinates: true }, brief);
const space = { ...rooms[0], levelId: 'upper', id: '22334455-6677-4899-aabb-ccddeeff0014' };
const shapes = process.argv.includes('--spaces-only') ? [space, rooms[1]] : [wall, upperWall, slab, space, rooms[1]];
process.stdout.write(exportIfc(shapes, 'مشروع الاختبار', levels, assemblies));
