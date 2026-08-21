import { clearAuthToken, getAuthToken } from '../src/auth/auth-client.js';
import { applyVisualSelection, confirmedChecklistItems, restoreChecklists, serialiseChecklists } from './confirmationState.js';
import { communicationSafeguards, derivedWorkSuggestions, mergeSafeguards, unresolvedSafeguards } from './handoverSafeguards.js';
import { inferredPrimaryRequirement, pipeRequirement, suggestPackage } from './breezePackages.js';
import { trustworthyTransferredFacts } from './transferEvidence.js';
import { buildDepotSections, auditPipelineOutput } from './pipelineInvariants.js';
import { buildVisitBrief, confirmationGroup, confirmationPriority, evidenceStateLabel, uncertaintyPrompt, REVIEW_GROUPS } from './reviewPresentation.js';
import { buildVisualSpecification, componentIcon, VISUAL_COMPONENTS, visualSelectionText } from './specificationVisuals.js';

const WORKER = 'https://depot-voice-notes.martinbibb.workers.dev';
const $ = id => document.getElementById(id);
let notes = [];
let surveyPhotos = [];
let surveyRooms = [];
let surveyStructure = null;
let interpretation = null;
let selectedOption = null;
const optionDrafts = new Map();
const optionChecklists = new Map();
let currentVisitId = null;
let transferPayload = null;
let handoverDocuments = { customer: [], engineer: [] };
let interpretationNeedsUpgrade = false;

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
  if (currentVisitId) localStorage.setItem(`speccheck-step-${currentVisitId}`, String(step));
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
  const safeFacts = trustworthyTransferredFacts(payload);
  add('CAPTURED FACTS', safeFacts.map(x => `${x.subject}: ${x.text} [${x.state || 'captured'}]`));
  add('WATER PRESSURE AND FLOW', (payload.waterPressureTests || []).map(x => [x.testPoint, x.standingPressureBar != null ? `standing ${x.standingPressureBar} bar` : '', x.dynamicPressureBar != null ? `dynamic ${x.dynamicPressureBar} bar` : '', x.flowLitresPerMinute != null ? `${x.flowLitresPerMinute} litres/min` : '', x.note].filter(Boolean).join(' — ')));
  add('ROOMS', (payload.rooms || []).map(x => `${x.name} (${x.floor || 'floor not named'}): ${x.wallCount || 0} walls, ${(x.routes || []).length} routes, ${(x.radiators || []).length} radiators`));
  const pipe = pipeRequirement(payload.pipeRuns || []);
  add('MEASURED PIPE REQUIREMENT', pipe.runs.map(run => `${run.label}: ${run.physicalMetres.toFixed(1)} m route ×${run.multiplier} → ${run.roundedMetres} m / ${run.saleLengths} × 2 m sale lengths`));
  return groups.join('\n\n');
}
async function openCapture(id) {
  try {
    status('Opening complete capture…'); const visit = await api(`/spec-check/visits/${id}`);
    currentVisitId = id;
    transferPayload = visit.payload;
    const saved = await api(`/spec-check/visits/${id}/processing-state`);
    interpretation = saved.interpretation;
    interpretationNeedsUpgrade = Boolean(interpretation && Number(interpretation.interpretationVersion || 0) < 12);
    if (interpretationNeedsUpgrade) interpretation = null;
    optionChecklists.clear();
    restoreChecklists(saved.checklists).forEach((value, key) => optionChecklists.set(key, value));
    $('transcript').value = transcriptOf(visit.payload);
    const evidence = evidenceOf(visit.payload); $('capturedEvidence').textContent = evidence; $('capturedEvidence').classList.toggle('hidden', !evidence);
    await loadPhotos(id, visit.photos); renderRooms(visit.payload.rooms || [], visit.payload.wholeHouseStructure || null); await api(`/spec-check/visits/${id}/consume`, { method: 'POST', body: '{}' });
    const roomCount = (visit.payload.rooms || []).length;
    status(`Opened ${visit.nickname}: ${$('transcript').value.split(/\s+/).filter(Boolean).length} transcript words, ${visit.photos.length} photos and ${roomCount} captured room${roomCount === 1 ? '' : 's'}${visit.payload.wholeHouseStructure?.alignedByStructureBuilder ? ' in an aligned whole-house structure' : ''}.`);
    $('resumeReviewBtn').classList.toggle('hidden', !$('transcript').value.trim());
    const savedStep = Number(localStorage.getItem(`speccheck-step-${id}`) || 1);
    $('resumeReviewBtn').textContent = interpretationNeedsUpgrade ? 'Update survey review' : savedStep >= 3 ? 'Resume confirmation' : 'Resume Ready to quote';
  } catch (error) { status(error.message, true); }
}
function renderRooms(rooms, structure = null) {
  surveyRooms = rooms; surveyStructure = structure; $('roomGallery').replaceChildren();
  $('spatialCapture').classList.toggle('hidden', rooms.length === 0);
  $('roomCount').textContent = `${rooms.length} room${rooms.length === 1 ? '' : 's'} received`;
  if (structure?.alignedByStructureBuilder && rooms.length > 1) $('roomGallery').append(propertyFigure(structure));
  rooms.forEach(room => $('roomGallery').append(roomFigure(room)));
}
function propertyFigure(structure) {
  const allRooms = (structure.floors || []).flatMap(floor => floor.rooms || []);
  const combined = {
    name: 'Whole-house structure', floor: (structure.floors || []).map(floor => floor.name).join(' · '),
    walls: allRooms.flatMap(room => room.walls || []), routes: allRooms.flatMap(room => room.routes || []),
    radiators: allRooms.flatMap(room => room.radiators || [])
  };
  const figure = roomFigure(combined);
  figure.classList.add('whole-house');
  figure.querySelector('figcaption').textContent = `Whole-house structure · ${structure.roomCount} aligned rooms · ${(structure.floors || []).length} floor${(structure.floors || []).length === 1 ? '' : 's'}`;
  return figure;
}
function roomFigure(room) {
  const figure = document.createElement('figure'); figure.style.margin = '0';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', roomViewBox(room)); svg.style.cssText = 'width:100%;height:180px;background:var(--soft);border-radius:8px';
  (room.walls || []).forEach(wall => svg.append(svgLine(wall.start, wall.end, 'currentColor', .06)));
  const colours = { heatingFlowReturn:'#d64545', primaryFlowReturn:'#e07b2d', hotWater:'#d64545', coldWater:'#2575d8', gas:'#d9a514', condensate:'#555', pressureReliefDischarge:'#7d3cb5' };
  (room.routes || []).filter(route => route.view === 'plan').forEach(route => (route.points || []).slice(1).forEach((point, index) => svg.append(svgLine(route.points[index], point, colours[route.service] || '#555', .045))));
  (room.radiators || []).filter(item => item.view === 'plan').forEach(item => { const rect = document.createElementNS(svg.namespaceURI, 'rect'); rect.setAttribute('x', item.centre.horizontalMetres - item.widthMetres / 2); rect.setAttribute('y', item.centre.verticalMetres - .12); rect.setAttribute('width', item.widthMetres); rect.setAttribute('height', .24); rect.setAttribute('fill', 'var(--paper)'); rect.setAttribute('stroke', 'currentColor'); rect.setAttribute('stroke-width', '.035'); svg.append(rect); });
  const caption = document.createElement('figcaption'); caption.textContent = `${room.name} · ${room.floor || 'Floor not named'} · ${(room.walls || []).length} walls`;
  figure.append(svg, caption); return figure;
}
function svgLine(start, end, colour, width) { const line = document.createElementNS('http://www.w3.org/2000/svg', 'line'); line.setAttribute('x1', start.horizontalMetres); line.setAttribute('y1', start.verticalMetres); line.setAttribute('x2', end.horizontalMetres); line.setAttribute('y2', end.verticalMetres); line.setAttribute('stroke', colour); line.setAttribute('stroke-width', width); line.setAttribute('stroke-linecap', 'round'); return line; }
function roomViewBox(room) { const points = (room.walls || []).flatMap(w => [w.start,w.end]); if (!points.length) return '0 0 4 4'; const xs = points.map(p => p.horizontalMetres), ys = points.map(p => p.verticalMetres); const minX=Math.min(...xs)-.3,minY=Math.min(...ys)-.3,w=Math.max(.6,Math.max(...xs)-Math.min(...xs)+.6),h=Math.max(.6,Math.max(...ys)-Math.min(...ys)+.6); return `${minX} ${minY} ${w} ${h}`; }
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
    if (!interpretation || interpretation.interpretationVersion !== 12) {
      interpretation = await api('/interpret', { method: 'POST', body: JSON.stringify({ transcript, capturedEvidence: captured }) });
      optionChecklists.clear();
      await persistProcessingState();
    }
    renderInterpretation();
    renderBreezeSuggestion();
    $('aiCheckStatus').textContent = `${interpretation.options.length} independent proposal option${interpretation.options.length === 1 ? '' : 's'} identified.`;
  } catch (error) { $('aiCheckStatus').textContent = error.message; $('aiCheckStatus').className = 'status error'; }
}

