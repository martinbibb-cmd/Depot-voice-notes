import { extractToken, verifyToken } from './auth.js';

const MAX_PAYLOAD_BYTES = 2_000_000;
const MAX_PHOTO_BYTES = 15_000_000;
const TRANSFER_LIFETIME_DAYS = 7;

function headers(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SpecCheck-Device',
    ...extra
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers({ 'Content-Type': 'application/json' })
  });
}

function isoAfter(milliseconds) {
  return new Date(Date.now() + milliseconds).toISOString();
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function pwaUser(request, env) {
  const token = extractToken(request);
  if (!token) return null;
  const verified = await verifyToken(token, env.JWT_SECRET || 'default-secret-change-in-production');
  return verified?.payload?.userId ? verified.payload : null;
}

async function device(request, env) {
  const token = request.headers.get('X-SpecCheck-Device') || extractToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT id, user_id, name FROM speccheck_devices
    WHERE token_hash = ? AND revoked_at IS NULL
  `).bind(tokenHash).first();
  if (row) {
    await env.DB.prepare('UPDATE speccheck_devices SET last_used_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id).run();
  }
  return row;
}

export function validateVisitPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'JSON object required';
  if (typeof payload.nickname !== 'string' || !payload.nickname.trim()) return 'anonymous nickname required';
  if (!Array.isArray(payload.transcriptParts) && typeof payload.transcript !== 'string') {
    return 'transcript or transcriptParts required';
  }
  const encoded = JSON.stringify(payload);
  if (new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) return 'capture payload is too large';
  return null;
}

export async function handleSpecCheckTransfer(request, env, url = new URL(request.url)) {
  if (!env.DB) return json({ error: 'database_not_configured' }, 503);

  if (request.method === 'POST' && url.pathname === '/spec-check/pairing') {
    const user = await pwaUser(request, env);
    if (!user) return json({ error: 'unauthorised' }, 401);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO speccheck_pairing_codes (id, code_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), await sha256(code), user.userId, isoAfter(10 * 60 * 1000), now).run();
    return json({ code, expiresAt: isoAfter(10 * 60 * 1000) }, 201);
  }

  if (request.method === 'POST' && url.pathname === '/spec-check/pair') {
    const body = await request.json().catch(() => null);
    const code = String(body?.code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return json({ error: 'invalid_pairing_code' }, 400);
    const codeHash = await sha256(code);
    const pairing = await env.DB.prepare(`
      SELECT id, user_id FROM speccheck_pairing_codes
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
    `).bind(codeHash, new Date().toISOString()).first();
    if (!pairing) return json({ error: 'invalid_or_expired_pairing_code' }, 404);
    const token = randomToken();
    const deviceId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO speccheck_devices
        (id, user_id, token_hash, name, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(deviceId, pairing.user_id, await sha256(token), String(body?.deviceName || 'SpecCheck iPhone').slice(0, 80), now, now),
      env.DB.prepare('UPDATE speccheck_pairing_codes SET used_at = ? WHERE id = ?').bind(now, pairing.id)
    ]);
    return json({ deviceToken: token, deviceId }, 201);
  }

  if (request.method === 'POST' && url.pathname === '/spec-check/visits') {
    const pairedDevice = await device(request, env);
    if (!pairedDevice) return json({ error: 'unpaired_device' }, 401);
    const payload = await request.json().catch(() => null);
    const error = validateVisitPayload(payload);
    if (error) return json({ error: 'invalid_capture', message: error }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO speccheck_visits
      (id, user_id, device_id, nickname, payload_json, photo_count, created_on_device_at, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, pairedDevice.user_id, pairedDevice.id, payload.nickname.trim().slice(0, 100), JSON.stringify(payload),
        Number(payload.photoCount || 0), payload.createdAt || null, now,
        isoAfter(TRANSFER_LIFETIME_DAYS * 86400000)).run();
    return json({ id, status: 'pending' }, 201);
  }

  const photoMatch = url.pathname.match(/^\/spec-check\/visits\/([^/]+)\/photos\/([^/]+)$/);
  if (request.method === 'PUT' && photoMatch) {
    const pairedDevice = await device(request, env);
    if (!pairedDevice || !env.VISIT_BUCKET) return json({ error: 'photo_storage_unavailable' }, 503);
    const visit = await env.DB.prepare(`SELECT id, user_id FROM speccheck_visits
      WHERE id = ? AND device_id = ? AND status = 'pending'`)
      .bind(photoMatch[1], pairedDevice.id).first();
    if (!visit) return json({ error: 'visit_not_found' }, 404);
    const contentType = request.headers.get('Content-Type') || '';
    if (!['image/jpeg', 'image/heic', 'image/png'].includes(contentType)) return json({ error: 'unsupported_photo_type' }, 415);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: 'invalid_photo_size' }, 413);
    const photoId = photoMatch[2];
    const rowId = `${visit.id}:${photoId}`;
    const key = `${visit.user_id}/${visit.id}/${photoId}`;
    await env.VISIT_BUCKET.put(key, bytes, { httpMetadata: { contentType } });
    await env.DB.prepare(`INSERT INTO speccheck_photos
      (id, source_id, visit_id, user_id, r2_key, content_type, caption, subject, byte_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET content_type=excluded.content_type, caption=excluded.caption,
        subject=excluded.subject, byte_count=excluded.byte_count, created_at=excluded.created_at`)
      .bind(rowId, photoId, visit.id, visit.user_id, key, contentType,
        request.headers.get('X-Photo-Caption'), request.headers.get('X-Photo-Subject'), bytes.byteLength,
        new Date().toISOString()).run();
    return json({ id: photoId, stored: true }, 201);
  }

  if (request.method === 'GET' && photoMatch) {
    const user = await pwaUser(request, env);
    if (!user || !env.VISIT_BUCKET) return json({ error: 'unauthorised' }, 401);
    const photo = await env.DB.prepare(`SELECT r2_key, content_type FROM speccheck_photos
      WHERE source_id = ? AND visit_id = ? AND user_id = ?`).bind(photoMatch[2], photoMatch[1], user.userId).first();
    if (!photo) return json({ error: 'photo_not_found' }, 404);
    const object = await env.VISIT_BUCKET.get(photo.r2_key);
    if (!object) return json({ error: 'photo_not_found' }, 404);
    return new Response(object.body, {
      headers: headers({ 'Content-Type': photo.content_type, 'Cache-Control': 'private, max-age=300' })
    });
  }

  if (request.method === 'GET' && url.pathname === '/spec-check/visits') {
    const user = await pwaUser(request, env);
    if (!user) return json({ error: 'unauthorised' }, 401);
    const rows = await env.DB.prepare(`SELECT id, nickname, photo_count, created_on_device_at, created_at, expires_at, status
      FROM speccheck_visits WHERE user_id = ? AND status IN ('pending', 'consumed') AND expires_at > ?
      ORDER BY created_at DESC`).bind(user.userId, new Date().toISOString()).all();
    return json({ visits: rows.results || [] });
  }

  const visitMatch = url.pathname.match(/^\/spec-check\/visits\/([^/]+)$/);
  if (visitMatch && request.method === 'GET') {
    const user = await pwaUser(request, env);
    if (!user) return json({ error: 'unauthorised' }, 401);
    const row = await env.DB.prepare(`SELECT id, nickname, payload_json, created_at, expires_at
      FROM speccheck_visits WHERE id = ? AND user_id = ? AND expires_at > ?`)
      .bind(visitMatch[1], user.userId, new Date().toISOString()).first();
    if (!row) return json({ error: 'visit_not_found' }, 404);
    const photos = await env.DB.prepare(`SELECT source_id AS id, caption, subject, content_type, byte_count
      FROM speccheck_photos WHERE visit_id = ? ORDER BY created_at`).bind(row.id).all();
    return json({ ...row, payload: JSON.parse(row.payload_json), payload_json: undefined, photos: photos.results || [] });
  }

  const consumeMatch = url.pathname.match(/^\/spec-check\/visits\/([^/]+)\/consume$/);
  if (request.method === 'POST' && consumeMatch) {
    const user = await pwaUser(request, env);
    if (!user) return json({ error: 'unauthorised' }, 401);
    await env.DB.prepare(`UPDATE speccheck_visits SET status = 'consumed', consumed_at = ?
      WHERE id = ? AND user_id = ?`).bind(new Date().toISOString(), consumeMatch[1], user.userId).run();
    return json({ consumed: true });
  }

  return null;
}
