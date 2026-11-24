import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSaudiInputs, saudiProjectReview, saudiSources } from '../engine.js';

const input = cleanSaudiInputs({
  municipality: 'بلدية الاختبار', parcelReference: 'قطعة اختبار',
  workType: 'new', buildingType: 'mixed-apartment', landArea: 600,
  groundArea: 400, upperArea: 450, roofArea: 0, roofBaseArea: 450,
  units: 3, parking: 4, streetWidth: 22, frontSetback: 4,
});

test('mixed residential screening rounds parking and checks front setback independently', () => {
  const review = saudiProjectReview(input, 'الرياض');
  assert.equal(review.filter(result => result.status === 'draft').length, 5);
  assert.match(review[0].source, /المادة الثانية/);
  assert.match(review[5].message, /5 موقفًا.*التجارية/);
  assert.match(review[6].message, /4\.40 م/);
  assert.match(review[2].message, /تتجاوز/);
});

test('street minimum and zero parking are measured values while missing values stay pending', () => {
  const review = saudiProjectReview(cleanSaudiInputs({ ...input, parking: 0, streetWidth: 10, frontSetback: null }), 'جدة');
  assert.match(review[5].message, /المدخل 0/);
  assert.equal(review[6].status, 'pending');
  const bounded = saudiProjectReview({ ...input, streetWidth: 10, frontSetback: 3 }, 'جدة');
  assert.match(bounded[6].message, /3\.00 م.*يبلغ الحد/);
});

test('missing site and unrelated categories never run apartment comparisons', () => {
  assert.equal(saudiProjectReview(input, '').length, 2);
  assert.equal(saudiProjectReview({ ...input, workType: 'change-use' }, 'الرياض')[0].status, 'review');
  assert.equal(saudiProjectReview({ ...input, workType: 'change-use' }, 'الرياض').length, 2);
  assert.equal(saudiProjectReview({ ...input, buildingType: 'villa' }, 'الرياض').length, 2);
  assert.ok(saudiSources.some(source => source.category === 'أهداف استراتيجية'));
});

test('separate site boundaries use their own widths and the verified floor-count distinction', () => {
  const metrics = cleanSaudiInputs({ ...input, floorCount: 5, edges: [
    { name:'غرب', kind:'street', streetWidth:15, setback:3 },
    { name:'شرق', kind:'neighbor', setback:2.5 },
    { name:'ممر', kind:'other', setback:9 },
  ] });
  const edges = (values) => saudiProjectReview(values, 'الرياض').slice(7, 10);
  const [street, neighbor, special] = edges(metrics);
  assert.match(street.message, /3\.00 م.*يبلغ الحد/);
  assert.match(neighbor.message, /2\.00 م.*يبلغ الحد/);
  assert.equal(special.status, 'review');
  assert.match(edges({ ...metrics, floorCount: 6 })[1].message, /3\.00 م.*أقل/);
  assert.equal(edges({ ...metrics, floorCount: null })[1].status, 'pending');
});

test('commercial parking is a separate lower bound and accessibility stays a review referral', () => {
  const review = saudiProjectReview(cleanSaudiInputs({ ...input, shopCount: 4, retailArea: 180, retailParking: 3 }), 'جدة');
  assert.match(review.at(-2).message, /الإجمالية وعدد المحلات 4.*أقل/);
  assert.match(review.at(-1).message, /تندرج/);
  assert.equal(review.at(-1).status, 'review');
  const homes = { ...input, buildingType:'apartment' };
  assert.match(saudiProjectReview(homes, 'جدة').at(-1).message, /دون عتبة/);
  assert.match(saudiProjectReview({ ...homes, units:4 }, 'جدة').at(-1).message, /تندرج/);
});
