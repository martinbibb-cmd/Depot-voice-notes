import { asset } from './base-path.js';
import { registerSW } from './sw-register.js';

const ui = {
  workerStatus: document.querySelector('[data-ui="worker-status"]'),
  workerError: document.querySelector('[data-ui="worker-error"]'),
  transcriptOut: document.querySelector('[data-ui="transcript-out"]'),
  sendBtn: document.querySelector('[data-ui="send-notes"]'),
  micBtn: document.querySelector('[data-ui="mic-start"]'),
};

function setWorkerStatus(text) {
  if (ui.workerStatus) ui.workerStatus.textContent = text;
  console.log('[worker]', text);
}

function showWorkerError(msg) {
  if (ui.workerError) {
    ui.workerError.hidden = false;
    ui.workerError.textContent = msg;
  }
  console.error('[worker:error]', msg);
}

async function ensureMicPermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn('getUserMedia not available in this browser.');
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately; we only needed permission.
    stream.getTracks().forEach((t) => t.stop());
    console.log('[mic] permission granted');
    return true;
  } catch (err) {
    console.warn('[mic] permission denied or failed:', err);
    return false;
  }
}

// Optional: Web Speech API fallback on main thread
function createSpeechFallback(onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('SpeechRecognition API not available; fallback disabled.');
    return null;
  }
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-GB';

  rec.onresult = (ev) => {
    let text = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      text += ev.results[i][0].transcript;
    }
    onText(text);
  };
  rec.onerror = (e) => console.warn('[speech:fallback:error]', e);
  rec.onend = () => console.log('[speech:fallback] ended');
  return rec;
}

let worker = null;
let speechFallback = null;

async function initWorker() {
  // Try to start the web worker with a safe, absolute URL.
  const workerUrl = asset('transcribe-worker.js'); // classic worker (not module) for widest support
  setWorkerStatus('Starting…');
  try {
    worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      const { type, payload } = e.data || {};
      if (type === 'ready') setWorkerStatus('Ready');
      if (type === 'log') console.log('[worker:log]', payload);
      if (type === 'error') showWorkerError(payload || 'Worker error');
      if (type === 'transcript' && ui.transcriptOut) {
        ui.transcriptOut.value = payload || '';
      }
    };
    worker.onerror = (e) => {
      showWorkerError(`Worker runtime error: ${e.message || e.filename || 'unknown'}`);
    };
    // Kick worker
    worker.postMessage({ type: 'init' });
    return true;
  } catch (err) {
    showWorkerError(`Worker failed to start (${workerUrl}): ${err?.message || err}`);
    return false;
  }
}

async function boot() {
  registerSW();

  // Show base state
  if (ui.workerError) ui.workerError.hidden = true;
  setWorkerStatus('Idle');

  // 1) Mic permission early (non-fatal)
  await ensureMicPermission();

  // 2) Start worker; if it fails, enable main-thread speech fallback
  const ok = await initWorker();
  if (!ok) {
    setWorkerStatus('Fallback mode');
    speechFallback = createSpeechFallback((text) => {
      if (ui.transcriptOut) ui.transcriptOut.value = text;
    });
  }

  // 3) Wire mic button
  if (ui.micBtn) {
    ui.micBtn.addEventListener('click', async () => {
      if (worker) {
        worker.postMessage({ type: 'start' });
        setWorkerStatus('Listening…');
      } else if (speechFallback) {
        try {
          speechFallback.start();
          setWorkerStatus('Listening (fallback)…');
        } catch (e) {
          showWorkerError('Could not start fallback speech: ' + e);
        }
      } else {
        showWorkerError('No speech engine available in this browser.');
      }
    });
  }

  // 4) Wire send button (example; keep your existing send logic)
  if (ui.sendBtn) {
    ui.sendBtn.addEventListener('click', () => {
      const text = (ui.transcriptOut?.value || '').trim();
      if (!text) return;
      console.log('[send-notes]', { text });
      // TODO: call your Cloudflare Worker endpoint here
      // fetch(CF_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text }) })
      //   .then(r => r.json()).then(j => console.log('sent', j)).catch(e => console.error('send failed', e));
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
