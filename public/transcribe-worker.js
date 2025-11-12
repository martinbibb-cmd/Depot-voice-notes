/* Classic (non-module) worker for widest browser support. 
   Replace internals later with your STT pipeline if needed. */

self.postMessage({ type: 'ready' });

self.addEventListener('message', (e) => {
  const { type } = e.data || {};
  if (type === 'init') {
    self.postMessage({ type: 'log', payload: 'Worker initialised' });
  }
  if (type === 'start') {
    // In a real pipeline you’d connect to WebAudio/WASM/stream here.
    // We can’t access mic from worker; main thread handles audio.
    self.postMessage({
      type: 'error',
      payload: 'Worker started: waiting for main-thread audio; using fallback if provided.'
    });
  }
});
