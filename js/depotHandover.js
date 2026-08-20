import { clearAuthToken, getAuthToken } from '../src/auth/auth-client.js';

const WORKER = 'https://depot-voice-notes.martinbibb.workers.dev';
const $ = id => document.getElementById(id);
let notes = [];
let surveyPhotos = [];

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
  ['captureStep','checkStep','draftStep','handoverStep'].forEach((id, index) => $(id).classList.toggle('hidden', index + 1 !== step));
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
      row.querySelector('small').textContent = `${visit.photo_count || 0} sanitised photos · ${visit.status === 'consumed' ? 'previously opened · ' : ''}${new Date(visit.created_at).toLocaleString()}`;
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
  surveyPhotos.forEach(photo => { if (photo.src?.startsWith('blob:')) URL.revokeObjectURL(photo.src); });
  surveyPhotos = [];
  for (const photo of photos) {
    const response = await fetch(`${WORKER}/spec-check/visits/${visitId}/photos/${photo.id}`, { headers: authHeaders(false) });
    if (!response.ok) continue;
    const figure = document.createElement('figure'); const image = document.createElement('img'); const caption = document.createElement('figcaption');
    image.src = URL.createObjectURL(await response.blob()); image.alt = photo.caption || photo.subject || 'Survey photo'; caption.textContent = photo.caption || photo.subject || '';
    surveyPhotos.push({ image, src: image.src, caption: photo.caption || photo.subject || '', subject: photo.subject || 'Site photograph' });
    figure.append(image, caption); $('photoGallery').append(figure);
  }
}

