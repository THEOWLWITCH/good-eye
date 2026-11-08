/*
 * Local development server: serves the app and the /api/sync function (with an in-memory store),
 * so sync can be tried without Netlify.   node tools/dev-server.mjs [port]
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handle } from '../netlify/functions/sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.argv[2] || 8766;
const mem = new Map();
const store = { get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : null), setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); }, delete: async (k) => { mem.delete(k); } };
// the same security headers as on Netlify (read from netlify.toml)
const toml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
const HEADERS = Object.fromEntries([...toml.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"\s*$/gm)].filter((m) => /-/.test(m[1])).map((m) => [m[1], m[2]]));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/sync') {
    const body = req.method === 'PUT' ? await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }) : undefined;
    const out = await handle(new Request('http://localhost' + req.url, { method: req.method, body }), store);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(await out.text());
    return;
  }
  const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, Object.assign({ 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }, HEADERS));
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log('Good Eye dev server on http://localhost:' + port));
