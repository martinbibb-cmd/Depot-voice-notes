/* app.js (minimal worker boot, no UI/style changes) */

let worker = null;
let speechFallback = null;

const $ = (sel) => document.querySelector(sel);

const el = {
  workerStatus: $('[data-ui="worker-status"]') || $('[data-worker-status]'),
  workerError:  $('[data-ui="worker-error"]')  || $('[data-worker-error]'),
  transcript:   $('[data-ui="transcript-out"]')|| $('#out'),
  micBtn:       $('[data-ui="mic-start"]'),
  sendBtn:      $('[data-ui="send-notes"]'),
  shareBtn:     $('[data-ui="share-notes"]'),
};

function setStatus(t){ if(el.workerStatus) el.workerStatus.textContent = t; console.log('[worker]', t); }
function showErr(t){ if(el.workerError){ el.workerError.hidden=false; el.workerError.textContent=t; } console.error('[worker:error]', t); }

async function ensureMicPermission(){
  if(!navigator.mediaDevices?.getUserMedia) return false;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    stream.getTracks().forEach(t=>t.stop());
    console.log('[mic] ok');
    return true;
  }catch(e){ console.warn('[mic] denied/failed', e); return false; }
}

function makeSpeechFallback(onText){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ console.warn('SpeechRecognition unavailable'); return null; }
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-GB';
  rec.onresult = (ev)=>{
    let text = '';
    for(let i=ev.resultIndex;i<ev.results.length;i++) text += ev.results[i][0].transcript;
    onText(text);
  };
  rec.onerror = (e)=>console.warn('[speech:fallback:error]', e);
  rec.onend   = ()=>console.log('[speech:fallback] end');
  return rec;
}

async function initWorker(){
  setStatus('Starting…');
  try{
    // ESM-safe path resolution that works on GitHub Pages
    const url = new URL('./transcribe-worker.js', import.meta.url);
    worker = new Worker(url, { type: 'classic' }); // classic = widest support (iOS Safari ok)

    worker.onmessage = (e)=>{
      const { type, payload } = e.data || {};
      if(type === 'ready') setStatus('Ready');
      if(type === 'log') console.log('[worker:log]', payload);
      if(type === 'error') showErr(payload || 'Worker error');
      if(type === 'transcript' && el.transcript){
        el.transcript.value = payload || '';
      }
    };
    worker.onerror = (e)=>showErr(`Worker runtime: ${e.message || e.filename || 'unknown'}`);

    // Kick worker
    worker.postMessage({ type:'init' });
    return true;
  }catch(err){
    showErr(`Worker failed to start: ${err && err.message ? err.message : err}`);
    return false;
  }
}

async function boot(){
  if(el.workerError) el.workerError.hidden = true;
  setStatus('Idle');

  await ensureMicPermission();

  const ok = await initWorker();
  if(!ok){
    setStatus('Fallback mode');
    speechFallback = makeSpeechFallback((text)=>{
      if(el.transcript) el.transcript.value = text;
    });
  }

  if(el.micBtn){
    el.micBtn.addEventListener('click', ()=>{
      if(worker){
        worker.postMessage({ type:'start' });
        setStatus('Listening…');
      }else if(speechFallback){
        try{ speechFallback.start(); setStatus('Listening (fallback)…'); }
        catch(e){ showErr('Could not start fallback speech: ' + e); }
      }else{
        showErr('No speech engine available in this browser.');
      }
    });
  }

  if(el.sendBtn){
    el.sendBtn.addEventListener('click', ()=>{
      const text = (el.transcript?.value || '').trim();
      if(!text) return;
      console.log('[send-notes]', { text });
      // 🔗 Keep your existing Cloudflare Worker URL:
      // fetch(CF_URL, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text }) })
      //   .then(r=>r.json()).then(j=>console.log('sent', j)).catch(e=>console.error('send failed', e));
    });
  }

  if(el.shareBtn){
    el.shareBtn.addEventListener('click', async ()=>{
      const text = (el.transcript?.value || '').trim();
      if(!text){
        showErr('No notes to share');
        return;
      }
      
      // Check if Web Share API is supported
      if(navigator.share){
        try{
          await navigator.share({
            title: 'Depot Voice Notes',
            text: text,
          });
          console.log('[share] success');
        }catch(err){
          // User cancelled or share failed
          if(err.name !== 'AbortError'){
            console.error('[share] error', err);
            showErr('Share failed: ' + err.message);
          }
        }
      }else{
        // Fallback: copy to clipboard
        try{
          await navigator.clipboard.writeText(text);
          console.log('[share] copied to clipboard');
          alert('Notes copied to clipboard!');
        }catch(err){
          console.error('[share:clipboard] error', err);
          showErr('Share not supported and clipboard copy failed');
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
