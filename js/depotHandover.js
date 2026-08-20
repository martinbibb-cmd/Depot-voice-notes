import { clearAuthToken, getAuthToken } from '../src/auth/auth-client.js';
import { confirmedChecklistItems, initialiseChecklist, restoreChecklists, serialiseChecklists } from './confirmationState.js';

const WORKER = 'https://depot-voice-notes.martinbibb.workers.dev';
const $ = id => document.getElementById(id);
let notes = [];
let surveyPhotos = [];
let interpretation = null;
let selectedOption = null;
const optionDrafts = new Map();
const optionChecklists = new Map();
let currentVisitId = null;
let handoverDocuments = { customer: [], engineer: [] };

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
  ['captureStep','checkStep','confirmStep','draftStep','handoverStep'].forEach((id, index) => $(id).classList.toggle('hidden', index + 1 !== step));
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
    currentVisitId = id;
    const saved = await api(`/spec-check/visits/${id}/processing-state`);
    interpretation = saved.interpretation;
    optionChecklists.clear();
    restoreChecklists(saved.checklists).forEach((value, key) => optionChecklists.set(key, value));
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
    const blob = await response.blob();
    const figure = document.createElement('figure'); const image = document.createElement('img'); const caption = document.createElement('figcaption');
    image.src = URL.createObjectURL(blob); image.alt = photo.caption || photo.subject || 'Survey photo'; caption.textContent = photo.caption || photo.subject || '';
    const saved = { image, blob, src: image.src, caption: photo.caption || photo.subject || '', subject: photo.subject || 'Site photograph' };
    surveyPhotos.push(saved);
    const save = document.createElement('a'); save.href = image.src; save.download = photoFilename(saved, surveyPhotos.length); save.textContent = 'Save photo'; save.className = 'no-print';
    figure.append(image, caption, save); $('photoGallery').append(figure);
  }
  $('savePhotosBtn').disabled = surveyPhotos.length === 0;
}

