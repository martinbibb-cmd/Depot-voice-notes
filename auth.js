/**
 * Authentication and user management utilities
 * Handles user registration, login, and JWT token generation
 * Uses Web Crypto API (built-in to Cloudflare Workers)
 */

const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Hash a password using Web Crypto API (PBKDF2)
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import the password as a key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // Derive a key from the password
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  // Combine salt and hash
  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  // Convert to base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    // Decode the stored hash
    const combined = Uint8Array.from(atob(hash), c => c.charCodeAt(0));

    // Extract salt and hash
    const salt = combined.slice(0, 16);
    const storedHash = combined.slice(16);

    // Import the password as a key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    // Derive a key from the password
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const hashArray = new Uint8Array(derivedBits);

    // Compare hashes
    if (hashArray.length !== storedHash.length) {
      return false;
    }

    for (let i = 0; i < hashArray.length; i++) {
      if (hashArray[i] !== storedHash[i]) {
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Password verification failed:', err);
    return false;
  }
}

/**
 * Generate a JWT token for a user using Web Crypto API
 */
export async function generateToken(userId, username, secret) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload = {
    userId,
    username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS
  };

  const encoder = new TextEncoder();

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signatureInput)
  );

  const encodedSignature = base64UrlEncode(signature);

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verify and decode a JWT token using Web Crypto API
 */
export async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const encoder = new TextEncoder();

    // Import the secret key
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    const signature = base64UrlDecode(encodedSignature);

    // Verify signature
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(signatureInput)
    );

    if (!isValid) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { payload };
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(input) {
  let str;
  if (input instanceof ArrayBuffer) {
    str = String.fromCharCode(...new Uint8Array(input));
  } else {
    str = input;
  }

  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Extract token from Authorization header
 */
export function extractToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Validate email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password) {
  // Minimum 8 characters, at least one letter and one number
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

/**
 * Initialize database tables for authentication
 * Creates users and user_settings tables if they don't exist
 */
export async function initializeAuthTables(db) {
  try {
    // Users table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // User settings table - stores all user configuration
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, setting_key)
      )
    `).run();

    // Password reset tokens table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        used BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    // Create indexes for better query performance
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
      ON user_settings(user_id)
    `).run();

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_users_email
      ON users(email)
    `).run();

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_users_username
      ON users(username)
    `).run();

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_token
      ON password_reset_tokens(token)
    `).run();

    return { success: true };
  } catch (err) {
    console.error('Failed to initialize auth tables:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Create a new user
 */
export async function createUser(db, username, email, password) {
  try {
    const passwordHash = await hashPassword(password);

    const result = await db.prepare(`
      INSERT INTO users (username, email, password_hash)
      VALUES (?, ?, ?)
    `).bind(username, email, passwordHash).run();

    return {
      success: true,
      userId: result.meta.last_row_id
    };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return {
        success: false,
        error: 'Username or email already exists'
      };
    }
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(db, email) {
  try {
    const result = await db.prepare(`
      SELECT id, username, email, password_hash, created_at
      FROM users
      WHERE email = ?
    `).bind(email).first();

    return result;
  } catch (err) {
    console.error('Failed to get user by email:', err);
    return null;
  }
}

/**
 * Get user by username
 */
export async function getUserByUsername(db, username) {
  try {
    const result = await db.prepare(`
      SELECT id, username, email, password_hash, created_at
      FROM users
      WHERE username = ?
    `).bind(username).first();

    return result;
  } catch (err) {
    console.error('Failed to get user by username:', err);
    return null;
  }
}

/**
 * Save user setting
 */
export async function saveUserSetting(db, userId, key, value) {
  try {
    await db.prepare(`
      INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, setting_key)
      DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
    `).bind(userId, key, JSON.stringify(value)).run();

    return { success: true };
  } catch (err) {
    console.error('Failed to save user setting:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get user setting
 */
export async function getUserSetting(db, userId, key) {
  try {
    const result = await db.prepare(`
      SELECT setting_value
      FROM user_settings
      WHERE user_id = ? AND setting_key = ?
    `).bind(userId, key).first();

    if (!result) {
      return null;
    }

    return JSON.parse(result.setting_value);
  } catch (err) {
    console.error('Failed to get user setting:', err);
    return null;
  }
}

/**
 * Get all user settings
 */
export async function getAllUserSettings(db, userId) {
  try {
    const results = await db.prepare(`
      SELECT setting_key, setting_value
      FROM user_settings
      WHERE user_id = ?
    `).bind(userId).all();

    const settings = {};
    for (const row of results.results) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch (err) {
        console.error(`Failed to parse setting ${row.setting_key}:`, err);
      }
    }

    return settings;
  } catch (err) {
    console.error('Failed to get all user settings:', err);
    return {};
  }
}

/**
 * Delete user setting
 */
export async function deleteUserSetting(db, userId, key) {
  try {
    await db.prepare(`
      DELETE FROM user_settings
      WHERE user_id = ? AND setting_key = ?
    `).bind(userId, key).run();

    return { success: true };
  } catch (err) {
    console.error('Failed to delete user setting:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a secure random reset token
 */
export function generateResetToken() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Create a password reset token for a user
 * @param {Object} db - Database instance
 * @param {number} userId - User ID
 * @returns {Promise<{success: boolean, token?: string, error?: string}>}
 */
export async function createPasswordResetToken(db, userId) {
  try {
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).bind(userId, token, expiresAt.toISOString()).run();

    return { success: true, token };
  } catch (err) {
    console.error('Failed to create password reset token:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Validate a password reset token
 * @param {Object} db - Database instance
 * @param {string} token - Reset token
 * @returns {Promise<{valid: boolean, userId?: number, error?: string}>}
 */
export async function validateResetToken(db, token) {
  try {
    const result = await db.prepare(`
      SELECT id, user_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = ?
    `).bind(token).first();

    if (!result) {
      return { valid: false, error: 'Invalid token' };
    }

    if (result.used) {
      return { valid: false, error: 'Token has already been used' };
    }

    const now = new Date();
    const expiresAt = new Date(result.expires_at);

    if (now > expiresAt) {
      return { valid: false, error: 'Token has expired' };
    }

    return { valid: true, userId: result.user_id, tokenId: result.id };
  } catch (err) {
    console.error('Failed to validate reset token:', err);
    return { valid: false, error: err.message };
  }
}

/**
 * Mark a reset token as used
 * @param {Object} db - Database instance
 * @param {string} token - Reset token
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function markTokenAsUsed(db, token) {
  try {
    await db.prepare(`
      UPDATE password_reset_tokens
      SET used = 1
      WHERE token = ?
    `).bind(token).run();

    return { success: true };
  } catch (err) {
    console.error('Failed to mark token as used:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reset user password
 * @param {Object} db - Database instance
 * @param {number} userId - User ID
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function resetUserPassword(db, userId, newPassword) {
  try {
    const passwordHash = await hashPassword(newPassword);

    await db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(passwordHash, userId).run();

    return { success: true };
  } catch (err) {
    console.error('Failed to reset password:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Clean up expired reset tokens (should be run periodically)
 * @param {Object} db - Database instance
 * @returns {Promise<{success: boolean, deleted?: number, error?: string}>}
 */
export async function cleanupExpiredTokens(db) {
  try {
    const result = await db.prepare(`
      DELETE FROM password_reset_tokens
      WHERE expires_at < datetime('now') OR used = 1
    `).run();

    return { success: true, deleted: result.meta.changes };
  } catch (err) {
    console.error('Failed to cleanup expired tokens:', err);
    return { success: false, error: err.message };
  }
}