const expectedSections = ['Needs','System characteristics','New boiler and controls','Flue','Pipe work','Restrictions to work','Disruption','Customer actions','Future plans','Office notes'];
async function aiCheck() {
  const transcript = $('transcript').value.trim(); if (!transcript) return status('Add or open a transcript first.', true);
  show(2);
  $('checkTranscript').textContent = [$('transcript').value, $('capturedEvidence').textContent].filter(Boolean).join('\n\n');
  $('checkNotes').replaceChildren();
  $('useCheckedBtn').disabled = true;
  $('aiCheckStatus').className = 'status';
  $('aiCheckStatus').textContent = 'Checking the complete transcript and reconciling the latest supported survey state…';
  try {
    const captured = $('capturedEvidence').textContent.trim();
    const result = await api('/text', { method: 'POST', body: JSON.stringify({
      transcript: [transcript, captured].filter(Boolean).join('\n\n'), expectedSections,
      depotSections: expectedSections.map(name => ({ name })), forceStructured: true, checklistItems: [],
      depotNotesInstructions: 'Create terse installation handover notes explaining the work directly, for example: Replace existing regular boiler in the same location. One supported fact, route, instruction, constraint or customer agreement per bullet. The chronological transcript is immutable source evidence: preserve every number, unit, direction, component and brand exactly. CAPTURED FACTS are only a secondary index and may contain stale machine-generated candidates from an older app build: discard any that are not independently supported by the transcript or a direct measurement/note, and always prefer the latest supported transcript state where they conflict. Represent the latest explicitly supported state. Remove superseded guesses, rejected brands and search-state hypotheses. Keep genuinely unresolved matters explicit. Exclude sales conversation, pricing, analogies, explanations, catalogue/reference knowledge and manufacturer opinion. Never invent or silently correct a brand, component, measurement, customer agreement or technical conclusion. Do not use Coming out, Going in, Involved or Agreed headings.'
    }) });
    notes = (result.sections || []).filter(section => (section.plainText || section.naturalLanguage || '').trim()).map(section => ({ name: section.section, text: bullets(section.plainText || section.naturalLanguage) }));
    renderReadOnly($('checkNotes'), notes, false);
    $('aiCheckStatus').textContent = `${notes.length} supported sections extracted and reconciled against the transcript.`;
    $('useCheckedBtn').disabled = notes.length === 0;
  } catch (error) { $('aiCheckStatus').textContent = error.message; $('aiCheckStatus').className = 'status error'; }
}
function bullets(text) { return text.replace(/# Involved #;?/gi, '').split(/;|\n/).map(x => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map(x => `• ${x}`).join('\n'); }
function renderEditableNotes() {
  $('notes').replaceChildren(); notes.forEach((note, index) => {
    const card = document.createElement('div'); card.className = 'note';
    const head = document.createElement('div'); head.className = 'note-head'; const title = document.createElement('strong'); title.textContent = note.name;
    const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.onclick = () => { notes.splice(index, 1); renderEditableNotes(); };
    const area = document.createElement('textarea'); area.value = note.text; area.oninput = () => note.text = area.value;
    const promptRow = document.createElement('div'); promptRow.className = 'row'; promptRow.style.marginTop = '8px';
    const prompt = document.createElement('input'); prompt.placeholder = 'Ask AI: add detail, correct this, or clarify wording'; prompt.style.flex = '1';
    const improve = document.createElement('button'); improve.textContent = 'Improve';
    improve.onclick = async () => {
      if (!prompt.value.trim()) return;
      improve.disabled = true; improve.textContent = 'Checking…';
      try {
        const result = await api('/tweak-section', { method: 'POST', body: JSON.stringify({
          section: { section: note.name, plainText: depotCopyText(note.text), naturalLanguage: note.text },
          instructions: `${prompt.value.trim()}\n\nUse only facts supported by this source evidence. Preserve all numbers, units, directions, uncertainty and chosen/rejected status exactly. SOURCE EVIDENCE:\n${$('transcript').value}\n${$('capturedEvidence').textContent}`
        }) });
        note.text = bullets(result.plainText || result.naturalLanguage || note.text); area.value = note.text; prompt.value = '';
      } catch (error) { $('draftStatus').textContent = error.message; }
      finally { improve.disabled = false; improve.textContent = 'Improve'; }
    };
    promptRow.append(prompt, improve); head.append(title, remove); card.append(head, area, promptRow); $('notes').append(card);
  });
}
function beginDraft() {
  notes = notes.filter(note => note.text.trim());
  renderEditableNotes();
  $('draftStatus').className = 'status';
  $('draftStatus').textContent = `${notes.length} AI-checked sections ready to edit.`;
  show(3);
}
function renderReadOnly(container, source, copy = true) {
  container.replaceChildren(); const placedPhotos = new Set(); source.forEach(note => {
    const card = document.createElement('div'); card.className = 'note'; const head = document.createElement('div'); head.className = 'note-head';
    const title = document.createElement('strong'); title.textContent = note.name; head.append(title);
    const depotText = depotCopyText(note.text);
    if (copy) { const button = document.createElement('button'); button.textContent = 'Copy'; button.onclick = async () => { await navigator.clipboard.writeText(depotText); button.textContent = 'Copied'; setTimeout(() => button.textContent = 'Copy', 1200); }; head.append(button); }
    const body = document.createElement('div'); body.className = 'copybox'; body.textContent = copy ? depotText : note.text; card.append(head, body); container.append(card);
    if (container.id === 'engineerNotes') {
      surveyPhotos.forEach((photo, index) => {
        if (photoSection(photo.subject) === note.name) { container.append(photoFigure(photo)); placedPhotos.add(index); }
      });
    }
  });
  if (container.id === 'engineerNotes') {
    const remaining = surveyPhotos.filter((_, index) => !placedPhotos.has(index));
    if (remaining.length) {
      const heading = document.createElement('h3'); heading.textContent = 'Other site photographs'; container.append(heading);
      remaining.forEach(photo => container.append(photoFigure(photo)));
    }
  }
}
function photoSection(subject = '') {
  const tag = subject.toLowerCase();
  if (/boiler|user controls|system controls|electric meter|master fuse|consumer unit/.test(tag)) return 'New boiler and controls';
  if (/manifold|cylinder|radiator|tank/.test(tag)) return 'System characteristics';
  if (/gas meter/.test(tag)) return 'Pipe work';
  return null;
}
function photoFigure(photo) {
  const figure = document.createElement('figure');
  const image = document.createElement('img'); image.src = photo.src; image.alt = photo.caption;
  const caption = document.createElement('figcaption'); caption.textContent = `${photo.subject} — ${photo.caption}`;
  figure.append(image, caption); return figure;
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
async function anotherSurvey() {
  notes = [];
  $('transcript').value = '';
  $('capturedEvidence').textContent = '';
  $('capturedEvidence').classList.add('hidden');
  $('notes').replaceChildren();
  $('checkTranscript').textContent = '';
  $('checkNotes').replaceChildren();
  $('customerNotes').replaceChildren();
  $('engineerNotes').replaceChildren();
  $('photoGallery').querySelectorAll('img').forEach(image => {
    if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
  });
  $('photoGallery').replaceChildren();
  surveyPhotos = [];
  $('useCheckedBtn').disabled = true;
  $('aiCheckStatus').textContent = '';
  $('draftStatus').textContent = '';
  show(1);
  status('Looking for another SpecCheck survey…');
  await refresh();
}
async function printOnly(id, title) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) { alert('PDF support has not loaded. Check the connection and try again.'); return; }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18; doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(title, 16, y); y += 11;
  const source = id === 'customerDocument' ? notes.filter(note => !/Office notes/i.test(note.name)) : notes;
  const placedPhotos = new Set();
  for (const note of source) {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(note.name, 16, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lines = doc.splitTextToSize(note.text.replace(/^•\s*/gm, ''), 178);
    for (const line of lines) { if (y > 282) { doc.addPage(); y = 18; } doc.text(line, 16, y); y += 5; }
    y += 3;
    if (id === 'engineerDocument') {
      for (let index = 0; index < surveyPhotos.length; index += 1) {
        if (photoSection(surveyPhotos[index].subject) === note.name) {
          y = await addPhotoToPDF(doc, surveyPhotos[index], y); placedPhotos.add(index);
        }
      }
    }
  }
  if (id === 'engineerDocument') {
    const remaining = surveyPhotos.filter((_, index) => !placedPhotos.has(index));
    if (remaining.length) {
      if (y > 260) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Other site photographs', 16, y); y += 7;
      for (const photo of remaining) y = await addPhotoToPDF(doc, photo, y);
    }
  }
  doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}
async function addPhotoToPDF(doc, photo, y) {
  if (!photo.image.complete) await photo.image.decode().catch(() => {});
  if (!photo.image.naturalWidth || !photo.image.naturalHeight) return y;
  const maxWidth = 178, maxHeight = 105;
  const scale = Math.min(maxWidth / photo.image.naturalWidth, maxHeight / photo.image.naturalHeight);
  const width = photo.image.naturalWidth * scale, height = photo.image.naturalHeight * scale;
  if (y + height + 14 > 286) { doc.addPage(); y = 18; }
  const canvas = document.createElement('canvas'); canvas.width = photo.image.naturalWidth; canvas.height = photo.image.naturalHeight;
  canvas.getContext('2d').drawImage(photo.image, 0, 0);
  doc.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 16, y, width, height);
  y += height + 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const caption = doc.splitTextToSize(`${photo.subject} — ${photo.caption}`, 178);
  doc.text(caption, 16, y); return y + caption.length * 4.5 + 5;
}

$('pairBtn').onclick = () => pair().catch(error => status(error.message, true)); $('refreshBtn').onclick = refresh;
$('importTextBtn').onclick = () => $('textFile').click(); $('textFile').onchange = async event => { const file = event.target.files[0]; if (file) $('transcript').value = await file.text(); };
$('draftBtn').onclick = aiCheck; $('useCheckedBtn').onclick = beginDraft; $('handoverBtn').onclick = handover;
$('backCapture').onclick = () => show(1); $('backCheck').onclick = () => show(2); $('backDraft').onclick = () => show(3);
$('anotherSurvey').onclick = () => anotherSurvey().catch(error => status(error.message, true));
$('printCustomer').onclick = () => printOnly('customerDocument', 'Customer summary'); $('printEngineer').onclick = () => printOnly('engineerDocument', 'Engineer works');
$('logoutBtn').onclick = () => { clearAuthToken(); location.href = 'login.html'; };
refresh();
