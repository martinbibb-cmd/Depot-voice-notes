/* Classic Web Worker — keeps out of your UI and Cloudflare logic.
   It does not touch the mic (that’s main thread by spec). Replace internals later if needed. */

self.postMessage({ type:'ready' });

self.addEventListener('message', (e)=>{
  const { type, payload } = e.data || {};
  if(type === 'init'){
    self.postMessage({ type:'log', payload:'Worker initialised' });
  }
  if(type === 'start'){
    // Hook your audio streaming / STT pipeline via main thread -> worker messages, if desired.
    self.postMessage({
      type:'error',
      payload:'Worker is running. Provide audio frames or use main-thread SpeechRecognition fallback.'
    });
  }
  if(type === 'append-text'){
    // Optional: you can stream chunks here and have worker coalesce them.
    self._buf = (self._buf || '') + (payload || '');
    self.postMessage({ type:'transcript', payload:self._buf });
  }
});
