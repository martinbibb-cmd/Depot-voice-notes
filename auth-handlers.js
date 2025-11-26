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
  initializeAuthTables,
  createPasswordResetToken,
  validateResetToken,
  markTokenAsUsed,
  resetUserPassword
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

/**
 * Handle password reset request
 * POST /auth/request-reset
 * Body: { email }
 */
export async function handleRequestReset(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  const { email } = payload;

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ success: false, error: 'Valid email is required' }, 400);
  }

  try {
    // Find user by email
    const user = await getUserByEmail(env.DB, email);

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we return success
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return jsonResponse({ success: true, message: 'If the email exists, a reset link will be sent' }, 200);
    }

    // Generate reset token
    const tokenResult = await createPasswordResetToken(env.DB, user.id);

    if (!tokenResult.success) {
      return jsonResponse({ success: false, error: 'Failed to create reset token' }, 500);
    }

    // In a real application, you would send an email here
    // For now, we'll return the token in the response
    // TODO: Integrate with email service
    console.log(`Password reset token for ${email}: ${tokenResult.token}`);

    return jsonResponse({
      success: true,
      message: 'Password reset token created',
      token: tokenResult.token  // Remove this in production
    }, 200);
  } catch (err) {
    console.error('Password reset request error:', err);
    return jsonResponse({ success: false, error: 'Server error' }, 500);
  }
}

/**
 * Handle password reset completion
 * POST /auth/reset-password
 * Body: { token, newPassword }
 */
export async function handleResetPassword(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  const { token, newPassword } = payload;

  if (!token || !newPassword) {
    return jsonResponse({ success: false, error: 'Token and new password are required' }, 400);
  }

  if (!isValidPassword(newPassword)) {
    return jsonResponse({ 
      success: false, 
      error: 'Password must be at least 8 characters with letters and numbers' 
    }, 400);
  }

  try {
    // Validate the reset token
    const validation = await validateResetToken(env.DB, token);

    if (!validation.valid) {
      return jsonResponse({ success: false, error: validation.error || 'Invalid token' }, 400);
    }

    // Reset the password
    const resetResult = await resetUserPassword(env.DB, validation.userId, newPassword);

    if (!resetResult.success) {
      return jsonResponse({ success: false, error: 'Failed to reset password' }, 500);
    }

    // Mark token as used
    await markTokenAsUsed(env.DB, token);

    return jsonResponse({ success: true, message: 'Password has been reset successfully' }, 200);
  } catch (err) {
    console.error('Password reset error:', err);
    return jsonResponse({ success: false, error: 'Server error' }, 500);
  }
}
