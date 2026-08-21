export const DEPOT_SECTIONS = ['Needs','System characteristics','New boiler and controls','Flue','Pipe work','Restrictions to work','Disruption','Customer actions','Future plans','Office notes'];
export const ENGINEER_SECTIONS = ['Job overview','Existing system','Boiler and equipment','Flue','Condensate and discharge','Gas supply','Heating, hot water and pipe routes','Controls and electrical','Access and enabling work','Disruption and customer arrangements','Unresolved points'];

const uncertainty = /\b(?:about|approx(?:imately)?|around|could|may|might|likely|suggest(?:ed|ion)?|provisional|possible|questioned|reported|appears?|no visual indication|not established|not sure|unknown|uncertain|to confirm|subject to)\b/i;
const negation = /\b(?:no|not|never|cannot|can't|isn't|wasn't|without|unsuitable|inadequate)\b/i;
// Do not require word boundaries: dictation commonly emits "22mm", where the
// digit/letter boundary is not a JavaScript regex word boundary.
const numeric = value => String(value || '').match(/\d+(?:\.\d+)?/g) || [];
const clean = value => String(value || '').trim();
const sentence = value => { const text = clean(value).replace(/^[-•]\s*/, ''); return text && !/[.!?]$/.test(text) ? `${text}.` : text; };

export function claimIntegrityErrors(fact) {
  const text = clean(fact?.text), quote = clean(fact?.evidenceQuote);
  const errors = [];
  if (!fact?.manual && !quote) errors.push('missing evidence quote');
  if (numeric(text).some(number => !numeric(quote).includes(number))) errors.push('numeric value is absent from evidence quote');
  if (uncertainty.test(quote) && !uncertainty.test(text)) errors.push('uncertainty was strengthened');
  if (negation.test(quote) && !negation.test(text)) errors.push('negation was lost');
  return errors;
}

export function sectionForFact(item) {
  const value = `${item?.targetSection || ''} ${item?.category || ''} ${item?.text || ''}`.toLowerCase();
  if (DEPOT_SECTIONS.includes(item?.targetSection)) return item.targetSection;
  if (/customer.*(want|need|prefer|priority)|reason for change|requested outcome/.test(value)) return 'Needs';
  if (/flue|terminal|plume/.test(value)) return 'Flue';
  if (/control|thermostat|programmer|electrical|consumer unit|fused spur/.test(value)) return 'New boiler and controls';
  if (/access|restrict|hazard|floor|boxing|cupboard|furniture|drill|scaffold/.test(value)) return 'Restrictions to work';
  if (/disruption|making good|visible|loss of/.test(value)) return 'Disruption';
  if (/customer action|customer prep|customer to|agreed to clear/.test(value)) return 'Customer actions';
  if (/future/.test(value)) return 'Future plans';
  if (/existing|current|pressure|flow|system type|pump|valve|cylinder|radiator.*heat/.test(value)) return 'System characteristics';
  if (/new boiler|replace.*boiler|install.*boiler|proposed boiler/.test(value)) return 'New boiler and controls';
  if (/boiler|heating|hot water|gas|condensate|pipe|route|radiator|cylinder/.test(value)) return 'Pipe work';
  return 'Office notes';
}

export function buildDepotSections(confirmedItems) {
  const grouped = new Map(DEPOT_SECTIONS.map(name => [name, []]));
  for (const item of confirmedItems || []) {
    const section = sectionForFact(item);
    grouped.get(section).push(item);
  }
  return DEPOT_SECTIONS.map(name => {
    const facts = grouped.get(name);
    return {
      section: name,
      factIds: facts.map(item => item.id || item.factId).filter(Boolean),
      plainText: facts.length ? facts.map(item => `${clean(item.text)};`).join('\n') : 'No information recorded.;',
      naturalLanguage: facts.length ? facts.map(item => `• ${clean(item.text)}`).join('\n') : '• No information recorded.'
    };
  });
}

function engineerSection(item) {
  const value = `${item.targetSection || ''} ${item.text || ''}`.toLowerCase();
  if (item.evidenceState === 'uncertain' || /unknown|uncertain|to confirm|not established/.test(value)) return 'Unresolved points';
  if (item.targetSection === 'Needs' || item.targetSection === 'Future plans' || item.targetSection === 'Office notes') return 'Job overview';
  if (item.targetSection === 'System characteristics') return 'Existing system';
  if (item.targetSection === 'Flue') return 'Flue';
  if (/condens/.test(value)) return 'Condensate and discharge';
  if (/\bgas\b/.test(value)) return 'Gas supply';
  if (/control|electrical|consumer unit|fused spur|thermostat|programmer|hive/.test(value)) return 'Controls and electrical';
  if (item.targetSection === 'New boiler and controls') return 'Boiler and equipment';
  if (item.targetSection === 'Restrictions to work') return 'Access and enabling work';
  if (['Disruption','Customer actions'].includes(item.targetSection)) return 'Disruption and customer arrangements';
  return 'Heating, hot water and pipe routes';
}

export function buildHandoverDocuments({ confirmedChecklistItems = [], uncertainties = [] } = {}) {
  const confirmed = confirmedChecklistItems.map((item, index) => ({ ...item, id: item.id || item.factId || `confirmed-${index + 1}`, targetSection: sectionForFact(item) }));
  const unresolved = uncertainties.filter(item => item?.text).map((item, index) => ({
    ...item, id: item.id || `uncertainty-${index + 1}`, targetSection: 'Office notes', evidenceState: 'uncertain'
  }));
  const all = [...confirmed, ...unresolved.filter(item => !confirmed.some(fact => fact.id === item.id))];
  const grouped = new Map(ENGINEER_SECTIONS.map(name => [name, []]));
  all.forEach(item => grouped.get(engineerSection(item)).push(item));
  const engineer = ENGINEER_SECTIONS.map(heading => {
    const facts = grouped.get(heading);
    return { heading, bullets: facts.length ? facts.map(item => clean(item.text)) : ['No information recorded.'], factIds: facts.map(item => item.id) };
  });
  const byDepot = section => confirmed.filter(item => item.targetSection === section);
  const proposed = confirmed.filter(item => ['New boiler and controls','Flue','Pipe work'].includes(item.targetSection));
  const needs = byDepot('Needs');
  const disruption = [...byDepot('Restrictions to work'), ...byDepot('Disruption')];
  const prep = byDepot('Customer actions');
  const customer = [
    { heading: 'What we are proposing', text: proposed.length ? proposed.map(item => sentence(item.text)).join(' ') : 'No proposed work has been recorded.', factIds: proposed.map(item => item.id) },
    { heading: 'Why this suits your home', text: needs.length ? `You told us: ${needs.map(item => sentence(item.text)).join(' ')} The proposed work should be read alongside these recorded priorities; it does not imply that every original objective is achieved.` : 'No specific customer objective has been recorded.', factIds: needs.map(item => item.id) },
    { heading: 'What to expect during the work', text: disruption.length ? disruption.map(item => sentence(item.text)).join(' ') : 'No specific job disruption has been confirmed.', factIds: disruption.map(item => item.id) },
    { heading: 'Getting ready', text: prep.length ? prep.map(item => sentence(item.text)).join(' ') : 'No customer preparation has been confirmed.', factIds: prep.map(item => item.id) },
    { heading: 'Points still to confirm', text: unresolved.length ? unresolved.map(item => sentence(item.text)).join(' ') : 'No unresolved points are currently recorded.', factIds: unresolved.map(item => item.id) }
  ];
  return { customer, engineer };
}

export function auditPipelineOutput({ confirmedItems = [], depotSections = [], handover } = {}) {
  const errors = [];
  for (const item of confirmedItems) for (const error of claimIntegrityErrors(item)) errors.push({ code: 'claim_integrity', factId: item.id, message: error });
  const depotIds = new Set(depotSections.flatMap(section => section.factIds || []));
  const engineerIds = new Set((handover?.engineer || []).flatMap(section => section.factIds || []));
  for (const item of confirmedItems) {
    if (item.id && !depotIds.has(item.id)) errors.push({ code: 'depot_coverage', factId: item.id });
    if (item.id && !engineerIds.has(item.id)) errors.push({ code: 'handover_coverage', factId: item.id });
  }
  for (const section of depotSections) {
    if ((section.factIds || []).length && /No information recorded/i.test(section.plainText || '')) errors.push({ code: 'false_empty_section', section: section.section });
  }
  const unresolved = confirmedItems.filter(item => item.evidenceState === 'uncertain');
  const unresolvedSection = handover?.engineer?.find(section => section.heading === 'Unresolved points');
  if (unresolved.length && /No information recorded/i.test((unresolvedSection?.bullets || []).join(' '))) errors.push({ code: 'lost_uncertainty' });
  const current = confirmedItems.filter(item => item.evidenceState !== 'uncertain').map(item => clean(item.text)).join(' ').toLowerCase();
  if (/\bgas\b/.test(current) && /(?:upgrade|new)\b.{0,50}\bgas\b|\bgas\b.{0,50}(?:upgrade|new)/.test(current) &&
      /(?:retain|use existing)\b.{0,50}\bgas\b|\bgas\b.{0,50}(?:retain|use existing)/.test(current)) {
    errors.push({ code: 'contradictory_selected_scope', subject: 'gas supply' });
  }
  if (/(?:install|replace with).{0,40}\bcombi\b/.test(current) && /(?:install|replace with).{0,40}\bsystem boiler\b/.test(current)) {
    errors.push({ code: 'contradictory_selected_scope', subject: 'boiler type' });
  }
  return errors;
}
