import { clearAuthToken, getAuthToken } from '../src/auth/auth-client.js';

const WORKER = 'https://depot-voice-notes.martinbibb.workers.dev';
const $ = id => document.getElementById(id);
let notes = [];

if (!getAuthToken()) location.href = 'login.html';

function authHeaders(json = true) {
  return { Authorization: `Bearer ${getAuthToken()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) };
}
async function api(path, options = {}) {
  const response = await fetch(`${WORKER}${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body;
}
function status(message, error = false) { $('captureStatus').textContent = message; $('captureStatus').className = `status${error ? ' error' : ''}`; }
function show(step) {
  ['captureStep','draftStep','checkStep','handoverStep'].forEach((id, index) => $(id).classList.toggle('hidden', index + 1 !== step));
  document.querySelectorAll('.step').forEach(el => el.classList.toggle('active', Number(el.dataset.step) === step));
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function pair() {
  const result = await api('/spec-check/pairing', { method: 'POST', body: '{}' });
  $('pairCode').textContent = result.code; status('Enter this code in SpecCheck → Rules & Allowances. It expires in 10 minutes.');
}
async function refresh() {
  try {
    const result = await api('/spec-check/visits'); $('captures').replaceChildren();
    if (!result.visits.length) { status('No SpecCheck captures are waiting.'); return; }
    result.visits.forEach(visit => {
      const row = document.createElement('div'); row.className = 'capture';
      row.innerHTML = `<span><strong></strong><small></small></span>`;
      row.querySelector('strong').textContent = visit.nickname;
      row.querySelector('small').textContent = `${visit.photo_count || 0} sanitised photos · ${new Date(visit.created_at).toLocaleString()}`;
      const button = document.createElement('button'); button.textContent = 'Open'; button.onclick = () => openCapture(visit.id);
      row.append(button); $('captures').append(row);
    }); status('Choose the survey you want to process.');
  } catch (error) { status(error.message, true); }
}
function transcriptOf(payload) {
  if (payload.transcript?.trim()) return payload.transcript.trim();
  return (payload.transcriptParts || []).map(part => typeof part === 'string' ? part : part.text).filter(Boolean).join('\n\n');
}
function evidenceOf(payload) {
  const groups = [];
  const add = (name, values) => { if (values?.length) groups.push(`[${name}]\n${values.map(value => `- ${value}`).join('\n')}`); };
  add('CAPTURED NOTES', (payload.notes || []).map(x => x.text || x));
  add('CAPTURED FACTS', (payload.facts || []).map(x => `${x.subject}: ${x.text}`));
  add('WATER PRESSURE AND FLOW', (payload.waterPressureTests || []).map(x => [x.testPoint, x.standingPressureBar != null ? `standing ${x.standingPressureBar} bar` : '', x.dynamicPressureBar != null ? `dynamic ${x.dynamicPressureBar} bar` : '', x.flowLitresPerMinute != null ? `${x.flowLitresPerMinute} litres/min` : '', x.note].filter(Boolean).join(' — ')));
  add('ROOMS', (payload.rooms || []).map(x => `${x.name} (${x.floor || 'floor not named'}): ${x.wallCount || 0} walls, ${(x.routes || []).length} routes, ${(x.radiators || []).length} radiators`));
  return groups.join('\n\n');
}
async function openCapture(id) {
  try {
    status('Opening complete capture…'); const visit = await api(`/spec-check/visits/${id}`);
    $('transcript').value = transcriptOf(visit.payload);
    const evidence = evidenceOf(visit.payload); $('capturedEvidence').textContent = evidence; $('capturedEvidence').classList.toggle('hidden', !evidence);
    await loadPhotos(id, visit.photos); await api(`/spec-check/visits/${id}/consume`, { method: 'POST', body: '{}' });
    status(`Opened ${visit.nickname}: ${$('transcript').value.split(/\s+/).filter(Boolean).length} transcript words and ${visit.photos.length} photos.`);
  } catch (error) { status(error.message, true); }
}
async function loadPhotos(visitId, photos) {
  $('photoGallery').replaceChildren();
  for (const photo of photos) {
    const response = await fetch(`${WORKER}/spec-check/visits/${visitId}/photos/${photo.id}`, { headers: authHeaders(false) });
    if (!response.ok) continue;
    const figure = document.createElement('figure'); const image = document.createElement('img'); const caption = document.createElement('figcaption');
    image.src = URL.createObjectURL(await response.blob()); image.alt = photo.caption || photo.subject || 'Survey photo'; caption.textContent = photo.caption || photo.subject || '';
    figure.append(image, caption); $('photoGallery').append(figure);
  }
}

const expectedSections = ['Needs','System characteristics','New boiler and controls','Flue','Pipe work','Restrictions to work','Disruption','Customer actions','Future plans','Office notes'];
async function draft() {
  const transcript = $('transcript').value.trim(); if (!transcript) return status('Add or open a transcript first.', true);
  show(2); $('draftStatus').textContent = 'Extracting supported installation facts…';
  try {
    const captured = $('capturedEvidence').textContent.trim();
    const result = await api('/text', { method: 'POST', body: JSON.stringify({
      transcript: [transcript, captured].filter(Boolean).join('\n\n'), expectedSections,
      depotSections: expectedSections.map(name => ({ name })), forceStructured: true, checklistItems: [],
      depotNotesInstructions: 'Create terse installation handover notes. One supported fact, route, instruction, constraint or customer agreement per bullet. Represent the latest supported state in the chronological transcript. Remove superseded guesses. Keep genuinely unresolved matters explicit. Exclude sales conversation, pricing, explanations and manufacturer opinion. Never invent a brand, component, measurement, customer agreement or technical conclusion.'
    }) });
    notes = (result.sections || []).filter(section => (section.plainText || section.naturalLanguage || '').trim()).map(section => ({ name: section.section, text: bullets(section.plainText || section.naturalLanguage) }));
    renderEditableNotes(); $('draftStatus').textContent = `${notes.length} concise sections created from the captured evidence.`;
  } catch (error) { $('draftStatus').textContent = error.message; $('draftStatus').className = 'status error'; }
}
function bullets(text) { return text.replace(/# Involved #;?/gi, '').split(/;|\n/).map(x => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map(x => `• ${x}`).join('\n'); }
function renderEditableNotes() {
  $('notes').replaceChildren(); notes.forEach((note, index) => {
    const card = document.createElement('div'); card.className = 'note';
    const head = document.createElement('div'); head.className = 'note-head'; const title = document.createElement('strong'); title.textContent = note.name;
    const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = () => { notes.splice(index, 1); renderEditableNotes(); };
    const area = document.createElement('textarea'); area.value = note.text; area.oninput = () => note.text = area.value;
    head.append(title, remove); card.append(head, area); $('notes').append(card);
  });
}
function prepareCheck() {
  notes = notes.filter(note => note.text.trim()); $('checkTranscript').textContent = [$('transcript').value, $('capturedEvidence').textContent].filter(Boolean).join('\n\n');
  renderReadOnly($('checkNotes'), notes, false); $('verified').checked = false; $('handoverBtn').disabled = true; show(3);
}
function renderReadOnly(container, source, copy = true) {
  container.replaceChildren(); source.forEach(note => {
    const card = document.createElement('div'); card.className = 'note'; const head = document.createElement('div'); head.className = 'note-head';
    const title = document.createElement('strong'); title.textContent = note.name; head.append(title);
    const depotText = depotCopyText(note.text);
    if (copy) { const button = document.createElement('button'); button.textContent = 'Copy'; button.onclick = async () => { await navigator.clipboard.writeText(depotText); button.textContent = 'Copied'; setTimeout(() => button.textContent = 'Copy', 1200); }; head.append(button); }
    const body = document.createElement('div'); body.className = 'copybox'; body.textContent = copy ? depotText : note.text; card.append(head, body); container.append(card);
  });
}
function depotCopyText(text) {
  return text.split(/\n|;/).map(line => line.replace(/^\s*[•-]\s*/, '').trim()).filter(Boolean).map(line => `${line};`).join('\n');
}
function handover() {
  const customerExcluded = /Office notes/i;
  const customerSource = notes.filter(note => !customerExcluded.test(note.name));
  renderReadOnly($('customerNotes'), customerSource.length ? customerSource : notes);
  renderReadOnly($('engineerNotes'), notes); show(4);
}
function printOnly(id, title) {
  const printArea = $('printArea');
  printArea.innerHTML = `<h1>${title}</h1>${$(id).innerHTML}`;
  const cleanup = () => { printArea.replaceChildren(); removeEventListener('afterprint', cleanup); };
  addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 3000);
}

$('pairBtn').onclick = () => pair().catch(error => status(error.message, true)); $('refreshBtn').onclick = refresh;
$('importTextBtn').onclick = () => $('textFile').click(); $('textFile').onchange = async event => { const file = event.target.files[0]; if (file) $('transcript').value = await file.text(); };
$('draftBtn').onclick = draft; $('checkBtn').onclick = prepareCheck; $('verified').onchange = event => $('handoverBtn').disabled = !event.target.checked; $('handoverBtn').onclick = handover;
$('backCapture').onclick = () => show(1); $('backDraft').onclick = () => show(2); $('backCheck').onclick = () => show(3);
$('printCustomer').onclick = () => printOnly('customerDocument', 'Customer summary'); $('printEngineer').onclick = () => printOnly('engineerDocument', 'Engineer works');
$('logoutBtn').onclick = () => { clearAuthToken(); location.href = 'login.html'; };
refresh();
