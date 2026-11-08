/* Tests for encrypted sync: server handler, encryption round-trip and merge.  node tests/sync-tests.mjs */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { handle } from '../netlify/functions/sync.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
['js/core/i18n-en.js', 'js/core/i18n.js', 'js/core/storage.js', 'js/core/cloud.js', 'js/core/settings.js', 'js/core/profiles.js', 'js/core/sync.js']
  .forEach((f) => require(path.join(here, '..', f)));
const DA = globalThis.DA;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack || e)); }
}
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

function memStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); }, delete: async (k) => { m.delete(k); }, m };
}
const ID = 'a'.repeat(64);

console.log('Sync server');
await test('rejects bad ids', async () => {
  const r = await handle(new Request('https://x/api/sync?id=nothex'), memStore());
  ok(r.status === 400);
});
await test('404 before first upload, then stores and returns ciphertext only', async () => {
  const st = memStore();
  ok((await handle(new Request('https://x/api/sync?id=' + ID), st)).status === 404);
  const put = await handle(new Request('https://x/api/sync?id=' + ID, { method: 'PUT', body: JSON.stringify({ iv: 'aXY=', data: 'Y2lwaGVy', secret: 'x' }) }), st);
  ok(put.status === 200);
  const got = await (await handle(new Request('https://x/api/sync?id=' + ID), st)).json();
  ok(got.iv === 'aXY=' && got.data === 'Y2lwaGVy' && !('secret' in got), 'only iv/data are kept');
});
await test('rejects oversized bodies and other methods', async () => {
  const st = memStore();
  const big = await handle(new Request('https://x/api/sync?id=' + ID, { method: 'PUT', body: 'x'.repeat(6 * 1024 * 1024 + 10) }), st);
  ok(big.status === 413);
  ok((await handle(new Request('https://x/api/sync?id=' + ID, { method: 'POST' }), st)).status === 405);
});

await test('a family can delete its data from the server', async () => {
  const st = memStore();
  await handle(new Request('https://x/api/sync?id=' + ID, { method: 'PUT', body: JSON.stringify({ iv: 'aaaa', data: 'bbbb' }) }), st);
  ok((await handle(new Request('https://x/api/sync?id=' + ID, { method: 'DELETE' }), st)).status === 200);
  ok((await handle(new Request('https://x/api/sync?id=' + ID), st)).status === 404);
});

console.log('Encryption');
await test('codes have 16 characters from a clear alphabet', async () => {
  const c = DA.sync.newCode();
  ok(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(c), c);
  ok(!/[01IOL]/.test(c.replace(/-/g, '')), 'no look-alike characters');
});
await test('round-trip with the right code, failure with a wrong one', async () => {
  const c = DA.sync.newCode();
  const k = await DA.sync._keys(c);
  ok(/^[0-9a-f]{64}$/.test(k.id));
  const payload = await DA.sync._encrypt({ hello: 'שלום', n: [1, 2, 3] }, k.key);
  ok(!payload.data.includes('שלום'));
  const back = await DA.sync._decrypt(payload, k.key);
  ok(back.hello === 'שלום' && back.n.length === 3);
  const wrong = await DA.sync._keys(DA.sync.newCode());
  let threw = false;
  try { await DA.sync._decrypt(payload, wrong.key); } catch (e) { threw = true; }
  ok(threw, 'wrong code cannot decrypt');
});

console.log('Merge');
function device() {
  const store = new DA.storage.Store(DA.storage.memoryBackend());
  return { store, profiles: new DA.ProfileStore(store) };
}
await test('profiles merge by newest, sessions and trials are added', async () => {
  const a = device(), b = device();
  const p = a.profiles.create('נועה', '🦊', 'child');
  p.updatedAt = '2026-01-01T00:00:00.000Z'; a.profiles.save(p, true);
  const pb = JSON.parse(JSON.stringify(p)); pb.settings.fontSize = 40; pb.updatedAt = '2026-02-01T00:00:00.000Z';
  b.profiles.save(pb, true);
  a.profiles.saveSession({ id: 'S1', profileId: p.id, kind: 'learn', startedAt: '2026-01-02' }, true);
  a.store.saveTrial({ schema: 'da.trial/1', id: 'T1', profileId: p.id, savedAt: '2026-01-03', actions: [], model: { ops: [] } });
  // device B pulls A's bundle
  const bundleA = { profiles: a.profiles.list(), sessions: a.profiles.sessionsFor(p.id), trials: a.store.allTrials(), tombs: {} };
  const save = DA.sync._merge;
  // point merge at device B
  const ctxB = { profiles: b.profiles, store: b.store };
  DA.sync.init(ctxB);            // sets the context (not available in node, so no network)
  const changed = save(bundleA);
  ok(changed === 2, 'session + trial added, older profile ignored (changed=' + changed + ')');
  ok(b.profiles.get(p.id).settings.fontSize === 40, 'newer profile kept');
  ok(b.profiles.sessionsFor(p.id).length === 1 && b.store.getTrial('T1'), 'session and trial arrived');
});
await test('deletions travel as tombstones', async () => {
  const b = device();
  const p = b.profiles.create('יעל', '🐼', 'adult');
  DA.sync.init({ profiles: b.profiles, store: b.store });
  DA.sync._merge({ profiles: [], sessions: [], trials: [], tombs: { ['profile:' + p.id]: '2026-03-01' } });
  ok(!b.profiles.get(p.id), 'profile deleted elsewhere is removed here');
  DA.sync._merge({ profiles: [p], sessions: [], trials: [], tombs: {} });
  ok(!b.profiles.get(p.id), 'and does not come back');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
