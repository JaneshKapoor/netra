#!/usr/bin/env node
/**
 * mock-sync-server.js — local stand-in for SYNC_ENDPOINT during E2E testing.
 *
 * Zero-dependency Node HTTP server. Accepts POSTs of attendance batches,
 * logs them, and returns 200 OK so the device marks rows synced and purges.
 *
 *   node scripts/mock-sync-server.js [--port 8787]
 *
 * Point .env's SYNC_ENDPOINT at http://<your-LAN-IP>:8787/attendance.
 */
const http = require('http');

const PORT = Number(
  (process.argv.find(a => a.startsWith('--port=')) || '').split('=')[1] ||
    process.env.PORT ||
    8787,
);

let batchCount = 0;
let recordCount = 0;

const server = http.createServer((req, res) => {
  const ts = new Date().toISOString();
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed\n');
    console.log(`[${ts}] ${req.method} ${req.url} -> 405`);
    return;
  }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad JSON\n');
      console.log(`[${ts}] POST ${req.url} -> 400 (bad JSON)  raw=${raw.slice(0, 200)}`);
      return;
    }
    const records = Array.isArray(body && body.records) ? body.records : [];
    batchCount += 1;
    recordCount += records.length;
    console.log(
      `[${ts}] POST ${req.url} -> 200  batch=#${batchCount} records=${records.length} (total=${recordCount})`,
    );
    for (const r of records) {
      console.log(
        `   • id=${r.id} person=${r.personId} ts=${r.ts} ` +
          `lat=${r.lat} lng=${r.lng} idemp=${r.idempotencyKey}`,
      );
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ackedRecords: records.length }) + '\n');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`mock-sync-server listening on http://0.0.0.0:${PORT}`);
  console.log('Set SYNC_ENDPOINT in .env to http://<your-LAN-IP>:' + PORT + '/attendance');
  console.log('Press Ctrl+C to stop.');
});
