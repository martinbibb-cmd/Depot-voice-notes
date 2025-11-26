/**
 * Authentication and user management utilities
 * Handles user registration, login, and JWT token generation
 */

import bcrypt from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';

const JWT_SECRET_KEY = 'DEPOT_JWT_SECRET'; // This should be set in environment variables
const TOKEN_EXPIRY = '7d'; // 7 days

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 */
export async function generateToken(userId, username, secret) {
  const payload = {
    userId,
    username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  };

  return await jwt.sign(payload, secret);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token, secret) {
  try {
    const isValid = await jwt.verify(token, secret);
    if (!isValid) {
      return null;
    }
    return jwt.decode(token);
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
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
