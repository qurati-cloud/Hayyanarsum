import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanBrief, extractBrief, missingBriefFields } from '../project-brief.js';

test('extracts explicitly named Arabic inputs, including dual storeys and decimal metres', () => {
  const { data, conflicts } = extractBrief('فيلا في الرياض من طابقين بأربع غرف نوم. عرض الأرض ٢٠٫٥ متر، وعمق الأرض ٣٠ م.');
  assert.deepEqual(data, { kind: 'villa', city: 'الرياض', frontage: 20.5, depth: 30, storeys: 2, bedrooms: 4 });
  assert.deepEqual(conflicts, []);
  assert.deepEqual(missingBriefFields(data), []);
});

test('recognises limited English and French patterns and asks for fields left out', () => {
  assert.deepEqual(extractBrief('House in Jeddah with 2 storeys and four bedrooms. Frontage 20 m.').data,
    { kind: 'house', city: 'جدة', frontage: 20, storeys: 2, bedrooms: 4 });
  const { data } = extractBrief('Maison à Riyad, deux étages et trois chambres. Profondeur du terrain 30,5 mètres.');
  assert.deepEqual(data, { kind: 'house', city: 'الرياض', depth: 30.5, storeys: 2, bedrooms: 3 });
  assert.deepEqual(missingBriefFields(data), ['frontage']);
});

test('contradictory sizes remain blank and unlabeled or unsupported units are ignored', () => {
  const result = extractBrief('فيلا. عرض الأرض ٢٠ متر. عرض الأرض ٢٥ متر. عمق الأرض ٩٨ قدم. مجلس ٦ × ٨ م.');
  assert.deepEqual(result.conflicts, ['frontage']);
  assert.deepEqual(result.data, { kind: 'villa' });
  assert.deepEqual(cleanBrief({ kind: '__proto__', city: '', depth: -1, bedrooms: 0, storeys: 1.5 }), { bedrooms: 0 });
});
