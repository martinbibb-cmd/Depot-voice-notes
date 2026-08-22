export const DEPOT_SECTIONS = ['Needs','System characteristics','New boiler and controls','Flue','Pipe work','Restrictions to work','Disruption','Customer actions','Future plans','Office notes'];
export const ENGINEER_SECTIONS = ['Job overview','Existing system','Boiler and equipment','Flue','Condensate and discharge','Gas supply','Heating, hot water and pipe routes','Controls and electrical','Access and enabling work','Disruption and customer arrangements','Unresolved points'];

const uncertainty = /\b(?:about|approx(?:imately)?|around|could|may|might|likely|suggest(?:ed|ion)?|provisional|possible|questioned|reported|appears?|no visual indication|not established|not sure|unknown|uncertain|to confirm|subject to)\b/i;
const negation = /\b(?:no|not|never|cannot|can't|isn't|wasn't|without|unsuitable|inadequate)\b/i;
// Do not require word boundaries: dictation commonly emits "22mm", where the
// digit/letter boundary is not a JavaScript regex word boundary.
const numeric = value => String(value || '').match(/\d+(?:\.\d+)?/g) || [];
const clean = value => String(value || '').trim();
const sentence = value => { const text = clean(value).replace(/^[-•]\s*/, ''); return text && !/[.!?]$/.test(text) ? `${text}.` : text; };
const capitalise = value => value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;

export function displayTextForFact(item) {
  const canonical = clean(item?.canonicalMeaning || item?.text);
  const category = clean(item?.category).toLowerCase();
  const value = `${category} ${canonical}`.toLowerCase();
  if (/magnetic filter/.test(value) && /\b(?:fit|install|new)\b/.test(value)) return 'Install a magnetic filter.';
  if (/flue/.test(value) && /scaffold/.test(value) && /ladder|slope|garden|access/.test(value)) {
    return 'Normal ladder access to the flue is not possible because the front garden slopes away.';
  }
  if (/condens/.test(category)) {
    let route = canonical
      .replace(/^my suggestion for that would be to\s*/i, '')
      .replace(/^i (?:would|suggest|propose)\s*/i, '')
      .replace(/^take it\s*/i, 'route it ')
      .replace(/\bcurrently goes\b/i, 'runs');
    if (!/condens/i.test(route)) route = `Route the condensate ${route.replace(/^route it\s*/i, '')}`;
    return sentence(capitalise(route));
  }
  if (/no need to upgrade the gas supply for a system boiler/i.test(canonical)) return 'No gas-supply upgrade is required for the system-boiler replacement.';
  const flow = canonical.match(/kitchen tap flow\s*(\d+(?:\.\d+)?)\s*(litres?\/min|l\/min)/i);
  if (flow) return `Kitchen cold-water flow was measured at ${flow[1]} ${flow[2]}.`;
  if (/^customer wants\b/i.test(canonical)) return sentence(canonical.replace(/^customer wants\b/i, 'The customer would like'));
  let result = canonical
    .replace(/^my suggestion for that would be to\s*/i, '')
    .replace(/^i (?:would|suggest|propose)\s*/i, '')
    .replace(/^we will also\s*/i, '')
    .replace(/^we (?:will|would|need to|have to)\s*/i, '')
    .replace(/\bflu\b/gi, /flue/.test(category) ? 'flue' : 'flu')
    .trim();
  return sentence(capitalise(result));
}

export function displayIntegrityErrors(item) {
  const canonical = `${clean(item?.category)} ${clean(item?.canonicalMeaning || item?.text)}`;
  const display = clean(item?.displayText);
  const errors = [];
  if (numeric(display).some(number => !numeric(canonical).includes(number))) errors.push('display text introduced a numeric value');
  if (!item?.surveyorConfirmed && uncertainty.test(canonical) && !uncertainty.test(display)) errors.push('display text strengthened uncertainty');
  if (negation.test(canonical) && !negation.test(display)) errors.push('display text lost negation');
  const entityPattern = /\b(?:boiler|combi|cylinder|gas|flue|condensate|scaffold|filter|radiator|pump|valve|controls?|electrical|pipework|soakaway)\b/gi;
  const canonicalEntities = new Set((canonical.match(entityPattern) || []).map(value => value.toLowerCase()));
  for (const entity of (display.match(entityPattern) || []).map(value => value.toLowerCase())) {
    if (!canonicalEntities.has(entity)) errors.push(`display text introduced ${entity}`);
  }
  return [...new Set(errors)];
}

function presentationFact(item, index) {
  const canonicalMeaning = clean(item.canonicalMeaning || item.text);
  const presented = {
    ...item,
    id: item.id || item.factId || `confirmed-${index + 1}`,
    surveyorConfirmed: item.surveyorConfirmed !== false,
    sourceQuote: clean(item.sourceQuote || item.evidenceQuote),
    canonicalMeaning,
    displayText: clean(item.displayText) || displayTextForFact({ ...item, canonicalMeaning })
  };
  if (displayIntegrityErrors(presented).length) presented.displayText = sentence(canonicalMeaning);
  return presented;
}

export function claimIntegrityErrors(fact) {
  const text = clean(fact?.text), quote = clean(fact?.evidenceQuote);
  const errors = [];
  if (!fact?.manual && !quote) errors.push('missing evidence quote');
  // An explicit surveyor correction may replace a captured value. Its source is
  // the surveyor action, not a claim that the new number appeared in the audio.
  // All non-manual/model-derived values remain locked to their evidence quote.
  if (!fact?.manual && numeric(text).some(number => !numeric(quote).includes(number))) errors.push('numeric value is absent from evidence quote');
  if (fact?.evidenceState !== 'derivedRequirement' && uncertainty.test(quote) && !uncertainty.test(text)) errors.push('uncertainty was strengthened');
  if (fact?.evidenceState === 'derivedRequirement' && (!(fact.supportingFactIds || []).length || !(fact.supportingEvidenceQuotes || []).length)) errors.push('derived requirement is missing supporting evidence');
  if (negation.test(quote) && !negation.test(text)) errors.push('negation was lost');
  return errors;
}

export function sectionForFact(item) {
  const value = `${item?.targetSection || ''} ${item?.category || ''} ${item?.text || ''}`.toLowerCase();
  if (item?.evidenceState === 'uncertain' || /unresolved point/.test(value)) return 'Office notes';
  if (item?.intentType === 'want' || item?.intentType === 'need') return 'Needs';
  if (/customer.*(want|need|prefer|priority)|reason for change|requested outcome/.test(value)) return 'Needs';
  if (/flue|terminal|plume/.test(value)) return 'Flue';
  if (/condens/.test(value)) return 'Pipe work';
  if (/\b(?:proposal|boiler)\b/.test(clean(item?.category).toLowerCase()) && /new boiler|replace.*boiler|install.*boiler|proposed boiler/.test(value)) return 'New boiler and controls';
  if (/control|thermostat|programmer|electrical|consumer unit|fused spur/.test(value)) return 'New boiler and controls';
  if (/customer action|customer prep|customer to|agreed to clear/.test(value)) return 'Customer actions';
  if (/access|restrict|hazard|floor|boxing|cupboard|furniture|drill|scaffold/.test(value)) return 'Restrictions to work';
  if (/disruption|making good|visible|loss of/.test(value)) return 'Disruption';
  if (/future/.test(value)) return 'Future plans';
  if (/existing|current|pressure|flow|system type|pump|valve|cylinder|radiator.*heat/.test(value)) return 'System characteristics';
  if (/new boiler|replace.*boiler|install.*boiler|proposed boiler/.test(value)) return 'New boiler and controls';
  if (DEPOT_SECTIONS.includes(item?.targetSection)) return item.targetSection;
  if (/boiler|heating|hot water|gas|condensate|pipe|route|radiator|cylinder/.test(value)) return 'Pipe work';
  return 'Office notes';
}

export function buildDepotSections(confirmedItems) {
  const grouped = new Map(DEPOT_SECTIONS.map(name => [name, []]));
  for (const [index, source] of (confirmedItems || []).entries()) {
    const item = presentationFact(source, index);
    const section = sectionForFact(item);
    grouped.get(section).push(item);
  }
  return DEPOT_SECTIONS.map(name => {
    const facts = grouped.get(name);
    return {
      section: name,
      factIds: facts.map(item => item.id || item.factId).filter(Boolean),
      plainText: facts.length ? facts.map(item => `${item.displayText.replace(/;$/, '')};`).join('\n') : 'No information recorded.;',
      naturalLanguage: facts.length ? facts.map(item => `• ${item.displayText}`).join('\n') : '• No information recorded.'
    };
  });
}

function engineerSection(item) {
  const value = `${item.category || ''} ${item.targetSection || ''} ${item.canonicalMeaning || item.text || ''}`.toLowerCase();
  if (item.evidenceState === 'uncertain' || /unknown|uncertain|to confirm|not established/.test(value)) return 'Unresolved points';
  if (/flue|terminal|plume/.test(value)) return 'Flue';
  if (/condens/.test(value)) return 'Condensate and discharge';
  if (/\bgas\b/.test(value)) return 'Gas supply';
  if (/\b(?:proposal|boiler)\b/.test(clean(item.category).toLowerCase()) && /\b(?:replace|install|new|proposed)\b.{0,60}\bboiler\b|\bboiler\b.{0,60}\b(?:replace|install|new|proposed|same location)\b/.test(value)) return 'Boiler and equipment';
  if (/magnetic filter|\bfilter\b/.test(value)) return 'Boiler and equipment';
  if (item.targetSection === 'Pipe work' && /pipe|route/.test(value)) return 'Heating, hot water and pipe routes';
  if (/control|electrical|consumer unit|fused spur|thermostat|programmer|hive/.test(value)) return 'Controls and electrical';
  if (item.targetSection === 'Needs' || item.targetSection === 'Future plans' || item.targetSection === 'Office notes') return 'Job overview';
  if (item.targetSection === 'System characteristics') return 'Existing system';
  if (item.targetSection === 'New boiler and controls') return 'Boiler and equipment';
  if (item.targetSection === 'Restrictions to work') return 'Access and enabling work';
  if (['Disruption','Customer actions'].includes(item.targetSection)) return 'Disruption and customer arrangements';
  return 'Heating, hot water and pipe routes';
}

export function buildHandoverDocuments({ confirmedChecklistItems = [], uncertainties = [], customerAdvisories = [] } = {}) {
  const confirmed = confirmedChecklistItems.map((item, index) => presentationFact({ ...item, targetSection: sectionForFact(item) }, index));
  const unresolved = uncertainties.filter(item => item?.text).map((item, index) => presentationFact({
    ...item, id: item.id || `uncertainty-${index + 1}`, targetSection: 'Office notes', evidenceState: 'uncertain', surveyorConfirmed:false
  }, confirmed.length + index));
  const all = [...confirmed, ...unresolved.filter(item => !confirmed.some(fact => fact.id === item.id))];
  const grouped = new Map(ENGINEER_SECTIONS.map(name => [name, []]));
  all.forEach(item => grouped.get(engineerSection(item)).push(item));
  const engineer = ENGINEER_SECTIONS.map(heading => {
    const facts = grouped.get(heading);
    let bullets = facts.map(item => item.displayText);
    if (heading === 'Flue') {
      const typeIndex = bullets.findIndex(text => /^(?:Fanned|Balanced) flue\.$/i.test(text));
      const actionIndex = bullets.findIndex(text => /Install flue through/i.test(text));
      if (typeIndex >= 0 && actionIndex >= 0) {
        const type = /balanced/i.test(bullets[typeIndex]) ? 'balanced' : 'fanned';
        const opening = /existing/i.test(bullets[actionIndex]) ? 'the existing' : 'a new';
        bullets = bullets.filter((_,index) => index !== typeIndex && index !== actionIndex);
        bullets.push(`Install a ${type} flue through ${opening} opening.`);
      }
    }
    if (heading === 'Condensate and discharge') {
      const routeIndex = bullets.findIndex(text => /Route the condensate/i.test(text));
      const actionIndex = bullets.findIndex(text => /Install new condensate/i.test(text));
      if (routeIndex >= 0 && actionIndex >= 0) {
        const combined = bullets[routeIndex].replace(/^Route the condensate/i,'Install new condensate pipework');
        bullets = bullets.filter((_,index) => index !== routeIndex && index !== actionIndex);
        bullets.push(combined);
      }
    }
    return { heading, bullets: bullets.length ? bullets : ['No information recorded.'], factIds: facts.map(item => item.id) };
  });
  const byDepot = section => confirmed.filter(item => item.targetSection === section);
  const proposed = confirmed.filter(item => {
    const value = `${item.category} ${item.canonicalMeaning}`.toLowerCase();
    if (/not adequate for a combi|inadequate for (?:a )?combi|possible route for upgrade/.test(value)) return false;
    if (item.evidenceSource === 'surveyorVisualCorrection' && /\brecorded\b/.test(value)) return false;
    return item.evidenceSource === 'surveyorVisualCorrection' || /\b(?:replace|install|fit|route|retain|renew|provide|required)\b/.test(value) || /no need to upgrade/.test(value);
  });
  const needs = byDepot('Needs');
  const statedIntent = needs.filter(item => item.intentOrigin !== 'derivedFromEvidence');
  const derivedNeeds = needs.filter(item => item.intentType === 'need' && item.intentOrigin === 'derivedFromEvidence');
  const disruption = [...byDepot('Restrictions to work'), ...byDepot('Disruption')];
  const prep = byDepot('Customer actions');
  const selectedBoiler = confirmed.find(item => /replace.{0,60}system boiler|system boiler.{0,60}replace/i.test(item.canonicalMeaning));
  const combiConstraint = confirmed.find(item => /gas supply.{0,60}(?:not adequate|inadequate).{0,30}combi|combi.{0,60}gas supply.{0,30}(?:not adequate|inadequate)/i.test(item.canonicalMeaning));
  const waterEvidence = confirmed.find(item => /\d+(?:\.\d+)?\s*(?:litres?\/min|l\/min)/i.test(item.canonicalMeaning));
  const decisionGrounded = derivedNeeds.some(item => /incoming-water|combi.{0,80}(?:water|gas)|(?:water|gas).{0,80}combi/i.test(item.canonicalMeaning));
  const retainedStoredWater = confirmed.find(item => /retain.{0,40}(?:stored hot water|cylinder|stored-water)/i.test(item.canonicalMeaning));
  const narrative = [
    statedIntent.length ? statedIntent.map(item => item.displayText).join(' ') : '',
    selectedBoiler ? selectedBoiler.displayText : '',
    decisionGrounded && (combiConstraint || waterEvidence) ? `This option was selected after considering ${[
      combiConstraint ? 'the existing gas supply—which is not adequate for a combi boiler' : '',
      waterEvidence ? `the measured kitchen cold-water flow of ${numeric(waterEvidence.canonicalMeaning).join(' ')} litres/min` : ''
    ].filter(Boolean).join('—and ')}.` : '',
    retainedStoredWater && statedIntent.length ? 'This retains stored hot water, so the original space-saving objective is not fully achieved.' : '',
    !selectedBoiler && derivedNeeds.length ? derivedNeeds.map(item => item.displayText).join(' ') : ''
  ].filter(Boolean).join(' ').trim();
  const proposalParts = [...proposed];
  const take = predicate => { const index = proposalParts.findIndex(predicate); return index >= 0 ? proposalParts.splice(index, 1)[0] : null; };
  const flueType = take(item => /\bfanned flue\b|\bbalanced flue\b/i.test(item.canonicalMeaning));
  const flueAction = take(item => /install flue through/i.test(item.canonicalMeaning));
  if (flueType && flueAction) proposalParts.push({ ...flueAction, displayText:`Install a ${/balanced/i.test(flueType.canonicalMeaning) ? 'balanced' : 'fanned'} flue through ${/existing/i.test(flueAction.canonicalMeaning) ? 'the existing' : 'a new'} opening.`, combinedFactIds:[flueType.id,flueAction.id] });
  const condensateRoute = take(item => /condens/.test(`${item.category} ${item.canonicalMeaning}`) && /route|through|outbuilding|soakaway/i.test(item.canonicalMeaning));
  const condensateAction = take(item => /install new condensate/i.test(item.canonicalMeaning));
  if (condensateRoute && condensateAction) proposalParts.push({ ...condensateRoute, displayText:condensateRoute.displayText.replace(/^Route the condensate/i,'Install new condensate pipework'), combinedFactIds:[condensateRoute.id,condensateAction.id] });
  const proposalRank = item => {
    const value = `${item.category} ${item.canonicalMeaning}`.toLowerCase();
    return /boiler/.test(value) ? 1 : /gas/.test(value) ? 2 : /flue/.test(value) ? 3 : /control/.test(value) ? 4 : /filter/.test(value) ? 5 : /condens/.test(value) ? 6 : /scaffold/.test(value) ? 7 : 8;
  };
  proposalParts.sort((a,b) => proposalRank(a) - proposalRank(b));
  const proposalFactIds = [...new Set(proposalParts.flatMap(item => item.combinedFactIds || [item.id]))];
  const advisorySections = [...new Set(customerAdvisories.map(item => item.heading))].map(heading => {
    const matching = customerAdvisories.filter(item => item.heading === heading);
    return { heading, text: matching.map(item => item.text).join(' '), advisoryIds: matching.map(item => item.id), factIds: [] };
  });
  const customer = [
    { heading: 'What we are proposing', text: proposalParts.length ? proposalParts.map(item => item.displayText).join(' ') : 'No proposed work has been recorded.', factIds: proposalFactIds },
    { heading: 'Why this suits your home', text: narrative || (needs.length ? needs.map(item => item.displayText).join(' ') : 'No specific customer objective or confirmed requirement has been recorded.'), factIds: [...new Set([...needs, selectedBoiler, combiConstraint, waterEvidence].filter(Boolean).map(item => item.id))] },
    ...advisorySections,
    { heading: 'What to expect during the work', text: disruption.length ? disruption.map(item => item.displayText).join(' ') : 'No specific job disruption has been confirmed.', factIds: disruption.map(item => item.id) },
    { heading: 'Getting ready', text: prep.length ? prep.map(item => item.displayText).join(' ') : 'No customer preparation has been confirmed.', factIds: prep.map(item => item.id) },
    { heading: 'Points still to confirm', text: unresolved.length ? unresolved.map(item => sentence(item.text)).join(' ') : 'No unresolved points are currently recorded.', factIds: unresolved.map(item => item.id) }
  ];
  const evidence = all.map(item => ({
    id:item.id,
    sourceQuote:item.sourceQuote,
    canonicalMeaning:item.canonicalMeaning,
    displayText:item.displayText,
    category:item.category || '',
    section:engineerSection(item),
    evidenceSource:item.evidenceSource,
    evidenceState:item.evidenceState
  }));
  return { customer, engineer, evidence };
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
  if ((handover?.engineer || []).some(section => section.heading)) {
    const sectionIds = new Map(handover.engineer.map(section => [section.heading, new Set(section.factIds || [])]));
    confirmedItems.forEach((item,index) => {
      const presented = presentationFact({ ...item, targetSection:sectionForFact(item) }, index);
      const expected = engineerSection(presented);
      if (presented.id && !sectionIds.get(expected)?.has(presented.id)) errors.push({ code:'semantic_section_mismatch', factId:presented.id, expectedSection:expected });
    });
  }
  const confirmedNeeds = confirmedItems.filter(item => item.intentType === 'need');
  const needsSection = depotSections.find(section => section.section === 'Needs');
  if (confirmedNeeds.length && (!(needsSection?.factIds || []).some(id => confirmedNeeds.some(item => item.id === id)) || /No information recorded/i.test(needsSection?.plainText || ''))) {
    errors.push({ code: 'false_empty_needs', factIds: confirmedNeeds.map(item => item.id) });
  }
  const unresolved = confirmedItems.filter(item => item.evidenceState === 'uncertain');
  const unresolvedSection = handover?.engineer?.find(section => section.heading === 'Unresolved points');
  if (unresolved.length && /No information recorded/i.test((unresolvedSection?.bullets || []).join(' '))) errors.push({ code: 'lost_uncertainty' });
  const currentItems = confirmedItems.filter(item => item.evidenceState !== 'uncertain');
  const current = currentItems.map(item => clean(item.text)).join(' ').toLowerCase();
  // Detect conflicts within gas-scoped facts only. Searching the concatenated
  // Visit text allowed an unrelated following item (for example "New
  // Condensate") to be mistaken for a new gas supply.
  const gasStatements = currentItems
    .filter(item => /\bgas\b/i.test(`${item.category || ''} ${item.targetSection || ''} ${item.text || ''}`))
    .map(item => clean(item.text).toLowerCase());
  const gasUpgrade = gasStatements.some(value => /\b(?:upgrade|replace|install new|new gas)\b/.test(value));
  const gasRetain = gasStatements.some(value => /\b(?:retain|use existing|existing gas supply is adequate)\b/.test(value));
  if (gasUpgrade && gasRetain) {
    errors.push({ code: 'contradictory_selected_scope', subject: 'gas supply' });
  }
  if (/(?:install|replace with).{0,40}\bcombi\b/.test(current) && /(?:install|replace with).{0,40}\bsystem boiler\b/.test(current)) {
    errors.push({ code: 'contradictory_selected_scope', subject: 'boiler type' });
  }
  return errors;
}
