import assert from 'node:assert/strict';
import test from 'node:test';
import { groundedCity, suggestBriefCity } from '../brief-ai.mjs';

test('only an explicit city span survives as a suggestion, without dimensions or overrides', () => {
  for (const [description, city] of [
    ['أريد فيلا في حائل من طابق واحد.', 'حائل'],
    ['A house in Al Ula with two bedrooms.', 'Al Ula'],
    ['Maison à Tabouk, deux étages.', 'Tabouk'],
  ]) {
    assert.equal(groundedCity(description, { city }), city);
    assert.equal(groundedCity(description, { city, frontage: 20 }), null);
    assert.equal(groundedCity(description, { city: 'باريس' }), null);
  }
  assert.equal(groundedCity('فيلا في الخرج', { city: 'خرج' }), null);
  assert.equal(groundedCity('فيلا خارج نطاق الرياض', { city: 'الرياض' }), null);
  assert.equal(groundedCity('فيلا في الرياض أو جدة', { city: 'جدة' }), null);
  assert.equal(groundedCity('فيلا من طابقين', { city: null }), null);
});

test('uses local Ollama structured chat and keeps full, incomplete and conflicting inputs safe', async () => {
  const description = 'Maison à Tabouk. Largeur du terrain 20 m. Profondeur 30 m. 2 étages et 4 chambres.';
  let requests = 0;
  const provider = async (url, request) => {
    requests++;
    const body = JSON.parse(request.body);
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
    assert.equal(body.model, 'test-model');
    assert.deepEqual(body.format.required, ['city']);
    assert.equal(body.format.additionalProperties, false);
    assert.equal(body.messages[1].content, description);
    return Response.json({ message: { content: '{"city":"Tabouk"}' } });
  };
  assert.equal(await suggestBriefCity(description, 'test-model', provider), 'Tabouk');
  assert.equal(await suggestBriefCity('في الرياض أو جدة', 'test-model', provider), null);
  assert.equal(await suggestBriefCity('فيلا في جدة', 'test-model', provider), null);
  assert.equal(requests, 1);
  assert.equal(await suggestBriefCity('فيلا من طابقين', 'test-model',
    async () => Response.json({ message: { content: '{"city":"حائل"}' } })), null);
  await assert.rejects(suggestBriefCity(description, 'test-model', async () => new Response('', { status: 503 })),
    /Ollama unavailable/);
  await assert.rejects(suggestBriefCity(description, 'test-model',
    async () => Response.json({ message: { content: 'broken JSON' } })), SyntaxError);
});
