const esc = value => String(value || '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);
const line = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const path = d => `<path d="${d}"/>`;
const circle = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const rect = (x, y, width, height, rx = 0) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}"/>`;

const primitives = {
  flame: () => path('M24 39c-7 0-11-5-11-11 0-7 6-10 8-18 6 5 12 11 12 19 0 6-4 10-9 10Zm0-2c3 0 5-3 5-6 0-3-2-6-5-9-1 4-5 7-5 11 0 2 2 4 5 4Z'),
  gauge: () => `${path('M9 18a15 15 0 0 1 30 0')}${line(24,18,33,12)}${circle(24,18,2)}`,
  tap: () => `${path('M6 15h20v8H15v8H8V20h-2m12-5V9m-5 0h10')}${path('M30 23h10v7h-4c0 5-3 8-7 8')}`,
  cylinder: () => `${path('M14 10c0-5 20-5 20 0v28c0 5-20 5-20 0Z')}${path('M14 10c0 5 20 5 20 0')}${line(19,43,19,46)}${line(29,43,29,46)}`,
  fan: () => `${circle(24,24,3)}${path('M24 21c-2-9 8-12 10-5 1 4-5 7-10 5Zm3 5c9 1 8 11 1 11-4 0-5-7-1-11Zm-6 1c-7 6-14-1-10-7 2-4 9-1 10 7Z')}`,
  pipe: () => `${path('M8 12h18v10h14v14')}${line(35,36,45,36)}`,
  filter: () => `${rect(15,7,18,32,5)}${line(9,13,15,13)}${line(33,13,39,13)}${path('M19 20h10l-3 9h-4Z')}`,
  control: () => `${rect(10,8,28,32,5)}${rect(15,13,18,10,2)}${circle(18,30,2)}${circle(24,30,2)}${circle(30,30,2)}`,
  radiator: () => `${rect(7,12,34,25,3)}${[13,19,25,31,37].map(x => line(x,15,x,34)).join('')}${line(12,37,12,43)}${line(36,37,36,43)}`,
  condensate: () => `${path('M24 6c6 9 10 14 10 21a10 10 0 0 1-20 0c0-7 4-12 10-21Z')}${path('M28 32c-2 2-5 3-8 1')}`,
  electrical: () => path('M27 5 13 27h10l-2 16 14-24H25Z'),
  scaffold: () => `${line(11,5,11,43)}${line(37,5,37,43)}${line(7,15,41,15)}${line(7,30,41,30)}${line(11,5,37,30)}${line(37,5,11,30)}`,
  powerflush: () => `${rect(9,14,30,25,4)}${circle(24,26,8)}${path('M20 26a4 4 0 0 1 7-3m1 3a4 4 0 0 1-7 3')}${line(14,14,14,7)}${line(34,14,34,7)}${circle(14,6,2)}${circle(34,6,2)}${line(15,39,13,45)}${line(33,39,35,45)}`,
  gas: () => `${primitives.pipe()}${path('M13 40c-4 0-6-3-6-6 0-4 3-6 4-10 4 3 7 7 7 11 0 3-2 5-5 5Z')}`
};

