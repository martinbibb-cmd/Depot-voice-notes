/**
 * Compute a reliable base path for GitHub Pages and local file previews.
 * Example: https://.../Depot-voice-notes/index.html  ->  base '/Depot-voice-notes/'
 */
export function basePath() {
  // Directory of current page, always ending with a trailing slash
  const dir = location.pathname.replace(/[^/]*$/, '');
  return dir.startsWith('/') ? dir : '/' + dir;
}

/**
 * Resolve an app-relative asset path reliably under GitHub Pages.
 * asset('transcribe-worker.js') -> '/Depot-voice-notes/transcribe-worker.js'
 */
export function asset(relPath) {
  const rel = String(relPath || '').replace(/^\/+/, '');
  return new URL(rel, location.origin + basePath()).toString();
}
