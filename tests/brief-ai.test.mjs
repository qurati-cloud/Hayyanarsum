import assert from 'node:assert/strict';
import test from 'node:test';
import { groundedCity, LocalBriefModelMissing, suggestBriefCity } from '../brief-ai.mjs';

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

const available = () => Response.json({ models: [{ model: 'test-model:latest', size: 1_000_000 }] });

test('uses local Ollama structured chat and keeps full, incomplete and conflicting inputs safe', async () => {
  const description = 'Maison à Tabouk. Largeur du terrain 20 m. Profondeur 30 m. 2 étages et 4 chambres.';
  let requests = 0;
  const provider = async (url, request) => {
    requests++;
    if (url.endsWith('/api/tags')) {
      assert.equal(url, 'http://127.0.0.1:11434/api/tags');
      assert.equal(request.method, 'GET');
      assert.equal(request.redirect, 'error');
      assert.equal(request.body, undefined);
      return available();
    }
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
  assert.equal(requests, 2);
  assert.equal(await suggestBriefCity('فيلا من طابقين', 'test-model', async url =>
    url.endsWith('/api/tags') ? available() : Response.json({ message: { content: '{"city":"حائل"}' } })), null);
  await assert.rejects(suggestBriefCity(description, 'test-model:latest', async url =>
    url.endsWith('/api/tags') ? available() : new Response('', { status: 503 })), /Ollama unavailable/);
  await assert.rejects(suggestBriefCity(description, 'test-model', async url =>
    url.endsWith('/api/tags') ? available() : Response.json({ message: { content: 'broken JSON' } })), SyntaxError);
});

test('never sends the project description when the configured model is absent or marked as remote', async () => {
  const description = 'A house in Al Ula with two bedrooms.';
  for (const models of [
    [],
    [{ model: 'test-model:other', size: 1000 }],
    [{ model: 'test-model:latest', size: 0 }],
    [{ model: 'test-model:latest', size: 1000, remote_model: 'test-remote' }],
    [{ model: 'test-model:latest', size: 1000, remote_host: 'https://example.invalid' }],
  ]) {
    await assert.rejects(suggestBriefCity(description, 'test-model', async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/tags');
      assert.ok(!JSON.stringify(options).includes(description));
      return Response.json({ models });
    }), LocalBriefModelMissing);
  }
  await assert.rejects(suggestBriefCity(description, 'test-model', async () => Response.json({})),
    /Invalid Ollama model list/);
  await assert.rejects(suggestBriefCity(description, 'test-model', async () => new Response('', { status: 503 })),
    /Ollama unavailable/);
});