function svg(label, body, primitiveNames) {
  return `<svg class="spec-icon" viewBox="0 0 48 48" role="img" aria-label="${esc(label)}" data-primitives="${primitiveNames.join(' ')}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function componentIcon(kind, subtype = '') {
  if (kind === 'boiler') {
    if (!subtype) return svg('boiler type unresolved', `${rect(10,7,28,34,4)}${path('M21 18a4 4 0 1 1 5 4c-2 1-2 2-2 4')}${circle(24,32,1)}`, ['boiler-unresolved']);
    const names = subtype === 'combi' ? ['tap','flame','gauge'] : subtype === 'system' ? ['flame','gauge'] : ['flame'];
    return svg(`${subtype || 'regular'} boiler`, names.map(name => primitives[name]()).join(''), names);
  }
  if (kind === 'flue') {
    if (!subtype) return svg('flue type unresolved', `${circle(19,24,11)}${rect(21,13,22,22,1)}`, ['unresolved-flue']);
    const fanned = subtype === 'fanned';
    const terminal = fanned ? circle(24,24,16) : rect(8,8,32,32,1);
    const body = `${terminal}${fanned ? primitives.fan() : `${line(14,24,34,24)}${line(24,14,24,34)}`}`;
    return svg(`${subtype || 'unresolved'} flue`, body, [fanned ? 'circle-fanned' : subtype === 'balanced' ? 'square-balanced' : 'unresolved-flue']);
  }
  const primitive = primitives[kind] || primitives.pipe;
  return svg(kind, primitive(), [kind]);
}

const definitions = [
  { id:'boiler', label:'Boiler', pattern:/\bboiler\b/i },
  { id:'cylinder', label:'Cylinder', pattern:/\bcylinder\b|stored hot water/i },
  { id:'flue', label:'Flue', pattern:/\bflu(?:e)?\b|terminal|plume/i },
  { id:'control', label:'Controls', pattern:/\bcontrol|thermostat|programmer|hive/i },
  { id:'gas', label:'Gas supply', pattern:/\bgas\b/i },
  { id:'filter', label:'Magnetic filter', pattern:/magnetic filter|fernox|tf1/i },
  { id:'powerflush', label:'Powerflush', pattern:/powerflush|power flush/i },
  { id:'condensate', label:'Condensate', pattern:/condens/i },
  { id:'radiator', label:'Radiators', pattern:/radiator/i },
  { id:'electrical', label:'Electrical supply', pattern:/electrical|electric|consumer unit|fused spur/i },
  { id:'scaffold', label:'Access at height', pattern:/scaffold|working at height|ladder access/i }
];

function actionFor(text) {
  if (/\b(?:no need|does not need|do not need|doesn't need|not required)\b.{0,35}\b(?:replace|upgrade|renew)\b|\b(?:replace|upgrade|renew)\b.{0,35}\b(?:not required|not needed)\b/i.test(text)) return 'Retain';
  if (/\b(?:already done|completed|fitted already)\b/i.test(text)) return 'Already done';
  if (/\b(?:replace|replacement|upgrade|renew)\b/i.test(text)) return 'Replace';
  if (/\b(?:remove|abandon|seal old|take out)\b/i.test(text)) return 'Remove';
  if (/\b(?:new|install|fit|provide)\b/i.test(text)) return 'New';
  if (/\b(?:retain|reuse|use existing|remain|same hole|same position)\b/i.test(text) || /existing.{0,40}(?:acceptable|adequate|suitable)|(?:acceptable|adequate|suitable).{0,40}existing/i.test(text)) return 'Retain';
  return 'Unresolved';
}

function flueAction(text) {
  if (/\b(?:abandon|seal|close).{0,30}(?:old|existing).{0,20}(?:hole|opening)|(?:old|existing).{0,20}(?:hole|opening).{0,30}(?:abandon|seal|close)\b/i.test(text)) return 'Seal old opening';
  if (/\b(?:new hole|new opening|new position)\b/i.test(text)) return 'New hole';
  if (/\b(?:same hole|same opening|existing opening|same position)\b/i.test(text)) return 'Same hole';
  return actionFor(text);
}

function componentAction(kind, text) {
  if (kind === 'flue') return flueAction(text);
  if (kind === 'condensate' && /\b(?:condensate|waste)\s+(?:pipe|route).{0,35}(?:required|needed)|(?:required|needed).{0,35}(?:condensate|waste)\s+(?:pipe|route)\b/i.test(text)) return 'New';
  if (kind === 'powerflush') {
    if (/\b(?:not required|not needed|exclude)\b/i.test(text)) return 'Not required';
    if (/\b(?:required|include|powerflush|power flush)\b/i.test(text)) return 'Include';
  }
  if (kind === 'scaffold' && /\bscaffold.{0,40}(?:required|needed)|(?:required|needed|need to use).{0,40}(?:a\s+)?scaffold\b/i.test(text)) return 'Include';
  return actionFor(text);
}

function typeFor(kind, text) {
  if (kind === 'boiler') return /\bcombi\b/i.test(text) ? 'combi' : /\bsystem boiler\b/i.test(text) ? 'system' : /\bregular boiler\b|open.?vented/i.test(text) ? 'regular' : '';
  if (kind === 'flue') return /\bfanned\b/i.test(text) ? 'fanned' : /\bbalanced\b/i.test(text) ? 'balanced' : '';
  return '';
}

function uniqueFacts(items) {
  const seen = new Set();
  const quotes = [];
  return items.filter(item => {
    const key = item.id || `${item.category || ''}\u0000${item.text || ''}`;
    const quote = String(item.evidenceQuote || item.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key) || (quote.length > 24 && quotes.some(existing => existing.includes(quote) || quote.includes(existing)))) return false;
    seen.add(key);
    if (quote.length > 24) quotes.push(quote);
    return true;
  });
}

function belongsToComponent(kind, item) {
  const text = `${item.category || ''} ${item.text || ''}`;
  const category = String(item.category || '');
  if (kind === 'boiler') return !/gas|condens|flue|access|control|filter/i.test(category) && /\bboiler\b/i.test(text) && (
    /\b(?:replace|install|retain|remove|relocate|move|convert|existing|current|new|system|regular|combi)\b.{0,45}\bboiler\b|\bboiler\b.{0,45}\b(?:replace|install|retain|remove|relocate|move|existing|current|new|system|regular|combi|same (?:place|position|location))\b/i.test(text)
  );
  if (kind === 'gas') return /\bgas\b/i.test(text) && !/same route as (?:the )?gas|follow(?:ing)? (?:the )?(?:same )?gas route/i.test(text);
  if (kind === 'condensate') return /condens|\bwaste (?:pipe|route)\b/i.test(text);
  if (kind === 'filter') return /magnetic filter|fernox|tf1/i.test(text);
  if (kind === 'control') return /\bcontrol|thermostat|programmer|hive/i.test(text);
  if (kind === 'scaffold') return /scaffold|working at height|ladder access/i.test(text);
  return definitions.find(definition => definition.id === kind)?.pattern.test(text) ?? false;
}

export function buildVisualSpecification(interpretation, option) {
  const shared = interpretation?.sharedFacts || [];
  const selected = option?.facts || [];
  return definitions.flatMap(definition => {
    const proposalFacts = selected.filter(item => belongsToComponent(definition.id, item));
    const existingFacts = shared.filter(item => belongsToComponent(definition.id, item));
    const facts = uniqueFacts([...proposalFacts, ...existingFacts]);
    if (!facts.length) return [];
    const proposalText = proposalFacts.map(item => item.text).join(' ');
    const sharedText = existingFacts.map(item => item.text).join(' ');
    const proposalAction = componentAction(definition.id, proposalText);
    const action = proposalAction !== 'Unresolved' ? proposalAction : componentAction(definition.id, sharedText);
    const proposalSubtype = typeFor(definition.id, proposalText);
    return [{ component: definition.id, label: definition.label, subtype: proposalSubtype || typeFor(definition.id, sharedText), typeRequired: ['boiler', 'flue'].includes(definition.id), action, facts, proposalId: option?.id || null }];
  });
}