function renderBreezeSuggestion() {
  const panel = $('breezeSuggestion');
  panel.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = 'Breeze package check'; panel.append(heading);
  const native = pipeRequirement(transferPayload?.pipeRuns || []);
  (interpretation?.options || []).forEach((option, index) => {
    const inferred = inferredPrimaryRequirement(option, transferPayload?.pipeRuns || []);
    const runs = [...native.runs, ...(inferred ? [inferred] : [])];
    const required = runs.reduce((sum, run) => sum + run.saleLengths, 0);
    const suggested = suggestPackage(option, required);
    const optionHeading = document.createElement('h4'); optionHeading.textContent = `Option ${index + 1}: ${option.title}`; panel.append(optionHeading);
    const list = document.createElement('ul');
    runs.forEach(run => { const item = document.createElement('li'); item.textContent = `${run.label}: ${run.physicalMetres.toFixed(1)} m route ×${run.multiplier} = ${run.roundedMetres} m (${run.saleLengths} × 2 m sale lengths)`; list.append(item); });
    const total = document.createElement('li'); total.textContent = `Total pipe requirement: ${required} × 2 m sale lengths`; list.append(total); panel.append(list);
    const result = document.createElement('strong');
    result.textContent = suggested ? `Suggested pack: ${suggested.description}. Check ${suggested.possibleAdditionalSaleLengths} additional 2 m sale lengths are included.` : 'No pack suggested safely yet. The proposal must state the boiler/system change and whether its position changes.';
    panel.append(result);
  });
  const caveat = document.createElement('p'); caveat.className = 'hint'; caveat.textContent = 'Based on the recorded survey only. This does not verify Breeze.'; panel.append(caveat);
  panel.classList.remove('hidden');
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
  renderVisitBrief(null, 'visitBrief', [], new Set(['customer','needs','proposal','why','measurements','missing']));
  const actions = $('optionActions'); actions.replaceChildren();
  interpretation.options.forEach((option, index) => {
    const button = document.createElement('button'); button.className = index === 0 ? 'primary' : '';
    button.textContent = interpretation.options.length === 1 ? 'Review proposal' : `Review Option ${index + 1}`;
    button.onclick = () => prepareConfirmation(option, index);
    actions.append(button);
  });
}
function renderVisitBrief(option = null, target = 'visitBrief', additionalMissing = [], allowedIds = null) {
  const container = $(target); container.replaceChildren();
  buildVisitBrief(interpretation, option).filter(section => !allowedIds || allowedIds.has(section.id)).map(section => section.id === 'missing' ? { ...section, items: [...section.items, ...additionalMissing] } : section).forEach(section => {
    if (!section.items.length && section.id !== 'missing') return;
    const card = document.createElement('div'); card.className = `brief-card${section.id === 'missing' && section.items.length ? ' attention' : ''}`;
    const heading = document.createElement('h3'); heading.textContent = section.title;
    const list = document.createElement('ul');
    if (!section.items.length) {
      const item = document.createElement('li'); item.textContent = 'Nothing unresolved was identified.'; list.append(item);
    } else section.items.slice(0, 6).forEach(value => {
      const item = document.createElement('li'); item.textContent = [value.displayText || value.text, value.reason].filter(Boolean).join(' — '); list.append(item);
    });
    if (section.items.length > 6) { const item = document.createElement('li'); item.textContent = `+ ${section.items.length - 6} supporting details below`; list.append(item); }
    card.append(heading, list); container.append(card);
  });
}
function renderProposalBoard(option, target = 'confirmProposalBoard') {
  const container = $(target); container.replaceChildren();
  const board = document.createElement('div'); board.className = 'proposal-board';
  const heading = document.createElement('h3'); heading.textContent = (option?.title || 'Selected proposal').replace(/^Option \d+\s*[—-]\s*/i, ''); board.append(heading);
  const grid = document.createElement('div'); grid.className = 'proposal-editor';
  const checklist = optionChecklists.get(option.id);
  buildVisualSpecification(interpretation, option, checklist).forEach(row => {
    const config = VISUAL_COMPONENTS[row.component] || { actions:['Already done','Retain','Replace','Remove','New','Unresolved'], section:'Office notes' };
    const tile = document.createElement('section'); tile.className = 'proposal-editor-row'; tile.dataset.component = row.component;
    const head = document.createElement('div'); head.className = 'proposal-editor-head'; head.innerHTML = componentIcon(row.component, row.subtype);
    const title = document.createElement('strong'); title.textContent = row.label; head.append(title); tile.append(head);
    const addChoiceGroup = (field, labelText, choices, selected) => {
      if (!choices?.length) return;
      const group = document.createElement('div'); group.className = `visual-choice-group ${field}`; group.setAttribute('role','radiogroup'); group.setAttribute('aria-label', `${row.label} ${labelText}`);
      const label = document.createElement('span'); label.className = 'visual-choice-label'; label.textContent = labelText; group.append(label);
      choices.forEach(choiceValue => {
        const [value, labelValue] = Array.isArray(choiceValue) ? choiceValue : [choiceValue, choiceValue];
        const button = document.createElement('button'); button.type = 'button'; button.className = `visual-choice${selected === value ? ' selected' : ''}`; button.setAttribute('role','radio'); button.setAttribute('aria-checked', String(selected === value));
        if (field === 'type' && ['boiler','flue'].includes(row.component)) button.innerHTML = `${componentIcon(row.component, value)}<span>${labelValue}</span>`;
        else button.textContent = labelValue;
        button.onclick = () => setVisualProposalState(row, field, value, config.section);
        group.append(button);
      });
      tile.append(group);
    };
    addChoiceGroup('type','Type',config.typeChoices,row.subtype);
    addChoiceGroup('action','Action',config.actions,row.action);
    const evidence = document.createElement('details'); evidence.className = 'proposal-evidence';
    const evidenceSummary = document.createElement('summary'); evidenceSummary.textContent = `Supporting evidence (${row.facts.length})`; evidence.append(evidenceSummary);
    const list = document.createElement('ul'); row.facts.forEach(fact => { const item = document.createElement('li'); item.textContent = fact.text; list.append(item); }); evidence.append(list); tile.append(evidence); grid.append(tile);
  });
  board.append(grid);
  const measurements = buildVisitBrief(interpretation, option).find(section => section.id === 'measurements')?.items || [];
  if (measurements.length) {
    const strip = document.createElement('div'); strip.className = 'metric-strip';
    measurements.forEach(item => { const metric = document.createElement('div'); metric.className = 'metric-tile'; const label = document.createElement('strong'); label.textContent = item.category || 'Measurement'; const value = document.createElement('span'); value.textContent = item.text; metric.append(label, value); strip.append(metric); });
    board.append(strip);
  }
  container.append(board);
}

