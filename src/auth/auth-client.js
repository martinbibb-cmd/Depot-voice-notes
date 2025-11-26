/**
 * Client-side authentication module
 * Handles user authentication, token management, and settings sync
 */

const AUTH_TOKEN_KEY = 'depot.authToken';
const USER_INFO_KEY = 'depot.userInfo';

/**
 * Get the worker URL from configuration
 */
function getWorkerUrl() {
  return window.DepotWorkerConfig?.getWorkerUrl?.() || 'https://depot-voice-notes.martinbibb.workers.dev';
}

/**
 * Get stored authentication token
 */
export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (err) {
    console.error('Failed to get auth token:', err);
    return null;
  }
}

/**
 * Store authentication token
 */
export function setAuthToken(token) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    return true;
  } catch (err) {
    console.error('Failed to set auth token:', err);
    return false;
  }
}

/**
 * Clear authentication token
 */
export function clearAuthToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_INFO_KEY);
    return true;
  } catch (err) {
    console.error('Failed to clear auth token:', err);
    return false;
  }
}

/**
 * Get stored user info
 */
export function getUserInfo() {
  try {
    const info = localStorage.getItem(USER_INFO_KEY);
    return info ? JSON.parse(info) : null;
  } catch (err) {
    console.error('Failed to get user info:', err);
    return null;
  }
}

/**
 * Store user info
 */
export function setUserInfo(userInfo) {
  try {
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
    return true;
  } catch (err) {
    console.error('Failed to set user info:', err);
    return false;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return !!getAuthToken();
}

/**
 * Register a new user
 */
export async function register(username, email, password) {
  try {
    const response = await fetch(`${getWorkerUrl()}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Registration failed'
      };
    }

    // Store token and user info
    setAuthToken(data.token);
    setUserInfo(data.user);

    return {
      success: true,
      user: data.user
    };
  } catch (err) {
    console.error('Registration error:', err);
    return {
      success: false,
      error: 'Network error: Could not connect to server'
    };
  }
}

/**
 * Login user
 */
export async function login(email, password) {
  try {
    const response = await fetch(`${getWorkerUrl()}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Login failed'
      };
    }

    // Store token and user info
    setAuthToken(data.token);
    setUserInfo(data.user);

    return {
      success: true,
      user: data.user
    };
  } catch (err) {
    console.error('Login error:', err);
    return {
      success: false,
      error: 'Network error: Could not connect to server'
    };
  }
}

/**
 * Logout user
 */
export function logout() {
  clearAuthToken();
  window.location.href = 'login.html';
}

/**
 * Get user profile
 */
export async function getProfile() {
  const token = getAuthToken();
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated'
    };
  }

  try {
    const response = await fetch(`${getWorkerUrl()}/auth/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
      }
      return {
        success: false,
        error: data.message || data.error || 'Failed to get profile'
      };
    }

    return {
      success: true,
      user: data.user
    };
  } catch (err) {
    console.error('Get profile error:', err);
    return {
      success: false,
      error: 'Network error: Could not connect to server'
    };
  }
}

/**
 * Save settings to cloud (authenticated users only)
 */
export async function saveSettingsToCloud(settings) {
  const token = getAuthToken();
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated'
    };
  }

  try {
    const response = await fetch(`${getWorkerUrl()}/settings/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
      }
      return {
        success: false,
        error: data.message || data.error || 'Failed to save settings'
      };
    }

    return {
      success: true,
      saved: data.saved,
      total: data.total
    };
  } catch (err) {
    console.error('Save settings error:', err);
    return {
      success: false,
      error: 'Network error: Could not connect to server'
    };
  }
}

/**
 * Load settings from cloud (authenticated users only)
 */
export async function loadSettingsFromCloud() {
  const token = getAuthToken();
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated'
    };
  }

  try {
    const response = await fetch(`${getWorkerUrl()}/settings/sync`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
      }
      return {
        success: false,
        error: data.message || data.error || 'Failed to load settings'
      };
    }

    return {
      success: true,
      settings: data.settings
    };
  } catch (err) {
    console.error('Load settings error:', err);
    return {
      success: false,
      error: 'Network error: Could not connect to server'
    };
  }
}

/**
 * Sync all local settings to cloud
 */
export async function syncAllSettingsToCloud() {
  const settingsKeys = [
    'depot.sectionSchema',
    'depot.checklistConfig',
    'depot.aiInstructions',
    'depot.sectionRules',
    'depot.workerUrl',
    'exportFormat'
  ];

  const settings = {};
  for (const key of settingsKeys) {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        settings[key] = JSON.parse(value);
      }
    } catch (err) {
      console.warn(`Failed to read setting ${key}:`, err);
    }
  }

  return await saveSettingsToCloud(settings);
}

/**
 * Sync all cloud settings to local
 */
export async function syncAllSettingsFromCloud() {
  const result = await loadSettingsFromCloud();

  if (!result.success) {
    return result;
  }

  let appliedCount = 0;
  for (const [key, value] of Object.entries(result.settings)) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      appliedCount++;
    } catch (err) {
      console.warn(`Failed to apply setting ${key}:`, err);
    }
  }

  return {
    success: true,
    appliedCount,
    totalCount: Object.keys(result.settings).length
  };
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email) {
  try {
    const workerUrl = getWorkerUrl();
    const response = await fetch(workerUrl + '/auth/request-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed' };
    }

    return { success: true, token: data.token, message: data.message };
  } catch (err) {
    console.error('Failed to request password reset:', err);
    return { success: false, error: 'Failed to connect to server' };
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(token, newPassword) {
  try {
    const workerUrl = getWorkerUrl();
    const response = await fetch(workerUrl + '/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Reset failed' };
    }

    return { success: true, message: data.message };
  } catch (err) {
    console.error('Failed to reset password:', err);
    return { success: false, error: 'Failed to connect to server' };
  }
}

// Export global API for backwards compatibility
if (typeof window !== 'undefined') {
  window.DepotAuth = {
    isAuthenticated,
    register,
    login,
    logout,
    getProfile,
    getUserInfo,
    saveSettingsToCloud,
    loadSettingsFromCloud,
    syncAllSettingsToCloud,
    syncAllSettingsFromCloud,
    requestPasswordReset,
    resetPassword
  };
}
