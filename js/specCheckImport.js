import { getAuthToken } from '../src/auth/auth-client.js';
import { trustworthyTransferredFacts } from './transferEvidence.js';

function workerUrl() {
  return window.DepotWorkerConfig?.getWorkerUrl?.() || 'https://depot-voice-notes.martinbibb.workers.dev';
}

async function api(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${workerUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body;
}

function transcriptFrom(payload) {
  if (typeof payload.transcript === 'string' && payload.transcript.trim()) return payload.transcript.trim();
  return (payload.transcriptParts || [])
    .map(part => typeof part === 'string' ? part : part.text)
    .filter(Boolean)
    .join('\n');
}

function capturedDataText(payload) {
  const lines = [];
  const add = (heading, values) => {
    const clean = (values || []).filter(Boolean);
    if (!clean.length) return;
    lines.push('', `[${heading}]`, ...clean.map(value => `- ${value}`));
  };
  add('CAPTURED NOTES', (payload.notes || []).map(item => item.text || item.note || item));
  const facts = trustworthyTransferredFacts(payload);
  add('CAPTURED FACTS', facts.map(item => {
    if (typeof item === 'string') return item;
    return [item.subject, item.value || item.text].filter(Boolean).join(': ');
  }));
  add('MEASUREMENTS', (payload.measurements || []).map(item => {
    if (typeof item === 'string') return item;
    const value = [item.value, item.unit].filter(value => value !== undefined && value !== null).join(' ');
    return [item.what || item.subject, value, item.note].filter(Boolean).join(' — ');
  }));
  add('WATER PRESSURE AND FLOW', (payload.waterPressureTests || []).map(item => {
    const results = [
      item.standingPressureBar != null ? `standing ${item.standingPressureBar} bar` : null,
      item.dynamicPressureBar != null ? `dynamic ${item.dynamicPressureBar} bar` : null,
      item.flowLitresPerMinute != null ? `flow ${item.flowLitresPerMinute} litres/min` : null
    ].filter(Boolean).join(', ');
    return [item.testPoint, results, item.note].filter(Boolean).join(' — ');
  }));
  add('ROOMS AND GEOMETRY', (payload.rooms || []).map(room => {
    if (typeof room === 'string') return room;
    const dimensions = room.dimensions || [room.width, room.length, room.height].filter(Boolean).join(' × ');
    return [room.name, dimensions, room.wallCount != null ? `${room.wallCount} walls` : null].filter(Boolean).join(' — ');
  }));
  return lines.join('\n');
}

function setMessage(message, error = false) {
  const element = document.getElementById('specCheckStatus');
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? '#b91c1c' : 'var(--muted)';
}

async function importVisit(id) {
  setMessage('Importing capture…');
  const visit = await api(`/spec-check/visits/${encodeURIComponent(id)}`);
  const transcript = transcriptFrom(visit.payload);
  const evidence = capturedDataText(visit.payload);
  const input = document.getElementById('transcriptInput');
  if (!input) throw new Error('Transcript editor is unavailable');
  input.value = [transcript, evidence].filter(Boolean).join('\n\n').trim();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const evidenceElement = document.getElementById('specCheckEvidence');
  evidenceElement.textContent = evidence.trim() || 'No additional structured evidence was transferred.';
  evidenceElement.hidden = false;
  await showPhotos(id, visit.photos);
  await api(`/spec-check/visits/${encodeURIComponent(id)}/consume`, { method: 'POST', body: '{}' });
  setMessage(`Imported ${visit.nickname}: ${transcript.split(/\s+/).filter(Boolean).length} transcript words, ${visit.photos.length} sanitised photos.`);
  await refreshVisits();
}

async function showPhotos(visitId, photos) {
  const gallery = document.getElementById('specCheckPhotos');
  gallery.replaceChildren();
  const token = getAuthToken();
  for (const photo of photos) {
    const response = await fetch(`${workerUrl()}/spec-check/visits/${encodeURIComponent(visitId)}/photos/${encodeURIComponent(photo.id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) continue;
    const objectURL = URL.createObjectURL(await response.blob());
    const figure = document.createElement('figure');
    figure.style.margin = '0';
    const image = document.createElement('img');
    image.src = objectURL;
    image.alt = photo.caption || photo.subject || 'Sanitised survey photograph';
    image.style.cssText = 'width:100%;height:100px;object-fit:contain;background:#f4f4f4;border-radius:6px;';
    const caption = document.createElement('figcaption');
    caption.className = 'small';
    caption.textContent = photo.caption || photo.subject || 'Survey photograph';
    figure.append(image, caption);
    gallery.append(figure);
  }
}

async function refreshVisits() {
  const list = document.getElementById('specCheckVisits');
  if (!list) return;
  try {
    const result = await api('/spec-check/visits');
    list.replaceChildren();
    if (!result.visits.length) {
      const empty = document.createElement('div');
      empty.className = 'small';
      empty.textContent = 'No captures waiting.';
      list.append(empty);
      return;
    }
    result.visits.forEach(visit => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--border);';
      const label = document.createElement('span');
      label.textContent = `${visit.nickname} · ${visit.photo_count || 0} photos`;
      const button = document.createElement('button');
      button.textContent = 'Open capture';
      button.onclick = () => importVisit(visit.id).catch(error => setMessage(error.message, true));
      row.append(label, button);
      list.append(row);
    });
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function createPairingCode() {
  const result = await api('/spec-check/pairing', { method: 'POST', body: '{}' });
  document.getElementById('specCheckPairingCode').textContent = result.code;
  setMessage('Enter this one-time code in SpecCheck. It expires in 10 minutes.');
}

document.getElementById('specCheckPairButton')?.addEventListener('click', () => {
  createPairingCode().catch(error => setMessage(error.message, true));
});
document.getElementById('specCheckRefreshButton')?.addEventListener('click', refreshVisits);
refreshVisits();
