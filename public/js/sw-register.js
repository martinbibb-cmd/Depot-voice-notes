import { asset } from './base-path.js';

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const swUrl = asset('sw.js');
  // Only register if sw.js actually exists under our scope
  fetch(swUrl, { method: 'HEAD' })
    .then((r) => {
      if (!r.ok) return;
      return navigator.serviceWorker.register(swUrl)
        .then(() => console.log('[sw] registered', swUrl))
        .catch((e) => console.warn('[sw] failed', e));
    })
    .catch(() => {});
}
