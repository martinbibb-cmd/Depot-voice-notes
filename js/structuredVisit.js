const sectionTargets = {
  boiler: 'New boiler and controls', hotWater: 'System characteristics', flue: 'Flue',
  gas: 'Pipe work', heating: 'Pipe work', controls: 'New boiler and controls',
  condensate: 'Pipe work', water: 'System characteristics', emitters: 'Pipe work',
  electrical: 'New boiler and controls', access: 'Restrictions to work',
  systemTreatment: 'Pipe work', other: 'Office notes'
};

const title = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const clean = value => String(value || '').trim();

export function hasStructuredSurvey(payload) {
  const survey = payload?.structuredVisit;
  return Boolean(Number(payload?.schemaVersion || 1) >= 3 && survey &&
    ((survey.existing || []).length || (survey.customer || []).length || (survey.proposals || []).some(option => (option.components || []).length)));
}

export function structuredEvidence(payload) {
  if (!hasStructuredSurvey(payload)) return [];
  const survey = payload.structuredVisit;
  const lines = [];
  for (const item of survey.existing || []) {
    const detail = [item.type, item.manufacturer, item.model, item.specification, item.position, item.status].map(clean).filter(Boolean).join(' · ');
    if (detail) lines.push(`Existing — ${title(item.section)}: ${detail}`);
  }
  for (const item of survey.customer || []) {
    if (clean(item.text)) lines.push(`Customer — ${title(item.kind)} [${title(item.origin)}]: ${clean(item.text)}`);
  }
  for (const option of survey.proposals || []) for (const item of option.components || []) {
    const detail = [title(item.action), item.type, item.specification, item.positionOrRoute].map(clean).filter(Boolean).join(' · ');
    if (detail) lines.push(`${option.name}${option.isSelected ? ' [selected]' : ''} — ${title(item.section)}: ${detail}`);
    for (const note of item.selectedNotes || []) if (note.confirmed && clean(note.text)) lines.push(`${option.name} — approved note: ${clean(note.text)}`);
  }
  return lines;
}

function fact(id, category, text, targetSection, evidenceQuote = text) {
  return { id, category, text, canonicalMeaning: text, displayText: text, sourceQuote: evidenceQuote,
    evidenceQuote, evidenceSource: 'capturedEvidence', evidenceState: 'captured', targetSection };
}

function existingFacts(survey) {
  return (survey.existing || []).flatMap((item, index) => {
    const detail = [item.type, item.manufacturer, item.model, item.specification, item.position, item.status].map(clean).filter(Boolean).join(' · ');
    if (!detail) return [];
    const quote = `Existing — ${title(item.section)}: ${detail}`;
    return [fact(`structured-existing-${item.id || index}`, `Existing ${title(item.section)}`, quote, sectionTargets[item.section] || 'System characteristics', quote)];
  });
}

function customerFacts(survey) {
  return (survey.customer || []).flatMap((item, index) => {
    if (!clean(item.text) || item.confirmed === false) return [];
    const kind = title(item.kind);
    const quote = `Customer — ${kind} [${title(item.origin)}]: ${clean(item.text)}`;
    return [fact(`structured-customer-${item.id || index}`, kind, clean(item.text), 'Needs', quote)];
  });
}

function proposedText(item) {
  const component = title(item.section || item.component);
  const action = title(item.action);
  const detail = [item.type, item.specification].map(clean).filter(Boolean).join(' ');
  const location = clean(item.positionOrRoute);
  return [action, detail, component, location ? `— ${location}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function optionFacts(option, optionIndex) {
  return (option.components || []).flatMap((item, index) => {
    if (!item.action && !clean(item.type) && !clean(item.specification) && !clean(item.positionOrRoute)) return [];
    const direct = proposedText(item);
    const quote = `${option.name} — ${title(item.section)}: ${[title(item.action), item.type, item.specification, item.positionOrRoute].map(clean).filter(Boolean).join(' · ')}`;
    const base = fact(`structured-option-${option.id || optionIndex}-${item.id || index}`, title(item.section), direct, sectionTargets[item.section] || 'Office notes', quote);
    const approved = (item.selectedNotes || []).filter(note => note.confirmed && clean(note.text)).map((note, noteIndex) =>
      fact(`structured-note-${option.id || optionIndex}-${note.id || noteIndex}`, title(item.section), clean(note.text), sectionTargets[item.section] || 'Office notes', `${option.name} — approved note: ${clean(note.text)}`));
    return [base, ...approved];
  });
}

export function interpretationFromStructuredVisit(payload) {
  if (!hasStructuredSurvey(payload)) return null;
  const survey = payload.structuredVisit;
  return {
    interpretationVersion: 13,
    sourceMode: 'structuredVisit',
    sharedFacts: [...existingFacts(survey), ...customerFacts(survey)],
    options: (survey.proposals || []).map((option, index) => ({
      id: option.id || `structured-option-${index + 1}`,
      name: option.name || `Option ${index + 1}`,
      summary: clean(option.summary),
      status: option.isSelected ? 'preferred' : 'alternative',
      facts: optionFacts(option, index)
    })),
    uncertainties: (survey.evidence || []).filter(item => clean(item.text) && /uncertain|unresolved/i.test(String(item.origin))).map((item, index) =>
      fact(`structured-uncertainty-${item.id || index}`, 'Uncertainty', clean(item.text), 'Office notes', clean(item.text)))
  };
}