async function setVisualProposalState(row, field, value, targetSection) {
  const state = optionChecklists.get(selectedOption.id);
  if (!state) return;
  const affected = row.facts.filter(fact => field === 'type'
    ? (field === 'type' && (row.component === 'gas' ? /\b(?:15|22|28|35)\s*mm\b/i : new RegExp(`\\b${row.inferredSubtype || value}\\b`, 'i')).test(fact.text))
    : row.inferredAction !== 'Unresolved' && /already|retain|reuse|replace|upgrade|remove|install|fit|new|required|include|same (?:hole|position|opening)/i.test(fact.text));
  applyVisualSelection(state, {
    component:row.component, field, value, text:visualSelectionText(row.component, field, value), targetSection,
    affectedFactIds:affected.map(fact => fact.id), evidenceQuotes:affected.map(fact => fact.evidenceQuote).filter(Boolean), originalText:affected.map(fact => fact.text).join(' | ')
  });
  optionDrafts.delete(selectedOption.id);
  await persistProcessingState();
  renderConfirmation();
}
async function persistProcessingState() {
  if (!currentVisitId || !interpretation) return;
  await api(`/spec-check/visits/${currentVisitId}/processing-state`, { method: 'PUT', body: JSON.stringify({
    interpretation, checklists: serialiseChecklists(optionChecklists)
  }) });
}
async function prepareConfirmation(option, index) {
  selectedOption = { ...option, number: index + 1 };
  if (currentVisitId) localStorage.setItem(`speccheck-option-${currentVisitId}`, option.id);
  renderVisitBrief(selectedOption);
  show(3); $('confirmationStatus').textContent = `Preparing Option ${index + 1}…`;
  try {
    const existing = optionChecklists.get(option.id);
    if (!existing || existing.confirmationVersion !== 4) {
      const result = await api('/confirmation-checklist', { method: 'POST', body: JSON.stringify({
        interpretation, proposal: option, transcript: $('transcript').value,
        capturedEvidence: confirmationEvidence(existing)
      }) });
      // Version 1 contained generic inferred-work suggestions. They are not
      // valid evidence, so retain only facts explicitly added by the surveyor.
      const retainedManualFacts = (existing?.items || []).filter(item => item.manual && !item.removed);
      optionChecklists.set(option.id, {
        confirmationVersion: 4, proposalOptionId: option.id,
        generatedAt: new Date().toISOString(), surveyorComments: existing?.surveyorComments || [],
        items: [
          ...(result.items || []).map(generated => {
            const previous = (existing?.items || []).find(item => (item.factId || item.id) === (generated.factId || generated.id));
            if (!previous || generated.evidenceState === 'uncertain') return generated;
            return { ...generated, text: previous.text || generated.text, checked: Boolean(previous.checked), removed: Boolean(previous.removed) };
          }),
          ...retainedManualFacts
        ]
      });
    }
    optionChecklists.set(option.id, mergeSafeguards(optionChecklists.get(option.id), [
      ...communicationSafeguards(interpretation, option, surveyPhotos, `${$('transcript').value}\n${confirmationEvidence(optionChecklists.get(option.id))}`),
      ...derivedWorkSuggestions(interpretation, option)
    ]));
    await persistProcessingState();
    renderConfirmation();
  } catch (error) { $('confirmationStatus').textContent = error.message; $('confirmationStatus').className = 'status error'; }
}
function confirmationEvidence(state) {
  const comments = (state?.surveyorComments || []).map((comment, index) => `Surveyor comment ${index + 1}: ${comment}`).join('\n');
  return [$('capturedEvidence').textContent, comments].filter(Boolean).join('\n\n');
}
async function reprocessConfirmation(suppliedComment = '') {
  if (!selectedOption) return;
  const comment = (suppliedComment || $('confirmationComment').value).trim();
  if (!comment) return;
  const state = optionChecklists.get(selectedOption.id) || { confirmationVersion: 4, proposalOptionId: selectedOption.id, items: [], surveyorComments: [] };
  state.surveyorComments = [...(state.surveyorComments || []), comment];
  $('confirmationComment').value = '';
  $('confirmationStatus').className = 'status';
  $('confirmationStatus').textContent = 'Reprocessing the transcript with your added context…';
  try {
    interpretation = await api('/interpret', { method: 'POST', body: JSON.stringify({
      transcript: $('transcript').value,
      capturedEvidence: confirmationEvidence(state)
    }) });
    const refreshedOption = interpretation.options?.[Math.max(0, Number(selectedOption.number || 1) - 1)];
    if (!refreshedOption) throw new Error('The added information removed this proposal option. Return to Interpretation and select the current proposal.');
    selectedOption = { ...refreshedOption, number: selectedOption.number || 1 };
    const result = await api('/confirmation-checklist', { method: 'POST', body: JSON.stringify({
      interpretation, proposal: selectedOption, transcript: $('transcript').value,
      capturedEvidence: confirmationEvidence(state)
    }) });
    const retained = state.items.filter(item => item.kind !== 'evidenceFact');
    state.items = [...(result.items || []), ...retained];
    state.generatedAt = new Date().toISOString();
    optionChecklists.set(selectedOption.id, mergeSafeguards(state, [
      ...communicationSafeguards(interpretation, selectedOption, surveyPhotos, `${$('transcript').value}\n${confirmationEvidence(state)}`),
      ...derivedWorkSuggestions(interpretation, selectedOption)
    ]));
    optionDrafts.delete(selectedOption.id);
    await persistProcessingState();
    renderConfirmation();
  } catch (error) {
    $('confirmationStatus').className = 'status error';
    $('confirmationStatus').textContent = `Facts were not reprocessed: ${error.message}`;
  }
}
function renderConfirmation() {
  const state = optionChecklists.get(selectedOption.id) || { items: [] };
  const previousGroups = [...document.querySelectorAll('.confirmation-group')];
  const hadGroups = previousGroups.length > 0;
  const openGroups = new Set(previousGroups.filter(item => item.open).map(item => item.dataset.group));
  const previousY = scrollY;
  renderProposalBoard(selectedOption);
  const container = $('confirmationItems'); container.replaceChildren();
  $('confirmationComments').textContent = state.surveyorComments?.length
    ? `Added context: ${state.surveyorComments.join(' · ')}`
    : 'No surveyor comments added yet.';
  const visibleItems = state.items.filter(item => !item.removed).sort((left, right) => confirmationPriority(left) - confirmationPriority(right));
  const understood = visibleItems.filter(item => item.kind === 'evidenceFact' && item.evidenceState !== 'uncertain');
  const needsAttention = visibleItems.filter(item => item.kind !== 'evidenceFact' || item.evidenceState === 'uncertain');
  $('understoodFacts').replaceChildren();
  const understoodList = document.createElement('ul');
  understood.forEach(item => { const line = document.createElement('li'); line.textContent = item.text; understoodList.append(line); });
  $('understoodFacts').append(understoodList);
  $('understoodFactsSummary').textContent = `Inspect ${understood.length} interpreted facts`;
  const allUnderstood = understood.length > 0 && understood.every(item => item.checked);
  $('confirmUnderstandingBtn').textContent = allUnderstood ? '✓ Overall understanding confirmed' : 'Yes, that is my understanding';
  $('confirmUnderstandingBtn').classList.toggle('primary', !allUnderstood);
  const grouped = new Map(REVIEW_GROUPS.map(group => [group.id, []]));
  needsAttention.forEach(item => grouped.get(confirmationGroup(item)).push(item));
  REVIEW_GROUPS.forEach(group => {
    const items = grouped.get(group.id); if (!items.length) return;
    const section = document.createElement('details'); section.className = 'disclosure confirmation-group';
    section.dataset.group = group.id;
    section.open = hadGroups ? openGroups.has(group.id) : ['decision','unresolved'].includes(group.id) || items.some(item => !item.checked && item.kind !== 'informationGap' && confirmationPriority(item) <= 2);
    const summary = document.createElement('summary'); summary.textContent = group.title;
    const count = document.createElement('span'); count.className = 'group-count';
    count.textContent = `${items.length} to review`;
    summary.append(count); section.append(summary);
    const description = document.createElement('p'); description.className = 'hint'; description.textContent = group.description; section.append(description);
    items.forEach(item => section.append(confirmationCard(item)));
    container.append(section);
  });
  updateConfirmationStatus(state);
  if (hadGroups) requestAnimationFrame(() => scrollTo({ top: previousY }));
}
function confirmationCard(item) {
    const row = document.createElement('div'); row.className = `confirmation${item.kind === 'informationGap' ? ' information-gap' : ''}`;
    if (item.factId || item.id) row.dataset.factId = item.factId || item.id;
    const content = document.createElement('div');
    const promptLabel = document.createElement('span'); promptLabel.className = `state-chip ${item.kind === 'informationGap' ? 'missing' : item.evidenceState === 'uncertain' ? 'uncertain' : ''}`;
    promptLabel.textContent = evidenceStateLabel(item);
    const text = document.createElement('div'); text.className = 'confirmation-text'; text.textContent = item.evidenceState === 'uncertain' ? uncertaintyPrompt(item) : item.text;
    const actions = document.createElement('div'); actions.className = 'card-actions';
    if (item.kind !== 'informationGap' && item.evidenceState !== 'uncertain') {
      const confirm = document.createElement('button'); confirm.className = item.checked ? 'primary' : '';
      confirm.textContent = item.checked ? '✓ Confirmed' : 'Confirm';
      confirm.onclick = () => { item.checked = !item.checked; checklistChanged(); renderConfirmation(); };
      actions.append(confirm);
    }
    if (item.kind === 'informationGap' || item.evidenceState === 'uncertain') {
      if (item.evidenceState === 'uncertain') {
        const keep = document.createElement('button'); keep.textContent = item.checked ? '✓ Kept as unresolved' : 'Keep as unresolved';
        keep.onclick = () => { item.checked = !item.checked; checklistChanged(); renderConfirmation(); };
        actions.append(keep);
      }
      const dismiss = document.createElement('button'); dismiss.textContent = item.evidenceState === 'uncertain' ? 'Ignore unclear wording' : 'Not relevant';
      dismiss.onclick = () => { item.removed = true; checklistChanged(); renderConfirmation(); };
      actions.append(dismiss);
    }
    const correctionPanel = document.createElement('details'); correctionPanel.className = 'card-correction';
    const correctionSummary = document.createElement('summary'); correctionSummary.textContent = item.kind === 'informationGap' ? 'Add what you found' : 'Correct or add context';
    const correction = document.createElement('textarea');
    correction.placeholder = item.kind === 'informationGap' ? 'Add the missing information…' : 'Tell SpecCheck what is wrong or add context…';
    correction.setAttribute('aria-label', `Add information about ${item.originalText || item.text}`);
    const reprocess = document.createElement('button'); reprocess.textContent = 'Add information and reprocess';
    reprocess.onclick = async () => {
      if (!correction.value.trim()) return;
      reprocess.disabled = true;
      await reprocessConfirmation(`${item.originalText || item.text}: ${correction.value.trim()}`);
    };
    const evidence = document.createElement('details'); evidence.className = 'card-correction';
    const evidenceSummary = document.createElement('summary'); evidenceSummary.textContent = 'Show source evidence';
    const reason = document.createElement('small');
    reason.textContent = item.kind === 'informationGap' ? item.reason : (item.evidenceRelation ? `“${item.evidenceRelation}”` : 'Captured survey evidence.');
    evidence.append(evidenceSummary, reason);
    if ((item.supportingEvidenceQuotes || []).length > 1) {
      const sources = document.createElement('ul');
      item.supportingEvidenceQuotes.forEach(quote => { const source = document.createElement('li'); source.textContent = `“${quote}”`; sources.append(source); });
      evidence.append(sources);
    }
    correctionPanel.append(correctionSummary, correction, reprocess);
    content.append(promptLabel, text, actions, correctionPanel, evidence);
    row.append(content);
    return row;
}
function updateConfirmationStatus(state) {
  const visible = state.items.filter(item => !item.removed);
  const safe = visible.filter(item => item.kind === 'evidenceFact' && item.evidenceState !== 'uncertain');
  const checked = safe.filter(item => item.checked).length;
  const attention = visible.filter(item => item.kind === 'informationGap' || (item.evidenceState === 'uncertain' && !item.checked) || (item.kind !== 'evidenceFact' && !item.checked)).length;
  $('confirmationStatus').className = 'status';
  $('confirmationStatus').textContent = `${checked === safe.length && safe.length ? 'Overall understanding confirmed' : 'Confirm the overall understanding once'}${attention ? ` · ${attention} point${attention === 1 ? '' : 's'} needs attention` : ''}.`;
  $('confirmationStatus').className = 'status';
  $('writeOptionBtn').disabled = safe.length > 0 && checked !== safe.length;
}
async function confirmOverallUnderstanding() {
  if (!selectedOption) return;
  const state = optionChecklists.get(selectedOption.id);
  (state?.items || []).filter(item => item.kind === 'evidenceFact' && item.evidenceState !== 'uncertain' && !item.removed).forEach(item => { item.checked = true; });
  checklistChanged();
  renderConfirmation();
}
function checklistChanged() {
  if (selectedOption) optionDrafts.delete(selectedOption.id);
  persistProcessingState().catch(error => $('confirmationStatus').textContent = error.message);
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
    const result = buildDepotSections(confirmedItems);
    notes = result.map(section => ({ name: section.section, text: section.naturalLanguage, factIds: section.factIds, provenance: 'confirmedEvidence' }));
    const errors = auditPipelineOutput({ confirmedItems, depotSections: result, handover: { engineer: result.map(section => ({ factIds: section.factIds })) } });
    if (errors.some(error => error.code !== 'handover_coverage')) throw new Error('Confirmed evidence failed the Depot-note integrity check. Return to confirmation and reprocess the affected fact.');
    optionDrafts.set(option.id, structuredClone(notes)); beginDraft();
  } catch (error) { $('aiCheckStatus').textContent = error.message; $('aiCheckStatus').className = 'status error'; }
}
function bullets(text) { return text.replace(/# Involved #;?/gi, '').split(/;|\n/).map(x => x.replace(/^[-•]\s*/, '').trim()).filter(Boolean).map(x => `• ${x}`).join('\n'); }
function renderEditableNotes() {
  $('notes').replaceChildren(); notes.forEach((note, index) => {
    const card = document.createElement('div'); card.className = 'note';
    const head = document.createElement('div'); head.className = 'note-head'; const title = document.createElement('strong'); title.textContent = note.name;
    const copy = document.createElement('button'); copy.textContent = 'Copy'; copy.onclick = async () => {
      await navigator.clipboard.writeText(depotCopyText(note.text)); copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy', 1200);
    };
    const area = document.createElement('textarea'); area.value = note.text; area.oninput = () => {
      if (!note.originalText) note.originalText = note.text;
      note.text = area.value;
      note.provenance = 'surveyorEdited';
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
          instructions: `${prompt.value.trim()}\n\nUse only the confirmed evidence below. Do not recover or introduce facts from the wider transcript. Preserve all numbers, units, directions, uncertainty and chosen/rejected status exactly. CONFIRMED EVIDENCE:\n${JSON.stringify(confirmedChecklistItems(optionChecklists.get(selectedOption.id)).filter(item => (note.factIds || []).includes(item.id || item.factId)), null, 2)}`
        }) });
        if (!note.originalText) note.originalText = note.text;
        note.text = bullets(result.plainText || result.naturalLanguage || note.text); area.value = note.text; prompt.value = '';
        note.provenance = 'aiWordingAccepted';
        if (selectedOption) optionDrafts.set(selectedOption.id, structuredClone(notes));
      } catch (error) { $('draftStatus').textContent = error.message; }
      finally { improve.disabled = false; improve.textContent = 'Improve'; }
    };
    promptRow.append(prompt, improve); head.append(title, copy); card.append(head, area, promptRow); $('notes').append(card);
  });
}
function beginDraft() {
  notes = orderedNotes(notes);
  renderEditableNotes();
  $('draftStatus').className = 'status';
  $('draftStatus').textContent = `Option ${selectedOption?.number || ''}: ${selectedOption?.title || ''} — ${notes.length} sections ready to edit.`;
  show(4);
}
function renderReadOnly(container, source, copy = true) {
  container.replaceChildren(); const placedPhotos = new Set(); orderedNotes(source).forEach(note => {
    const card = document.createElement('div'); card.className = 'note'; const head = document.createElement('div'); head.className = 'note-head';
    if (note.name === 'Access and enabling work') card.classList.add('enabling');
    if (note.name === 'Unresolved points' && !/^No (?:information|unresolved)/i.test(note.text.trim())) card.classList.add('unresolved');
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
    if (surveyRooms.length) {
      const heading = document.createElement('h3'); heading.textContent = 'Captured rooms and routes'; container.append(heading);
      if (surveyStructure?.alignedByStructureBuilder) container.append(propertyFigure(surveyStructure));
      surveyRooms.forEach(room => container.append(roomFigure(room)));
    }
  }
}
function photoSection(subject = '') {
  const tag = subject.toLowerCase();
  if (/user controls|system controls|electric meter|master fuse|consumer unit/.test(tag)) return 'Controls and electrical';
  if (/\bflue\b|terminal|plume/.test(tag)) return 'Flue';
  if (/condensate|condensulate/.test(tag)) return 'Condensate and discharge';
  if (/gas meter|gas pipe|gas supply/.test(tag)) return 'Gas supply';
  if (/boiler|manifold|cylinder|radiator|tank/.test(tag)) return 'Boiler and equipment';
  return null;
}
function photoFigure(photo) {
  const figure = document.createElement('figure');
  const image = document.createElement('img'); image.src = photo.src; image.alt = photo.caption;
  const caption = document.createElement('figcaption'); caption.textContent = usefulPhotoCaption(photo);
  figure.append(image, caption); return figure;
}
function usefulPhotoCaption(photo) {
  const subject = String(photo.subject || 'Site photograph').trim();
  const caption = String(photo.caption || '').trim();
  if (!caption || caption.localeCompare(subject, undefined, { sensitivity: 'accent' }) === 0) return subject;
  if (caption.toLowerCase().startsWith(`${subject.toLowerCase()} — ${subject.toLowerCase()}`)) return caption.slice(subject.length + 3);
  return caption.toLowerCase().startsWith(subject.toLowerCase()) ? caption : `${subject} — ${caption}`;
}
function depotCopyText(text) {
  return text.split(/\n|;/).map(line => line.replace(/^\s*[•-]\s*/, '').trim()).filter(Boolean).map(line => `${line};`).join('\n');
}
async function handover() {
  show(5); $('handoverStatus').className = 'status'; $('handoverStatus').textContent = 'Writing the customer and engineer documents from confirmed information…';
  try {
    const confirmedItems = confirmedChecklistItems(optionChecklists.get(selectedOption.id));
    const relevantWantsNeeds = confirmedItems.filter(item => item.targetSection === 'Needs');
    const technicalUncertainties = confirmedItems.filter(item => item.evidenceState === 'uncertain' || /to confirm|unknown|unresolved|uncertain/i.test(item.text));
    const confirmedFacts = confirmedItems.map(item => ({ id: item.id, category: item.targetSection, text: item.text, evidenceQuote: item.evidenceQuote, evidenceSource: item.evidenceSource, evidenceState: item.evidenceState }));
    handoverDocuments = await api('/handover-documents', { method: 'POST', body: JSON.stringify({
      sharedFacts: confirmedFacts,
      selectedProposal: { id: selectedOption.id, title: `Confirmed option ${selectedOption.number}`, facts: confirmedFacts },
      relevantWantsNeeds,
      confirmedChecklistItems: confirmedItems,
      uncertainties: technicalUncertainties,
      surveyorEditedNotes: notes
    }) });
    const customerSource = handoverDocuments.customer.map(section => ({ name: section.heading, text: section.text }));
    const engineerSource = handoverDocuments.engineer.map(section => ({ name: section.heading, text: section.bullets.map(value => `• ${value}`).join('\n') }));
    renderReadOnly($('customerNotes'), customerSource, false);
    renderReadOnly($('engineerNotes'), engineerSource, false);
    $('handoverStatus').textContent = 'The complete customer and engineer handover is ready to print or save.';
  } catch (error) { $('handoverStatus').className = 'status error'; $('handoverStatus').textContent = `Documents were not created: ${error.message}`; }
}
async function anotherSurvey() {
  notes = [];
  interpretation = null; selectedOption = null; currentVisitId = null; transferPayload = null; handoverDocuments = { customer: [], engineer: [] }; optionDrafts.clear(); optionChecklists.clear();
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
  surveyRooms = []; surveyStructure = null; $('roomGallery').replaceChildren();
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
async function printCompleteHandover() {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error('The local PDF component did not load. Close and reopen the PWA, then try again.');
  const title = 'Heating installation handover';
  $('handoverStatus').className = 'status'; $('handoverStatus').textContent = 'Creating the complete handover…';
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18; doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(title, 16, y); y += 11;
  const customerSource = handoverDocuments.customer.map(section => ({ name: section.heading, text: section.text, audience: 'customer' }));
  const engineerSource = handoverDocuments.engineer.map(section => ({ name: section.heading, text: section.bullets.map(value => `• ${value}`).join('\n'), audience: 'engineer' }));
  if (!customerSource.length && !engineerSource.length) { alert('Create the handover first.'); return; }
  const source = [
    { name: 'Customer summary', text: '', documentHeading: true }, ...customerSource,
    { name: 'Engineer works', text: '', documentHeading: true }, ...engineerSource
  ];
  const placedPhotos = new Set();
  for (const note of source) {
    if (y > 270) { doc.addPage(); y = 18; }
    if (note.documentHeading) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(note.name, 16, y); y += 9;
      continue;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(note.name, 16, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const blocks = note.audience === 'engineer'
      ? note.text.split('\n').map(line => line.replace(/^•\s*/, '').trim()).filter(Boolean).map(line => `• ${line}`)
      : [note.text];
    for (const block of blocks) {
      const lines = doc.splitTextToSize(block, 178);
      for (const line of lines) { if (y > 282) { doc.addPage(); y = 18; } doc.text(line, 16, y); y += 5; }
      if (note.audience === 'engineer') y += 1;
    }
    y += 3;
    if (note.audience === 'engineer') {
      for (let index = 0; index < surveyPhotos.length; index += 1) {
        if (photoSection(surveyPhotos[index].subject) === note.name) {
          try { y = await addPhotoToPDF(doc, surveyPhotos[index], y); placedPhotos.add(index); }
          catch (error) { console.warn('Photo omitted from PDF', error); }
        }
      }
    }
  }
  {
    const remaining = surveyPhotos.filter((_, index) => !placedPhotos.has(index));
    if (remaining.length) {
      if (y > 260) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Other site photographs', 16, y); y += 7;
      for (const photo of remaining) { try { y = await addPhotoToPDF(doc, photo, y); } catch (error) { console.warn('Photo omitted from PDF', error); } }
    }
    if (surveyRooms.length) {
      if (y > 250) { doc.addPage(); y = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Captured rooms and routes', 16, y); y += 7;
      if (surveyStructure?.alignedByStructureBuilder) { try { y = await addRoomToPDF(doc, combinedStructureRoom(surveyStructure), y); } catch (error) { console.warn('Whole-house plan omitted from PDF', error); } }
      for (const room of surveyRooms) { try { y = await addRoomToPDF(doc, room, y); } catch (error) { console.warn('Room plan omitted from PDF', error); } }
    }
  }
  await deliverPDF(doc, `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`, title);
  $('handoverStatus').textContent = 'The complete handover is ready to save, print or share.';
}
async function deliverPDF(doc, filename, title) {
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.rel = 'noopener';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function addRoomToPDF(doc, room, y) {
  const figure = roomFigure(room), svg = figure.querySelector('svg');
  const source = new XMLSerializer().serializeToString(svg);
  const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode().catch(() => {});
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (y + 100 > 286) { doc.addPage(); y = 18; }
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 16, y, 178, 100); y += 105;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`${room.name} · ${room.floor || 'Floor not named'}`, 16, y); return y + 7;
}
function combinedStructureRoom(structure) {
  const rooms = (structure.floors || []).flatMap(floor => floor.rooms || []);
  return {
    name: 'Whole-house structure', floor: (structure.floors || []).map(floor => floor.name).join(' · '),
    walls: rooms.flatMap(room => room.walls || []), routes: rooms.flatMap(room => room.routes || []),
    radiators: rooms.flatMap(room => room.radiators || [])
  };
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
  const caption = doc.splitTextToSize(usefulPhotoCaption(photo), 178);
  doc.text(caption, 16, y); return y + caption.length * 4.5 + 5;
}

$('pairBtn').onclick = () => pair().catch(error => status(error.message, true)); $('refreshBtn').onclick = refresh;
$('importTextBtn').onclick = () => $('textFile').click(); $('textFile').onchange = async event => { const file = event.target.files[0]; if (file) { $('transcript').value = await file.text(); currentVisitId = null; interpretation = null; optionChecklists.clear(); } };
$('draftBtn').onclick = aiCheck; $('handoverBtn').onclick = () => handover();
$('backCapture').onclick = () => show(1); $('backInterpretation').onclick = () => show(2); $('backCheck').onclick = () => show(3); $('backDraft').onclick = () => show(4);
$('reprocessConfirmationBtn').onclick = () => reprocessConfirmation().catch(error => $('confirmationStatus').textContent = error.message);
$('confirmUnderstandingBtn').onclick = () => confirmOverallUnderstanding().catch(error => $('confirmationStatus').textContent = error.message);
$('resumeReviewBtn').onclick = async () => {
  if (!interpretation) return aiCheck();
  renderInterpretation();
  const savedStep = Number(localStorage.getItem(`speccheck-step-${currentVisitId}`) || 2);
  const optionId = localStorage.getItem(`speccheck-option-${currentVisitId}`);
  const optionIndex = interpretation.options?.findIndex(option => option.id === optionId) ?? -1;
  if (savedStep >= 3 && optionIndex >= 0) return prepareConfirmation(interpretation.options[optionIndex], optionIndex);
  show(2);
};
$('writeOptionBtn').onclick = () => generateOption().catch(error => $('confirmationStatus').textContent = error.message);
$('anotherSurvey').onclick = () => anotherSurvey().catch(error => status(error.message, true));
$('savePhotosBtn').onclick = () => saveAllPhotos().catch(error => status(error.message, true));
$('downloadNotesBtn').onclick = downloadOptionNotes;
$('printHandover').onclick = () => printCompleteHandover().catch(error => { $('handoverStatus').className = 'status error'; $('handoverStatus').textContent = `Handover failed: ${error.message}`; });
$('logoutBtn').onclick = () => { clearAuthToken(); location.href = 'login.html'; };
refresh();
