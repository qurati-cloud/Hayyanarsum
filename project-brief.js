export const briefFields = {
  kind: { question: 'ما نوع المبنى السكني؟' },
  city: { question: 'في أي مدينة يقع المشروع؟' },
  frontage: { question: 'كم يبلغ عرض الأرض على الشارع بالمتر؟' },
  depth: { question: 'كم يبلغ عمق الأرض بالمتر؟' },
  storeys: { question: 'كم عدد الطوابق المطلوبة؟' },
  bedrooms: { question: 'كم عدد غرف النوم المطلوبة في المشروع؟' },
};

const buildingPatterns = {
  villa: /فيلا|ڤيلا|\bvilla\b/iu,
  house: /منزل|بيت|\bhouse\b|\bmaison\b/iu,
  apartment: /عمارة سكنية|\bapartment building\b|\bimmeuble résidentiel\b/iu,
};
const cityNames = {
  الرياض: /الرياض|\briyadh\b|\briyad\b/iu,
  جدة: /جدة|جده|\bjeddah\b|\bdjeddah\b/iu,
  الدمام: /الدمام|\bdammam\b/iu,
  مكة: /مكة|مكه|\bmakkah\b|\bmecca\b|\bla mecque\b/iu,
  'المدينة المنورة': /المدينة المنورة|المدينه المنوره|\bmadinah\b|\bm[eé]dine\b/iu,
  الخبر: /الخبر|\bal[- ]khobar\b/iu,
  أبها: /أبها|ابها|\babha\b/iu,
};
const words = { 'ثلاث': 3, 'ثلاثة': 3, 'أربع': 4, 'أربعة': 4, 'اربع': 4, 'اربعة': 4,
  'خمس': 5, 'خمسة': 5, one: 1, two: 2, three: 3, four: 4, five: 5,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };

export function cleanBrief(input) {
  const value = {};
  if (!input || typeof input !== 'object') return value;
  if (Object.hasOwn(buildingPatterns, input.kind)) value.kind = input.kind;
  if (typeof input.city === 'string' && input.city.trim()) value.city = input.city.trim().slice(0, 160);
  for (const key of ['frontage', 'depth']) {
    if (Number.isFinite(input[key]) && input[key] > 0 && input[key] <= 1e6) value[key] = input[key];
  }
  for (const key of ['storeys', 'bedrooms']) {
    if (Number.isInteger(input[key]) && input[key] >= (key === 'bedrooms' ? 0 : 1) && input[key] <= 100) value[key] = input[key];
  }
  return value;
}

export function extractBrief(description) {
  const source = description.slice(0, 4000).normalize('NFKC').toLowerCase()
    .replace(/[٠-٩۰-۹]/gu, digit => String(('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)) % 10))
    .replaceAll('٫', '.').replace(/[\u064B-\u065F\u0670]/gu, '');
  const candidates = Object.fromEntries(Object.keys(briefFields).map(key => [key, new Set()]));
  const add = (key, value) => {
    const clean = cleanBrief({ [key]: value });
    if (Object.hasOwn(clean, key)) candidates[key].add(clean[key]);
  };
  for (const [kind, pattern] of Object.entries(buildingPatterns)) if (pattern.test(source)) add('kind', kind);
  for (const [city, pattern] of Object.entries(cityNames)) if (pattern.test(source)) add('city', city);
  for (const match of source.matchAll(/(?:عرض (?:الأرض|الارض|الواجهة)|frontage|largeur (?:du terrain|de façade))\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:متر|م(?=$|\s|[،,.؛])|m(?:ètres?|eters?)?\b)/giu)) {
    add('frontage', Number(match[1].replace(',', '.')));
  }
  for (const match of source.matchAll(/(?:عمق (?:الأرض|الارض)|(?:plot )?depth|profondeur(?: du terrain)?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:متر|م(?=$|\s|[،,.؛])|m(?:ètres?|eters?)?\b)/giu)) {
    add('depth', Number(match[1].replace(',', '.')));
  }
  const count = raw => Object.hasOwn(words, raw) ? words[raw] : Number(raw);
  for (const match of source.matchAll(/(?:^|[^\p{L}\p{N}.,+−-])([\p{L}]+|\d+)\s*(?:طوابق|طابق|أدوار|ادوار|دور|storeys?|stories|floors?|étages?)(?![\p{L}])/giu)) {
    add('storeys', count(match[1]));
  }
  for (const match of source.matchAll(/(?:^|[^\p{L}\p{N}.,+−-])([\p{L}]+|\d+)\s*(?:غرف(?:ة)? نوم|bedrooms?|chambres?)(?![\p{L}])/giu)) {
    add('bedrooms', count(match[1].replace(/^ب(?=أربع|اربع|ثلاث|خمس)/u, '')));
  }
  if (/(?:^|[^\p{L}])(?:طابقان|طابقين|دوران|دورين)(?![\p{L}])/u.test(source)) add('storeys', 2);
  if (/(?:^|[^\p{L}])(?:غرفتا نوم|غرفتي نوم)(?![\p{L}])/u.test(source)) add('bedrooms', 2);

  const data = {}, conflicts = [];
  for (const [key, options] of Object.entries(candidates)) {
    if (options.size === 1) data[key] = [...options][0];
    else if (options.size > 1) conflicts.push(key);
  }
  return { data, conflicts };
}

export function missingBriefFields(data) {
  return Object.keys(briefFields).filter(key => !Object.hasOwn(data, key));
}
