import { buildVisitCustomerAdvisories } from './customerAdvisories.js';

const sectionTargets = {
  boiler: 'New boiler and controls', hotWater: 'System characteristics', flue: 'Flue',
  gas: 'Pipe work', heating: 'Pipe work', controls: 'New boiler and controls',
  condensate: 'Pipe work', discharge: 'Pipe work', water: 'System characteristics', emitters: 'Pipe work',
  electrical: 'New boiler and controls', access: 'Restrictions to work',
  systemTreatment: 'Pipe work', other: 'Office notes'
};

const title = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
const clean = value => String(value || '').trim();
const customerContext = item => [item.topic ? title(item.topic) : '', item.priority ? title(item.priority) : ''].filter(Boolean).join(' · ');

export function hasStructuredSurvey(payload) {
  const survey = payload?.structuredVisit;
  return Boolean(Number(payload?.schemaVersion || 1) >= 3 && survey &&
    ((survey.existing || []).length || (survey.customer || []).length || (survey.measurements || []).length ||
      (survey.proposals || []).some(option => (option.components || []).length)));
}

export function interpretationRequiresRefresh(payload, interpreted) {
  if (!interpreted) return false;
  const version = Number(interpreted.interpretationVersion || 0);
  if (hasStructuredSurvey(payload)) {
    // A schema-3 Visit is authoritative. A transcript-era interpretation must
    // never be allowed to shadow structured Existing/Customer/Proposed state,
    // even when the legacy interpretation itself has a current legacy version.
    return interpreted.sourceMode !== 'structuredVisit' || version < 15;
  }
  return version < 12;
}

function measurementText(item) {
  const qualifier = item.qualifier === 'approximate' ? 'approximately ' : '';
  return `${title(item.kind)}: ${qualifier}${item.value} ${clean(item.unit)}`.trim();
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
    if (clean(item.text)) lines.push(`Customer — ${title(item.kind)} [${[title(item.origin), customerContext(item)].filter(Boolean).join(' · ')}]: ${clean(item.text)}`);
  }
  for (const item of survey.measurements || []) {
    const scope = item.proposalOptionID ? `Proposal ${item.proposalOptionID}` : title(item.layer);
    lines.push(`${scope} — ${title(item.section)} measurement: ${measurementText(item)}`);
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
    const quote = `Customer — ${kind} [${[title(item.origin), customerContext(item)].filter(Boolean).join(' · ')}]: ${clean(item.text)}`;
    return [fact(`structured-customer-${item.id || index}`, kind, clean(item.text), 'Needs', quote)];
  });
}

function measurementFact(item, index) {
  const text = measurementText(item);
  const source = clean(item.sourceText) || text;
  return fact(`structured-measurement-${item.id || index}`, `${title(item.section)} measurement`, text,
    sectionTargets[item.section] || 'System characteristics', source);
}

function sharedMeasurementFacts(survey) {
  return (survey.measurements || []).filter(item => !item.proposalOptionID).map(measurementFact);
}

