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
  const hasTranscript = Array.isArray(payload.transcriptParts) || typeof payload.transcript === 'string';
  const structured = payload.structuredVisit;
  const hasStructuredSurvey = Number(payload.schemaVersion || 1) >= 3 && structured && typeof structured === 'object' &&
    (Array.isArray(structured.existing) || Array.isArray(structured.customer) || Array.isArray(structured.proposals));
  if (!hasTranscript && !hasStructuredSurvey) {
    return 'transcript or structuredVisit required';
  }
  if (payload.sourceVisitId != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sourceVisitId)) {
    return 'sourceVisitId must be a UUID';
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
    const sourceVisitId = typeof payload.sourceVisitId === 'string' ? payload.sourceVisitId.toLowerCase() : null;
    const now = new Date().toISOString();
    const existing = sourceVisitId ? await env.DB.prepare(`SELECT id FROM speccheck_visits
      WHERE user_id = ? AND source_visit_id = ?`)
      .bind(pairedDevice.user_id, sourceVisitId).first() : null;
    const id = existing?.id || crypto.randomUUID();
    if (existing) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE speccheck_visits SET device_id = ?, nickname = ?, payload_json = ?, photo_count = ?,
          created_on_device_at = ?, created_at = ?, expires_at = ?, consumed_at = NULL, status = 'pending'
          WHERE id = ?`)
          .bind(pairedDevice.id, payload.nickname.trim().slice(0, 100), JSON.stringify(payload), Number(payload.photoCount || 0),
            payload.createdAt || null, now, isoAfter(TRANSFER_LIFETIME_DAYS * 86400000), id),
        env.DB.prepare('DELETE FROM speccheck_processing_states WHERE visit_id = ?').bind(id),
        env.DB.prepare(`INSERT INTO speccheck_visit_revisions
          (id, visit_id, revision_number, payload_json, photo_count, received_at, expires_at)
          SELECT ?, ?, COALESCE(MAX(revision_number), 0) + 1, ?, ?, ?, ?
          FROM speccheck_visit_revisions WHERE visit_id = ?`)
          .bind(crypto.randomUUID(), id, JSON.stringify(payload), Number(payload.photoCount || 0), now,
            isoAfter(TRANSFER_LIFETIME_DAYS * 86400000), id)
      ]);
      if (Array.isArray(payload.photoIds) && env.VISIT_BUCKET) {
        const retained = new Set(payload.photoIds.map(value => String(value).toLowerCase()));
        const prior = await env.DB.prepare('SELECT id, source_id, r2_key FROM speccheck_photos WHERE visit_id = ?').bind(id).all();
        for (const photo of prior.results || []) {
          if (!retained.has(String(photo.source_id).toLowerCase())) {
            await env.VISIT_BUCKET.delete(photo.r2_key);
            await env.DB.prepare('DELETE FROM speccheck_photos WHERE id = ?').bind(photo.id).run();
          }
        }
      }
      return json({
        id, status: 'pending', replacedExistingTransfer: true,
        roomCount: Array.isArray(payload.rooms) ? payload.rooms.length : 0,
        wholeHouseStructureIncluded: Boolean(payload.wholeHouseStructure?.alignedByStructureBuilder)
      }, 200);
    }
    await env.DB.prepare(`INSERT INTO speccheck_visits
      (id, user_id, device_id, source_visit_id, nickname, payload_json, photo_count, created_on_device_at, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, pairedDevice.user_id, pairedDevice.id, sourceVisitId, payload.nickname.trim().slice(0, 100), JSON.stringify(payload),
        Number(payload.photoCount || 0), payload.createdAt || null, now,
        isoAfter(TRANSFER_LIFETIME_DAYS * 86400000)).run();
    await env.DB.prepare(`INSERT INTO speccheck_visit_revisions
      (id, visit_id, revision_number, payload_json, photo_count, received_at, expires_at)
      VALUES (?, ?, 1, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, JSON.stringify(payload), Number(payload.photoCount || 0), now,
        isoAfter(TRANSFER_LIFETIME_DAYS * 86400000)).run().catch(() => {});
    return json({
      id, status: 'pending',
      roomCount: Array.isArray(payload.rooms) ? payload.rooms.length : 0,
      wholeHouseStructureIncluded: Boolean(payload.wholeHouseStructure?.alignedByStructureBuilder)
    }, 201);
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
      FROM speccheck_visits v WHERE user_id = ? AND status IN ('pending', 'consumed') AND expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM speccheck_visits newer
        WHERE newer.user_id = v.user_id AND newer.id <> v.id
        AND newer.nickname = v.nickname
        AND COALESCE(newer.created_on_device_at, '') = COALESCE(v.created_on_device_at, '')
        AND newer.created_at > v.created_at)
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

  const processingMatch = url.pathname.match(/^\/spec-check\/visits\/([^/]+)\/processing-state$/);
  if (processingMatch && (request.method === 'GET' || request.method === 'PUT')) {
    const user = await pwaUser(request, env);
    if (!user) return json({ error: 'unauthorised' }, 401);
    const visit = await env.DB.prepare(`SELECT id FROM speccheck_visits
      WHERE id = ? AND user_id = ? AND expires_at > ?`)
      .bind(processingMatch[1], user.userId, new Date().toISOString()).first();
    if (!visit) return json({ error: 'visit_not_found' }, 404);
    if (request.method === 'GET') {
      const state = await env.DB.prepare(`SELECT interpretation_json, checklists_json, updated_at
        FROM speccheck_processing_states WHERE visit_id = ? AND user_id = ?`)
        .bind(visit.id, user.userId).first();
      return json(state ? {
        interpretation: JSON.parse(state.interpretation_json),
        checklists: JSON.parse(state.checklists_json),
        updatedAt: state.updated_at
      } : { interpretation: null, checklists: {} });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body.interpretation !== 'object' || Array.isArray(body.interpretation) ||
        !body.checklists || typeof body.checklists !== 'object' || Array.isArray(body.checklists)) {
      return json({ error: 'invalid_processing_state' }, 400);
    }
    const encoded = JSON.stringify(body);
    if (new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) {
      return json({ error: 'processing_state_too_large' }, 413);
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO speccheck_processing_states
      (visit_id, user_id, interpretation_json, checklists_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(visit_id) DO UPDATE SET interpretation_json=excluded.interpretation_json,
        checklists_json=excluded.checklists_json, updated_at=excluded.updated_at`)
      .bind(visit.id, user.userId, JSON.stringify(body.interpretation), JSON.stringify(body.checklists), now, now).run();
    return json({ saved: true, updatedAt: now });
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
