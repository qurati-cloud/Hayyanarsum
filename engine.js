export const snap = (value, step = 0.5) => Math.round(value / step) * step;
export const area = shape => shape.type === 'room' ? shape.w * shape.h : 0;
export const length = shape => shape.type === 'wall' ? Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y) : 0;
export const totalArea = shapes => shapes.reduce((sum, shape) => sum + area(shape), 0);

export function valid(shape) {
  if (!shape || !['room', 'wall'].includes(shape.type)) return false;
  const values = shape.type === 'room'
    ? [shape.x, shape.y, shape.w, shape.h, shape.x + shape.w, shape.y + shape.h, area(shape)]
    : [shape.x, shape.y, shape.x2, shape.y2, length(shape)];
  return values.every(Number.isFinite) &&
    (shape.type === 'room' ? shape.w > 0 && shape.h > 0 : length(shape) > 0);
}

export const residentialReference = Object.freeze({
  authority: 'وزارة البلديات والإسكان',
  title: 'اشتراطات إنشاء المباني السكنية',
  url: 'https://balady.gov.sa/sites/default/files/2024-12/ashtratat%20a%27nsha%20almbany%20alsknyt%20almnshwrt%20%60ly%20mwq%60%20alwzart%20.pdf',
  section: '4-2',
  edition: null,
  effectiveDate: null,
  jurisdiction: 'السعودية، مع مراجعة الضوابط المحلية للموقع',
  status: 'draft',
});

export function compliance(input) {
  if (input.buildingType !== 'apartment') {
    return [{ status: 'na', title: 'نطاق القواعد', message: 'هذه المقارنة تخص العمائر السكنية والسكنية التجارية.', source: '—' }];
  }
  const ratios = [
    ['نسبة بناء الدور الأرضي', input.groundArea, input.landArea, 65],
    ['نسبة بناء الدور الأول أو المتكرر المدخل', input.upperArea, input.landArea, 75],
    ['نسبة بناء الملحق العلوي', input.roofArea, input.roofBaseArea, 70],
  ];
  const results = ratios.map(([title, numerator, denominator, limit], index) => {
    const ratio = numerator / denominator * 100;
    const complete = numerator >= 0 && denominator > 0 && Number.isFinite(ratio);
    return {
      title,
      status: 'draft',
      message: complete
        ? `النسبة المحسوبة ${ratio.toFixed(2)}%، والقيمة المرجعية ${limit}%. ${ratio > limit ? 'تتجاوز القيمة المرجعية.' : 'ضمن القيمة المرجعية.'} تطبيق الشرط على الموقع وتاريخ نفاذه قيد المراجعة.`
        : 'أدخل مساحة غير سالبة ومقامًا موجبًا للمقارنة.',
      source: `${residentialReference.title}، ${residentialReference.section}، بند ${index + 1}`,
      url: residentialReference.url,
    };
  });
  results.push({
    title: 'الارتدادات ومواقف السيارات',
    status: 'draft',
    message: 'الفحص معلق. تحتاج الارتدادات إلى بيانات مستقلة لكل واجهة وحد مجاور، ومواقف المحلات إلى عدد المحلات ومساحاتها.',
    source: 'اشتراطات إنشاء المباني السكنية، 4-2، البنود 4–6',
    url: residentialReference.url,
  });
  return results;
}

export function dxf(shapes) {
  const records = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015',
    '9', '$INSUNITS', '70', '6', '9', '$MEASUREMENT', '70', '1',
    '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
  ];
  // The screen has a downwards Y axis; CAD uses an upwards Y axis.
  function line(x, y, x2, y2, layer) {
    records.push('0', 'LINE', '100', 'AcDbEntity', '8', layer,
      '100', 'AcDbLine', '10', x, '20', -y, '30', 0, '11', x2, '21', -y2, '31', 0);
  }
  for (const shape of shapes) {
    if (!valid(shape)) throw new TypeError('Invalid geometry');
    const layer = /^[A-Z0-9_-]{1,40}$/.test(shape.layer) ? shape.layer : '0';
    const { x, y, w, h } = shape;
    if (shape.type === 'wall') {
      line(x, y, shape.x2, shape.y2, layer);
      continue;
    }
    line(x, y, x + w, y, layer);
    line(x + w, y, x + w, y + h, layer);
    line(x + w, y + h, x, y + h, layer);
    line(x, y + h, x, y, layer);
  }
  return [...records, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n');
}
