/**
 * Cloud session handlers for Cloudflare Worker
 * Handles saving and loading survey sessions to/from D1 database
 */

import { verifyToken, extractToken } from './auth.js';

/**
 * Initialize sessions table if it doesn't exist
 */
export async function initializeSessionsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_name TEXT NOT NULL,
      session_data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, session_name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // Create index for faster lookups
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
    ON user_sessions(user_id)
  `).run();

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_updated
    ON user_sessions(user_id, updated_at DESC)
  `).run();
}

/**
 * Helper function to create JSON response with CORS headers
 */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Handle save session to cloud
 * POST /cloud-session
 */
export async function handleSaveSession(request, env) {
  // Verify authentication
  const token = extractToken(request);
  if (!token) {
    return jsonResponse({
      error: 'unauthorized',
      message: 'Authorization token required'
    }, 401);
  }

  const secret = env.JWT_SECRET || 'default-secret-change-in-production';
  const decoded = await verifyToken(token, secret);

  if (!decoded || !decoded.userId) {
    return jsonResponse({
      error: 'unauthorized',
      message: 'Invalid or expired token'
    }, 401);
  }

  // Parse request body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({
      error: 'bad_request',
      message: 'JSON body required'
    }, 400);
  }

  const { sessionName, sessionData } = payload;

  if (!sessionName || typeof sessionName !== 'string') {
    return jsonResponse({
      error: 'validation_error',
      message: 'sessionName is required'
    }, 400);
  }

  if (!sessionData || typeof sessionData !== 'object') {
    return jsonResponse({
      error: 'validation_error',
      message: 'sessionData is required and must be an object'
    }, 400);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  try {
    // Initialize sessions table if needed
    await initializeSessionsTable(env.DB);

    const userId = decoded.userId;
    const now = new Date().toISOString();
    const sessionDataJson = JSON.stringify(sessionData);

    // Upsert session (insert or update if exists)
    await env.DB.prepare(`
      INSERT INTO user_sessions (user_id, session_name, session_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, session_name) DO UPDATE SET
        session_data = excluded.session_data,
        updated_at = excluded.updated_at
    `).bind(userId, sessionName, sessionDataJson, now, now).run();

    return jsonResponse({
      success: true,
      message: 'Session saved successfully',
      sessionName
    });

  } catch (error) {
    console.error('Failed to save session:', error);
    return jsonResponse({
      error: 'server_error',
      message: 'Failed to save session: ' + error.message
    }, 500);
  }
}

/**
 * Handle load sessions from cloud
 * GET /cloud-session?sessionName=xxx (load specific session)
 * GET /cloud-session (list all sessions)
 */
export async function handleLoadSession(request, env) {
  // Verify authentication
  const token = extractToken(request);
  if (!token) {
    return jsonResponse({
      error: 'unauthorized',
      message: 'Authorization token required'
    }, 401);
  }

  const secret = env.JWT_SECRET || 'default-secret-change-in-production';
  const decoded = await verifyToken(token, secret);

  if (!decoded || !decoded.userId) {
    return jsonResponse({
      error: 'unauthorized',
      message: 'Invalid or expired token'
    }, 401);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  try {
    // Initialize sessions table if needed
    await initializeSessionsTable(env.DB);

    const userId = decoded.userId;
    const url = new URL(request.url);
    const sessionName = url.searchParams.get('sessionName');

    if (sessionName) {
      // Load specific session
      const result = await env.DB.prepare(`
        SELECT session_name, session_data, created_at, updated_at
        FROM user_sessions
        WHERE user_id = ? AND session_name = ?
      `).bind(userId, sessionName).first();

      if (!result) {
        return jsonResponse({
          error: 'not_found',
          message: 'Session not found'
        }, 404);
      }

      return jsonResponse({
        success: true,
        sessionName: result.session_name,
        sessionData: JSON.parse(result.session_data),
        createdAt: result.created_at,
        updatedAt: result.updated_at
      });

    } else {
      // List all sessions for user
      const results = await env.DB.prepare(`
        SELECT session_name, created_at, updated_at
        FROM user_sessions
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).bind(userId).all();

      return jsonResponse({
        success: true,
        sessions: results.results || []
      });
    }

  } catch (error) {
    console.error('Failed to load session:', error);
    return jsonResponse({
      error: 'server_error',
      message: 'Failed to load session: ' + error.message
    }, 500);
  }
}

/**
 * Handle delete session from cloud
 * DELETE /cloud-session?sessionName=xxx
 */
export async function handleDeleteSession(request, env) {
  // Verify authentication
  const token = extractToken(request);
  if (!token) {
    return jsonResponse({
      error: 'unauthorized',
      message: 'Authorization token required'
    }, 401);
  }

  const secret = env.JWT_SECRET || 'default-secret-change-in-production';
  const decoded = await verifyToken(token, secret);

  if (!decoded || !decoded.userId) {
    return jsonResponse({
      error: 'unauthorized',
      message: 'Invalid or expired token'
    }, 401);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  const url = new URL(request.url);
  const sessionName = url.searchParams.get('sessionName');

  if (!sessionName) {
    return jsonResponse({
      error: 'validation_error',
      message: 'sessionName query parameter is required'
    }, 400);
  }

  try {
    const userId = decoded.userId;

    const result = await env.DB.prepare(`
      DELETE FROM user_sessions
      WHERE user_id = ? AND session_name = ?
    `).bind(userId, sessionName).run();

    if (result.changes === 0) {
      return jsonResponse({
        error: 'not_found',
        message: 'Session not found'
      }, 404);
    }

    return jsonResponse({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Failed to delete session:', error);
    return jsonResponse({
      error: 'server_error',
      message: 'Failed to delete session: ' + error.message
    }, 500);
  }
}