function proposedText(item) {
  const section = clean(item.section || item.component);
  const component = title(section);
  const actionKey = clean(item.action).toLowerCase();
  const action = title(item.action);
  const detail = [item.type, item.specification].map(clean).filter(Boolean).join(' ');
  const location = clean(item.positionOrRoute);
  const locationSuffix = location ? ` ${location}.` : '.';
  const templates = {
    boiler: {
      retain: `Retain the existing ${detail || 'boiler'}${locationSuffix}`,
      replace: `Replace the existing boiler${detail ? ` with a new ${detail}` : ''}${locationSuffix}`,
      remove: `Remove the existing boiler${locationSuffix}`,
      new: `Install a new ${detail || 'boiler'}${locationSuffix}`
    },
    hotWater: {
      retain: `Retain the existing ${detail || 'hot-water arrangement'}${locationSuffix}`,
      replace: `Replace the existing ${detail || 'hot-water cylinder'}${locationSuffix}`,
      remove: `Remove the existing ${detail || 'hot-water cylinder'}${locationSuffix}`,
      new: `Install a new ${detail || 'hot-water cylinder'}${locationSuffix}`
    },
    heating: {
      retain: `Retain the existing heating flow and return pipework${locationSuffix}`,
      replace: `Alter the existing heating flow and return pipework${locationSuffix}`,
      remove: `Remove the redundant heating pipework where accessible${locationSuffix}`,
      new: `Install new heating flow and return pipework${locationSuffix}`
    },
    controls: {
      retain: `Retain the existing heating controls${locationSuffix}`,
      replace: `Replace the existing heating controls${detail ? ` with ${detail}` : ''}${locationSuffix}`,
      remove: `Remove the redundant heating controls${locationSuffix}`,
      new: `Install new ${detail || 'heating controls'}${locationSuffix}`
    },
    gas: {
      retain: `Retain the existing gas supply${detail ? ` (${detail})` : ''}${locationSuffix}`,
      replace: `Upgrade or replace the gas supply${detail ? ` with ${detail}` : ''}${locationSuffix}`,
      remove: `Remove redundant gas pipework where accessible${locationSuffix}`,
      new: `Install a new gas supply${detail ? ` (${detail})` : ''}${locationSuffix}`
    },
    condensate: {
      retain: `Retain the existing condensate route${locationSuffix}`,
      replace: `Alter or replace the existing condensate route${locationSuffix}`,
      remove: `Remove redundant condensate pipework where accessible${locationSuffix}`,
      new: `Install a new condensate route${locationSuffix}`
    },
    discharge: {
      retain: `Retain the existing discharge route${locationSuffix}`,
      replace: `Alter the existing discharge route${locationSuffix}`,
      remove: `Remove redundant discharge pipework where accessible${locationSuffix}`,
      new: `Install a new discharge route${locationSuffix}`
    }
  };
  if (section === 'access') {
    const access = `${detail} ${location}`.toLowerCase();
    if (/scaffold/.test(access)) return 'Scaffold access is required for the proposed work at height.';
    if (/ladder/.test(access)) return 'Ladder access is required for the proposed work at height.';
  }
  return templates[section]?.[actionKey] || [action, detail, component, location ? `— ${location}` : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function approvedNoteMatches(item, note) {
  if (note.isCustom || !clean(note.libraryID)) return true;
  const id = clean(note.libraryID).toLowerCase();
  const action = clean(item.action).toLowerCase();
  const type = clean(item.type).toLowerCase();
  const idAction = ['retain','replace','remove','new'].find(value => new RegExp(`(?:^|[.-])${value}(?:$|[.-])`).test(id));
  if (idAction && action && idAction !== action) return false;
  if (item.section === 'boiler') {
    const noteType = ['regular','system','combi'].find(value => id.includes(value));
    if (noteType && type && !type.includes(noteType)) return false;
  }
  if (item.section === 'hotWater') {
    const noteType = ['unvented','vented'].find(value => id.includes(value));
    const capturedType = type.includes('unvented') ? 'unvented' : type.includes('vented') ? 'vented' : '';
    if (noteType && capturedType && noteType !== capturedType) return false;
  }
  if (item.section === 'controls' && type) {
    if (type.includes('hive') && /programmer|thermostat/.test(id) && !id.includes('hive')) return false;
  }
  return true;
}

function optionFacts(option, optionIndex) {
  const componentFacts = (option.components || []).flatMap((item, index) => {
    if (!item.action && !clean(item.type) && !clean(item.specification) && !clean(item.positionOrRoute)) return [];
    const direct = proposedText(item);
    const quote = `${option.name} — ${title(item.section)}: ${[title(item.action), item.type, item.specification, item.positionOrRoute].map(clean).filter(Boolean).join(' · ')}`;
    const base = fact(`structured-option-${option.id || optionIndex}-${item.id || index}`, title(item.section), direct, sectionTargets[item.section] || 'Office notes', quote);
    const approved = (item.selectedNotes || []).filter(note => note.confirmed && clean(note.text) && approvedNoteMatches(item, note)).map((note, noteIndex) =>
      fact(`structured-note-${option.id || optionIndex}-${note.id || noteIndex}`, title(item.section), clean(note.text), sectionTargets[item.section] || 'Office notes', `${option.name} — approved note: ${clean(note.text)}`));
    // Confirmed approved notes are the controlled installation wording for the
    // structured state. Emitting both the generic state sentence and its note
    // duplicates the same work in Depot notes and handover.
    return approved.length ? approved : [base];
  });
  return componentFacts;
}

export function interpretationFromStructuredVisit(payload) {
  if (!hasStructuredSurvey(payload)) return null;
  const survey = payload.structuredVisit;
  const advisoryOptions = new Map(buildVisitCustomerAdvisories(survey).map(item => [item.proposalOptionId, item.advisories]));
  return {
    interpretationVersion: 15,
    sourceMode: 'structuredVisit',
    sharedFacts: [...existingFacts(survey), ...customerFacts(survey), ...sharedMeasurementFacts(survey)],
    options: (survey.proposals || []).map((option, index) => ({
      id: option.id || `structured-option-${index + 1}`,
      name: option.name || `Option ${index + 1}`,
      summary: clean(option.summary),
      status: option.isSelected ? 'preferred' : 'alternative',
      customerAdvisories: advisoryOptions.get(option.id) || [],
      facts: [
        ...optionFacts(option, index),
        ...(survey.measurements || []).filter(item => item.proposalOptionID === option.id).map(measurementFact)
      ]
    })),
    uncertainties: (survey.evidence || []).filter(item => clean(item.text) && /uncertain|unresolved/i.test(String(item.origin))).map((item, index) =>
      fact(`structured-uncertainty-${item.id || index}`, 'Uncertainty', clean(item.text), 'Office notes', clean(item.text)))
  };
}
