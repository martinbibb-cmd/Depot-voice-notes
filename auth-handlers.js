/**
 * Authentication request handlers for Cloudflare Worker
 */

import {
  createUser,
  getUserByEmail,
  getUserByUsername,
  verifyPassword,
  generateToken,
  verifyToken,
  extractToken,
  isValidEmail,
  isValidPassword,
  saveUserSetting,
  getUserSetting,
  getAllUserSettings,
  deleteUserSetting,
  initializeAuthTables
} from './auth.js';

/**
 * Handle user registration
 * POST /auth/register
 */
export async function handleRegister(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'JSON body required' }, 400);
  }

  const { username, email, password } = payload;

  // Validate input
  if (!username || !email || !password) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Username, email, and password are required'
    }, 400);
  }

  if (username.length < 3 || username.length > 50) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Username must be between 3 and 50 characters'
    }, 400);
  }

  if (!isValidEmail(email)) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Invalid email address'
    }, 400);
  }

  if (!isValidPassword(password)) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Password must be at least 8 characters and contain letters and numbers'
    }, 400);
  }

  // Check if database is available
  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  // Initialize tables if needed
  await initializeAuthTables(env.DB);

  // Check if user already exists
  const existingUser = await getUserByEmail(env.DB, email) || await getUserByUsername(env.DB, username);
  if (existingUser) {
    return jsonResponse({
      error: 'conflict',
      message: 'User with this email or username already exists'
    }, 409);
  }

  // Create user
  const result = await createUser(env.DB, username, email, password);

  if (!result.success) {
    return jsonResponse({
      error: 'registration_failed',
      message: result.error || 'Failed to create user'
    }, 500);
  }

  // Generate JWT token
  const secret = env.JWT_SECRET || 'default-secret-change-in-production';
  const token = await generateToken(result.userId, username, secret);

  return jsonResponse({
    success: true,
    token,
    user: {
      id: result.userId,
      username,
      email
    }
  }, 201);
}

/**
 * Handle user login
 * POST /auth/login
 */
export async function handleLogin(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'JSON body required' }, 400);
  }

  const { email, password } = payload;

  if (!email || !password) {
    return jsonResponse({
      error: 'validation_error',
      message: 'Email and password are required'
    }, 400);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  // Get user by email
  const user = await getUserByEmail(env.DB, email);

  if (!user) {
    return jsonResponse({
      error: 'authentication_failed',
      message: 'Invalid email or password'
    }, 401);
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user.password_hash);

  if (!isPasswordValid) {
    return jsonResponse({
      error: 'authentication_failed',
      message: 'Invalid email or password'
    }, 401);
  }

  // Generate JWT token
  const secret = env.JWT_SECRET || 'default-secret-change-in-production';
  const token = await generateToken(user.id, user.username, secret);

  return jsonResponse({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  });
}

/**
 * Verify authentication token and extract user info
 * Used as middleware for protected routes
 */
export async function requireAuth(request, env) {
  const token = extractToken(request);

  if (!token) {
    return {
      authenticated: false,
      error: 'No authentication token provided'
    };
  }

  const secret = env.JWT_SECRET || 'default-secret-change-in-production';
  const decoded = await verifyToken(token, secret);

  if (!decoded || !decoded.payload) {
    return {
      authenticated: false,
      error: 'Invalid or expired token'
    };
  }

  return {
    authenticated: true,
    userId: decoded.payload.userId,
    username: decoded.payload.username
  };
}

/**
 * Handle settings sync - save
 * POST /settings/sync
 */
export async function handleSaveSettings(request, env) {
  // Verify authentication
  const auth = await requireAuth(request, env);
  if (!auth.authenticated) {
    return jsonResponse({
      error: 'unauthorized',
      message: auth.error
    }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'JSON body required' }, 400);
  }

  const { settings } = payload;

  if (!settings || typeof settings !== 'object') {
    return jsonResponse({
      error: 'validation_error',
      message: 'Settings object is required'
    }, 400);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  // Save each setting
  const results = [];
  for (const [key, value] of Object.entries(settings)) {
    const result = await saveUserSetting(env.DB, auth.userId, key, value);
    results.push({ key, success: result.success });
  }

  return jsonResponse({
    success: true,
    saved: results.filter(r => r.success).length,
    total: results.length
  });
}

/**
 * Handle settings sync - load
 * GET /settings/sync
 */
export async function handleLoadSettings(request, env) {
  // Verify authentication
  const auth = await requireAuth(request, env);
  if (!auth.authenticated) {
    return jsonResponse({
      error: 'unauthorized',
      message: auth.error
    }, 401);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  const settings = await getAllUserSettings(env.DB, auth.userId);

  return jsonResponse({
    success: true,
    settings
  });
}

/**
 * Handle get user profile
 * GET /auth/profile
 */
export async function handleGetProfile(request, env) {
  // Verify authentication
  const auth = await requireAuth(request, env);
  if (!auth.authenticated) {
    return jsonResponse({
      error: 'unauthorized',
      message: auth.error
    }, 401);
  }

  if (!env.DB) {
    return jsonResponse({
      error: 'server_error',
      message: 'Database not configured'
    }, 500);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, email, created_at
    FROM users
    WHERE id = ?
  `).bind(auth.userId).first();

  if (!user) {
    return jsonResponse({
      error: 'not_found',
      message: 'User not found'
    }, 404);
  }

  return jsonResponse({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.created_at
    }
  });
}

/**
 * Helper function for JSON responses with CORS headers
 */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
