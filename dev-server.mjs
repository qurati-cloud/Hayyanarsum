import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestBriefCity } from './brief-ai.mjs';

const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const host = value('--host') || '127.0.0.1';
const port = Number(value('--port') ?? 8000);
const model = process.env.HAYYANARSUM_OLLAMA_MODEL?.trim();
const aiEnabled = host === '127.0.0.1' && /^[a-z0-9][a-z0-9._:/-]{0,127}$/i.test(model ?? '') &&
  !/cloud/i.test(model);
const assets = new Set([
  'index.html', 'app.js', 'styles.css', 'hayyanarsum-logo.png', 'engine.js', 'bcf.js', 'coordination.js',
  'dxf-import.js', 'ifc.js', 'project-brief.js', 'thermal.js', 'wall-volume.js', 'zip.js',
]);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const root = fileURLToPath(new URL('.', import.meta.url));

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function citySuggestion(req, res) {
  if (!aiEnabled) return json(res, 404, { error: 'disabled' });
  const origin = 'http://127.0.0.1:' + req.socket.localPort;
  if (req.method !== 'POST' || 'http://' + req.headers.host !== origin || req.headers.origin !== origin ||
      req.headers['content-type'] !== 'application/json') {
    return json(res, 403, { error: 'request' });
  }
  let size = 0;
  const staged = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 16384) staged.push(chunk);
    else {
      res.setHeader('Connection', 'close');
      return json(res, 413, { error: 'size' });
    }
  }
  let description;
  try {
    ({ description } = JSON.parse(Buffer.concat(staged).toString('utf8')));
  } catch {
    return json(res, 400, { error: 'description' });
  }
  if (typeof description !== 'string' || !description.trim() || description.length > 4000) {
    return json(res, 400, { error: 'description' });
  }
  try {
    return json(res, 200, { city: await suggestBriefCity(description, model) });
  } catch {
    return json(res, 503, { error: 'provider' });
  }
}

http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/brief-city') return await citySuggestion(req, res);
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!assets.has(file) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const contents = await readFile(path.join(root, file));
    const page = file === 'index.html' && aiEnabled
      ? contents.toString().replace('</head>', '<meta name="brief-ai" content="ollama"></head>')
      : contents;
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] }).end(page);
  } catch {
    if (!res.headersSent && !res.destroyed) res.writeHead(500).end('Server error');
  }
}).listen(port, host, function () {
  console.log(`Hayyanarsum preview http://${host}:${this.address().port}`);
});