const expectedSections = ['Needs','System characteristics','New boiler and controls','Flue','Pipe work','Restrictions to work','Disruption','Customer actions','Future plans','Office notes'];
const sectionPosition = new Map(expectedSections.map((name, index) => [name.toLowerCase(), index]));
function orderedNotes(source) {
  return [...source].sort((left, right) => {
    const leftIndex = sectionPosition.get(String(left.name || '').toLowerCase()) ?? expectedSections.length;
    const rightIndex = sectionPosition.get(String(right.name || '').toLowerCase()) ?? expectedSections.length;
    return leftIndex - rightIndex;
  });
}
async function aiCheck() {
  const transcript = $('transcript').value.trim(); if (!transcript) return status('Add or open a transcript first.', true);
  show(2);
  $('checkTranscript').textContent = [$('transcript').value, $('capturedEvidence').textContent].filter(Boolean).join('\n\n');
  $('checkNotes').replaceChildren();
  $('optionActions').replaceChildren();
  $('aiCheckStatus').className = 'status';
  $('aiCheckStatus').textContent = 'Checking the complete transcript and reconciling the latest supported survey state…';
  try {
    const captured = $('capturedEvidence').textContent.trim();
    if (!interpretation) {
      interpretation = await api('/interpret', { method: 'POST', body: JSON.stringify({ transcript, capturedEvidence: captured }) });
      await persistProcessingState();
    }
    renderInterpretation();
    $('aiCheckStatus').textContent = `${interpretation.options.length} independent proposal option${interpretation.options.length === 1 ? '' : 's'} identified.`;
  } catch (error) { $('aiCheckStatus').textContent = error.message; $('aiCheckStatus').className = 'status error'; }
}
function renderInterpretation() {
  const container = $('checkNotes'); container.replaceChildren();
  const group = (title, items, value = item => item.text) => {
    if (!items?.length) return;
    const card = document.createElement('div'); card.className = 'note';
    const heading = document.createElement('strong'); heading.textContent = title;
    const body = document.createElement('div'); body.className = 'copybox'; body.textContent = items.map(item => `• ${value(item)}`).join('\n');
    card.append(heading, body); container.append(card);
  };
  group('Shared facts', interpretation.sharedFacts);
  interpretation.options.forEach((option, index) => group(`Option ${index + 1}: ${option.title} (${option.status})`, option.facts));
  group('Historical only', interpretation.historicalFacts);
  group('Rejected or compromised', interpretation.rejectedAlternatives, item => [item.text, item.reason].filter(Boolean).join(' — '));
  group('Uncertain evidence', interpretation.uncertainties, item => [item.text, item.context].filter(Boolean).join(' — '));
  const actions = $('optionActions'); actions.replaceChildren();
  interpretation.options.forEach((option, index) => {
    const button = document.createElement('button'); button.className = index === 0 ? 'primary' : '';
    button.textContent = `Review Option ${index + 1} additional works`;
    button.onclick = () => prepareConfirmation(option, index);
    actions.append(button);
  });
}
async function persistProcessingState() {
  if (!currentVisitId || !interpretation) return;
  await api(`/spec-check/visits/${currentVisitId}/processing-state`, { method: 'PUT', body: JSON.stringify({
    interpretation, checklists: serialiseChecklists(optionChecklists)
  }) });
}
async function prepareConfirmation(option, index) {
  selectedOption = { ...option, number: index + 1 };
  show(3); $('confirmationStatus').textContent = `Preparing Option ${index + 1}…`;
  try {
    if (!optionChecklists.has(option.id)) {
      const result = await api('/confirmation-checklist', { method: 'POST', body: JSON.stringify({ interpretation, proposal: option }) });
      optionChecklists.set(option.id, initialiseChecklist(optionChecklists.get(option.id), {
        proposalOptionId: option.id, generatedAt: new Date().toISOString(), items: result.items || []
      }));
      await persistProcessingState();
    }
    renderConfirmation();
  } catch (error) { $('confirmationStatus').textContent = error.message; $('confirmationStatus').className = 'status error'; }
}
function renderConfirmation() {
  const state = optionChecklists.get(selectedOption.id) || { items: [] };
  $('confirmationItems').replaceChildren();
  state.items.filter(item => !item.removed).forEach(item => {
    const row = document.createElement('div'); row.className = 'confirmation';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(item.checked);
    checkbox.onchange = () => { item.checked = checkbox.checked; checklistChanged(); };
    const content = document.createElement('div'); const text = document.createElement('textarea'); text.value = item.text;
    text.onchange = () => { item.text = text.value.trim(); checklistChanged(); };
    const reason = document.createElement('small'); reason.textContent = [item.reason, item.evidenceRelation].filter(Boolean).join(' · ');
    content.append(text, reason);
    const remove = document.createElement('button'); remove.textContent = 'Remove suggestion'; remove.onclick = () => {
      item.removed = true; item.checked = false; optionChecklists.set(selectedOption.id, state);
      renderConfirmation(); checklistChanged();
    };
    row.append(checkbox, content, remove); $('confirmationItems').append(row);
  });
  const visible = state.items.filter(item => !item.removed);
  const checked = visible.filter(item => item.checked).length;
  $('confirmationStatus').className = 'status';
  $('confirmationStatus').textContent = `Option ${selectedOption.number}: ${visible.length} focused suggestions · ${checked} confirmed.`;
}
function checklistChanged() {
  if (selectedOption) optionDrafts.delete(selectedOption.id);
  persistProcessingState().catch(error => $('confirmationStatus').textContent = error.message);
}
async function addManualConfirmation() {
  const text = $('manualConfirmationText').value.trim(); if (!text || !selectedOption) return;
  const state = optionChecklists.get(selectedOption.id) || { proposalOptionId: selectedOption.id, items: [] };
  state.items.push({ id: `manual-${crypto.randomUUID()}`, originalText: text, text, reason: 'Added by surveyor', evidenceRelation: '',
    targetSection: $('manualConfirmationSection').value, checked: true, manual: true });
  optionChecklists.set(selectedOption.id, state); $('manualConfirmationText').value = ''; optionDrafts.delete(selectedOption.id); renderConfirmation(); await persistProcessingState();
}
async function generateOption() {
  const option = selectedOption;
  const index = option.number - 1;
  if (optionDrafts.has(option.id)) {
    notes = structuredClone(optionDrafts.get(option.id)); beginDraft(); return;
  }
  $('confirmationStatus').textContent = `Writing Option ${index + 1} from confirmed information…`;
  try {
    const confirmedItems = confirmedChecklistItems(optionChecklists.get(option.id));
    const relevantWantsNeeds = interpretation.sharedFacts.filter(item => /want|need|preference|priority|customer/i.test(item.category || ''));
    const confirmedAccessDisruptionEvidence = interpretation.sharedFacts.filter(item => /access|disruption|boxing|floor|furniture|decoration/i.test(`${item.category || ''} ${item.text || ''}`));
    const evidence = { sharedFacts: interpretation.sharedFacts, selectedProposal: option, relevantWantsNeeds,
      confirmedAccessDisruptionEvidence, confirmedChecklistItems: confirmedItems,
      historicalFacts: interpretation.historicalFacts, uncertainties: interpretation.uncertainties };
    const result = await api('/text', { method: 'POST', body: JSON.stringify({
      transcript: JSON.stringify(evidence), expectedSections,
      depotSections: expectedSections.map(name => ({ name })), forceStructured: true, checklistItems: [],
      depotNotesInstructions: 'Write terse installation handover notes for selectedProposal only. SharedFacts and relevantWantsNeeds may be used where relevant. Do not infer enabling, access, disruption, making-good or customer-preparation consequences from technical work during final writing. A pipe route alone is not evidence that lifting, drilling, visible pipework, boxing or decoration disturbance is confirmed. Such consequences may enter only when explicitly stated in confirmedAccessDisruptionEvidence or confirmedChecklistItems. Never include an unchecked, removed or absent suggestion. Place confirmedChecklistItems in their targetSection. HistoricalFacts are context only and must not become proposed work. Preserve uncertainties explicitly. Do not introduce another proposal, rejected alternative, recommendation, measurement, brand or component. Explain the work directly; do not use Coming out, Going in, Involved or Agreed headings.'
    }) });
    notes = orderedNotes((result.sections || []).filter(section => (section.plainText || section.naturalLanguage || '').trim())
      .map(section => ({ name: section.section, text: bullets(section.plainText || section.naturalLanguage) })));
    optionDrafts.set(option.id, structuredClone(notes)); beginDraft();
  } catch (error) { $('aiCheckStatus').textContent = error.message; $('aiCheckStatus').className = 'status error'; }
}
function bullets(text) { return text.replace(/# Involved #;?/gi, '').split(/;|\n/).map(x => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map(x => `• ${x}`).join('\n'); }
function renderEditableNotes() {
  $('notes').replaceChildren(); notes.forEach((note, index) => {
    const card = document.createElement('div'); card.className = 'note';
    const head = document.createElement('div'); head.className = 'note-head'; const title = document.createElement('strong'); title.textContent = note.name;
    const area = document.createElement('textarea'); area.value = note.text; area.oninput = () => {
      note.text = area.value;
      if (selectedOption) optionDrafts.set(selectedOption.id, structuredClone(notes));
    };
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
        if (selectedOption) optionDrafts.set(selectedOption.id, structuredClone(notes));
      } catch (error) { $('draftStatus').textContent = error.message; }
      finally { improve.disabled = false; improve.textContent = 'Improve'; }
    };
    promptRow.append(prompt, improve); head.append(title); card.append(head, area, promptRow); $('notes').append(card);
  });
}
function beginDraft() {
  notes = orderedNotes(notes.filter(note => note.text.trim()));
  renderEditableNotes();
  $('draftStatus').className = 'status';
  $('draftStatus').textContent = `Option ${selectedOption?.number || ''}: ${selectedOption?.title || ''} — ${notes.length} sections ready to edit.`;
  show(4);
}
function renderReadOnly(container, source, copy = true) {
  container.replaceChildren(); const placedPhotos = new Set(); orderedNotes(source).forEach(note => {
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
  if (/user controls|system controls|electric meter|master fuse|consumer unit/.test(tag)) return 'Controls and electrical';
  if (/gas meter/.test(tag)) return 'Pipework and routes';
  if (/boiler|manifold|cylinder|radiator|tank/.test(tag)) return 'Proposed installation';
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
async function handover() {
  show(5); $('handoverStatus').className = 'status'; $('handoverStatus').textContent = 'Writing the customer and engineer documents from confirmed information…';
  try {
    const confirmedItems = confirmedChecklistItems(optionChecklists.get(selectedOption.id));
    const relevantWantsNeeds = interpretation.sharedFacts.filter(item => /want|need|preference|priority|customer/i.test(item.category || ''));
    const technicalUncertainties = interpretation.uncertainties.filter(item => {
      const text = String(item.text || '').replace(/\[INAUDIBLE\]/gi, '').trim();
      return text.length >= 10 && !/^unclear statement/i.test(String(item.context || ''));
    });
    handoverDocuments = await api('/handover-documents', { method: 'POST', body: JSON.stringify({
      sharedFacts: interpretation.sharedFacts,
      selectedProposal: selectedOption,
      relevantWantsNeeds,
      confirmedChecklistItems: confirmedItems,
      uncertainties: technicalUncertainties,
      surveyorEditedNotes: notes
    }) });
    const customerSource = handoverDocuments.customer.map(section => ({ name: section.heading, text: section.text }));
    const engineerSource = handoverDocuments.engineer.map(section => ({ name: section.heading, text: section.bullets.map(value => `• ${value}`).join('\n') }));
    renderReadOnly($('customerNotes'), customerSource, false);
    renderReadOnly($('engineerNotes'), engineerSource);
    $('handoverStatus').textContent = 'Customer explanation and engineer handover are ready.';
  } catch (error) { $('handoverStatus').className = 'status error'; $('handoverStatus').textContent = `Documents were not created: ${error.message}`; }
}
async function anotherSurvey() {
  notes = [];
  interpretation = null; selectedOption = null; currentVisitId = null; handoverDocuments = { customer: [], engineer: [] }; optionDrafts.clear(); optionChecklists.clear();
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
  $('optionActions').replaceChildren();
  $('confirmationItems').replaceChildren();
  $('aiCheckStatus').textContent = '';
  $('draftStatus').textContent = '';
  show(1);
  status('Looking for another SpecCheck survey…');
  await refresh();
}
function photoFilename(photo, index) {
  const safe = `${photo.subject}-${photo.caption}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${String(index).padStart(2, '0')}-${safe || 'site-photo'}.jpg`;
}
async function saveAllPhotos() {
  const files = surveyPhotos.map((photo, index) => new File([photo.blob], photoFilename(photo, index + 1), { type: photo.blob.type || 'image/jpeg' }));
  if (navigator.canShare?.({ files })) { await navigator.share({ files, title: 'SpecCheck survey photographs' }); return; }
  for (const photo of surveyPhotos) {
    const link = document.createElement('a'); link.href = photo.src; link.download = photoFilename(photo, surveyPhotos.indexOf(photo) + 1); link.click();
  }
}
function downloadOptionNotes() {
  const text = orderedNotes(notes).map(note => `${note.name.toUpperCase()}\n${depotCopyText(note.text)}`).join('\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
  link.download = `option-${selectedOption?.number || 1}-depot-notes.txt`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
async function printOnly(id, title) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) { alert('PDF support has not loaded. Check the connection and try again.'); return; }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18; doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(title, 16, y); y += 11;
  const source = id === 'customerDocument'
    ? handoverDocuments.customer.map(section => ({ name: section.heading, text: section.text }))
    : handoverDocuments.engineer.map(section => ({ name: section.heading, text: section.bullets.map(value => `• ${value}`).join('\n') }));
  if (!source.length) { alert('Create the handover documents first.'); return; }
  const placedPhotos = new Set();
  for (const note of source) {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(note.name, 16, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const blocks = id === 'engineerDocument'
      ? note.text.split('\n').map(line => line.replace(/^•\s*/, '').trim()).filter(Boolean).map(line => `• ${line}`)
      : [note.text];
    for (const block of blocks) {
      const lines = doc.splitTextToSize(block, 178);
      for (const line of lines) { if (y > 282) { doc.addPage(); y = 18; } doc.text(line, 16, y); y += 5; }
      if (id === 'engineerDocument') y += 1;
    }
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
$('importTextBtn').onclick = () => $('textFile').click(); $('textFile').onchange = async event => { const file = event.target.files[0]; if (file) { $('transcript').value = await file.text(); currentVisitId = null; interpretation = null; optionChecklists.clear(); } };
$('draftBtn').onclick = aiCheck; $('handoverBtn').onclick = () => handover();
$('backCapture').onclick = () => show(1); $('backInterpretation').onclick = () => show(2); $('backCheck').onclick = () => show(3); $('backDraft').onclick = () => show(4);
$('addConfirmationBtn').onclick = () => addManualConfirmation().catch(error => $('confirmationStatus').textContent = error.message);
$('writeOptionBtn').onclick = () => generateOption().catch(error => $('confirmationStatus').textContent = error.message);
$('anotherSurvey').onclick = () => anotherSurvey().catch(error => status(error.message, true));
$('savePhotosBtn').onclick = () => saveAllPhotos().catch(error => status(error.message, true));
$('downloadNotesBtn').onclick = downloadOptionNotes;
$('printCustomer').onclick = () => printOnly('customerDocument', 'Your heating installation'); $('printEngineer').onclick = () => printOnly('engineerDocument', 'Engineer installation handover');
$('logoutBtn').onclick = () => { clearAuthToken(); location.href = 'login.html'; };
refresh();
