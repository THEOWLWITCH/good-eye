/*
 * Good Eye / עין טובה — sync endpoint (Netlify Function + Netlify Blobs).
 *
 * The server only ever sees ENCRYPTED data: devices encrypt with a key derived from the family
 * sync code before sending (AES-GCM, see js/core/sync.js). The blob key is a SHA-256 hash of the
 * code, so the server knows neither the code nor the content.
 *
 *   GET  /api/sync?id=<64 hex>   -> 200 { iv, data, updatedAt } | 404
 *   PUT  /api/sync?id=<64 hex>   body { iv, data, updatedAt }  -> 200 { ok: true, updatedAt }
 *   DELETE /api/sync?id=<64 hex>  -> 200 { ok: true }   (the family removes its data from the server)
 */
const MAX_BYTES = 6 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{64}$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

/** Request handler; `store` needs get(key, {type:'json'}), setJSON(key, value) and delete(key). */
export async function handle(req, store) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  if (!ID_RE.test(id)) return json(400, { error: 'bad id' });

  if (req.method === 'GET') {
    const v = await store.get(id, { type: 'json' });
    return v ? json(200, v) : json(404, { error: 'not found' });
  }

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { error: 'too large' });
    let body;
    try { body = JSON.parse(text); } catch (e) { return json(400, { error: 'bad json' }); }
    if (!body || typeof body.iv !== 'string' || typeof body.data !== 'string' || body.iv.length > 64) {
      return json(400, { error: 'bad body' });
    }
    const updatedAt = new Date().toISOString();
    await store.setJSON(id, { v: 1, iv: body.iv, data: body.data, updatedAt });
    return json(200, { ok: true, updatedAt });
  }

  if (req.method === 'DELETE') {
    await store.delete(id);
    return json(200, { ok: true });
  }

  return json(405, { error: 'method not allowed' });
}

export default async (req) => {
  const { getStore } = await import('@netlify/blobs');
  return handle(req, getStore({ name: 'good-eye-sync', consistency: 'strong' }));
};

export const config = { path: '/api/sync' };
