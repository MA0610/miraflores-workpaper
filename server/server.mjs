// Workpaper sync server: serves the built app and keeps the shared, append-only
// workpaper ledger. No dependencies. Events are stored one JSON object per line.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const logFile = path.join(dataDir, 'ledger.jsonl');
const distDir = path.join(root, 'dist');
const port = Number(process.env.PORT || 8787);

fs.mkdirSync(dataDir, { recursive: true });

/** @type {any[]} */
let events = [];
if (fs.existsSync(logFile)) {
  events = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const ids = new Set(events.map((e) => e.id));

/** @type {Set<http.ServerResponse>} */
const clients = new Set();
function broadcast(kind, payload) {
  const msg = `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(msg);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 25e6) reject(new Error('too large'));
    });
    req.on('end', () => resolve(body));
  });
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  try {
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, events: events.length }));
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(events));
    }
    if (url.pathname === '/api/events' && req.method === 'POST') {
      const incoming = JSON.parse(await readBody(req));
      const added = [];
      for (const e of Array.isArray(incoming) ? incoming : [incoming]) {
        if (!e || !e.id || ids.has(e.id)) continue;
        e.serverSeq = events.length + 1;
        events.push(e);
        ids.add(e.id);
        added.push(e);
      }
      if (added.length) {
        fs.appendFileSync(logFile, added.map((e) => JSON.stringify(e)).join('\n') + '\n');
        broadcast('events', added);
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ added: added.length }));
    }
    if (url.pathname === '/api/reset' && req.method === 'POST') {
      // Demo convenience only: archives the ledger rather than deleting it.
      if (fs.existsSync(logFile)) fs.renameSync(logFile, `${logFile}.${Date.now()}.bak`);
      events = [];
      ids.clear();
      broadcast('reset', {});
      res.writeHead(200);
      return res.end('{}');
    }
    if (url.pathname === '/api/presence' && req.method === 'POST') {
      broadcast('presence', JSON.parse(await readBody(req)));
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    // Static files (built app). The packet is served exactly as delivered from /packet.json.
    let file = path.join(distDir, decodeURIComponent(url.pathname));
    if (!file.startsWith(distDir)) {
      res.writeHead(403);
      return res.end();
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404);
      return res.end('Build the app first: npm run build');
    }
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(port, () => console.log(`workpaper server on http://localhost:${port} (${events.length} ledger events)`));
