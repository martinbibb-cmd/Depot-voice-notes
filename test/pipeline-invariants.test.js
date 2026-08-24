import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPipelineOutput, buildDepotSections, buildHandoverDocuments, claimIntegrityErrors, displayIntegrityErrors, displayTextForFact } from '../js/pipelineInvariants.js';

const fact = (id, text, section, extra = {}) => ({ id, text, evidenceQuote: text, targetSection: section, ...extra });

test('every confirmed fact reaches Depot and engineer output without false empty sections', () => {
  const facts = [
    fact('want', 'Customer wants cupboard space released.', 'Needs'),
    fact('flue', 'Flue requires external access and scaffold because normal ladder access is prevented by the sloping garden.', 'Flue'),
    fact('gas', 'Existing 22 mm gas supply is acceptable for the selected system-boiler replacement.', 'Pipe work'),
    fact('prep', 'Customer agreed to clear the boiler cupboard.', 'Customer actions')
  ];
  const depot = buildDepotSections(facts);
  const handover = buildHandoverDocuments({ confirmedChecklistItems: facts });
  assert.deepEqual(auditPipelineOutput({ confirmedItems: facts, depotSections: depot, handover }), []);
  assert(!depot.find(x => x.section === 'Flue').plainText.includes('No information recorded'));
  assert(!handover.engineer.find(x => x.heading === 'Gas supply').bullets.includes('No information recorded.'));
});

test('delivery is retained as a fixed Depot section and grounded delivery evidence maps to it', () => {
  const delivery = fact('delivery', 'Materials can be unloaded on the driveway beside the side access.', 'Office notes', { category:'Delivery access' });
  const sections = buildDepotSections([delivery]);
  const output = sections.find(section => section.section === 'Delivery notes');
  assert(output);
  assert.match(output.plainText, /unloaded on the driveway/i);
  assert(!output.plainText.includes('No information recorded'));
});

test('duplicate confirmed wording renders once without losing either provenance id', () => {
  const facts = [
    fact('structured', 'Retain existing gas supply.', 'Pipe work'),
    fact('approved', 'Retain existing gas supply.', 'Pipe work')
  ];
  const section = buildDepotSections(facts).find(item => item.factIds.includes('structured'));
  assert.equal(section.naturalLanguage.match(/Retain existing gas supply\./g)?.length, 1);
  assert.deepEqual(section.factIds, ['structured','approved']);
});

test('ladder and scaffold evidence are access restrictions rather than detached equipment notes', () => {
  const sections = buildDepotSections([
    fact('ladder', 'Ladder access is required for the proposed work at height.', 'Office notes'),
    fact('scaffold', 'Scaffold access is required for the proposed work at height.', 'Office notes')
  ]);
  const restrictions = sections.find(item => item.section === 'Restrictions to work');
  assert.deepEqual(restrictions.factIds, ['ladder','scaffold']);
});

test('claim checks reject numeric drift, certainty promotion and lost negation', () => {
  assert(claimIntegrityErrors({ text: 'Flow is 13 L/min.', evidenceQuote: 'Flow was about 10 L/min.' }).some(x => /numeric/.test(x)));
  assert(claimIntegrityErrors({ text: 'Flow is 10 L/min.', evidenceQuote: 'Flow was about 10 L/min.' }).some(x => /uncertainty/.test(x)));
  assert(claimIntegrityErrors({ text: 'Asbestos was observed.', evidenceQuote: 'No visual indication of asbestos was observed.' }).some(x => /negation/.test(x)));
  assert.deepEqual(claimIntegrityErrors({ text: '22 mm gas pipe recorded.', evidenceQuote: '22mm gas pipe' }), []);
});

test('an explicit surveyor numeric correction is valid without pretending it came from the transcript', () => {
  const corrected = { text: 'Existing gas supply is 15 mm.', evidenceQuote: 'gas supply discussed', manual: true, evidenceSource: 'surveyorVisualCorrection', evidenceState: 'surveyorConfirmed' };
  assert.deepEqual(claimIntegrityErrors(corrected), []);
  assert(claimIntegrityErrors({ ...corrected, manual: false }).some(error => /numeric/.test(error)));
});

test('presentation wording is professional while immutable grounding remains separate', () => {
  const filter = fact('filter', 'We will also fit a magnetic filter to keep the system clean so that advised that next to the boiler and filter any dirt clutch as it created', 'Pipe work', { category:'filter' });
  assert.equal(displayTextForFact(filter), 'Install a magnetic filter.');
  assert.equal(filter.evidenceQuote, filter.text);
  assert.deepEqual(displayIntegrityErrors({ category:'filter', canonicalMeaning:filter.text, displayText:'Install a magnetic filter.' }), []);
  assert(displayIntegrityErrors({ category:'filter', canonicalMeaning:filter.text, displayText:'Install a 22 mm magnetic filter.' }).some(error => /numeric/.test(error)));
});

test('boiler proposal and condensate route populate their semantic engineer sections', () => {
  const facts = [
    fact('boiler','Replace the existing system boiler with a new system boiler in the same location.','System characteristics',{category:'proposal'}),
    fact('condensate','my suggestion for that would be to take it through the same route as the gas supply currently goes into that little outbuilding down and out the front','System characteristics',{category:'condensate pipe'})
  ];
  const handover = buildHandoverDocuments({ confirmedChecklistItems:facts });
  assert.match(handover.engineer.find(section => section.heading === 'Boiler and equipment').bullets.join(' '), /Replace the existing system boiler/);
  assert.match(handover.engineer.find(section => section.heading === 'Condensate and discharge').bullets.join(' '), /Route the condensate/i);
  assert(!handover.engineer.find(section => section.heading === 'Boiler and equipment').bullets.includes('No information recorded.'));
  assert.deepEqual(auditPipelineOutput({ confirmedItems:facts, depotSections:buildDepotSections(facts), handover }), []);
  assert.equal(handover.evidence.find(item => item.id === 'condensate').sourceQuote, facts[1].evidenceQuote);
  assert.match(handover.evidence.find(item => item.id === 'condensate').displayText, /Route the condensate/i);
});

test('unresolved evidence remains explicit and customer intent survives an incompatible selected proposal', () => {
  const facts = [
    fact('want', 'Customer wants to remove stored-water equipment to gain space.', 'Needs'),
    fact('selected', 'Install a like-for-like system boiler and retain stored hot water.', 'New boiler and controls')
  ];
  const uncertainty = fact('u1', 'Exact recognised component name remains uncertain.', 'Office notes', { evidenceState: 'uncertain' });
  const handover = buildHandoverDocuments({ confirmedChecklistItems: facts, uncertainties: [uncertainty] });
  assert.match(handover.customer.find(x => x.heading === 'Why this suits your home').text, /original space-saving objective is not fully achieved/);
  assert.deepEqual(handover.engineer.find(x => x.heading === 'Unresolved points').bullets, [uncertainty.text]);
});

test('deterministic regeneration is byte-stable and keeps conflicting proposals isolated', () => {
  const shared = [fact('shared', 'Customer wants quieter operation near the bedroom.', 'Needs')];
  const combi = fact('combi', 'Upgrade gas supply for the combi option.', 'Pipe work');
  const system = fact('system', 'Retain existing gas supply for the system-boiler option.', 'Pipe work');
  const one = JSON.stringify(buildHandoverDocuments({ confirmedChecklistItems: [...shared, combi] }));
  const two = JSON.stringify(buildHandoverDocuments({ confirmedChecklistItems: [...shared, combi] }));
  const alternative = JSON.stringify(buildHandoverDocuments({ confirmedChecklistItems: [...shared, system] }));
  assert.equal(one, two);
  assert(!one.includes(system.text));
  assert(!alternative.includes(combi.text));
});

test('uncertain Whisper terminology cannot enter an asserted fact', () => {
  const errors = claimIntegrityErrors({ text: 'Fit a Valor valve.', evidenceQuote: 'There was a Valor or something, I am not sure.' });
  assert(errors.some(x => /uncertainty/.test(x)));
});

test('generation fails contradictory selected gas or boiler scope', () => {
  const gas = [fact('g1', 'Install a new gas supply for this option.', 'Pipe work'), fact('g2', 'Retain existing gas supply for this option.', 'Pipe work')];
  const handover = buildHandoverDocuments({ confirmedChecklistItems: gas });
  assert(auditPipelineOutput({ confirmedItems: gas, depotSections: buildDepotSections(gas), handover }).some(x => x.code === 'contradictory_selected_scope'));
  const boilers = [fact('b1', 'Install combi boiler.', 'New boiler and controls'), fact('b2', 'Install system boiler.', 'New boiler and controls')];
  assert(auditPipelineOutput({ confirmedItems: boilers, depotSections: buildDepotSections(boilers), handover: buildHandoverDocuments({ confirmedChecklistItems: boilers }) }).some(x => x.subject === 'boiler type'));
});

test('new condensate beside retained gas is not a gas-scope contradiction', () => {
  const facts = [
    fact('gas', 'Retain Gas.', 'Pipe work', { category:'Gas supply' }),
    fact('condensate', 'Install new condensate.', 'Pipe work', { category:'Condensate' })
  ];
  const handover = buildHandoverDocuments({ confirmedChecklistItems:facts });
  const errors = auditPipelineOutput({ confirmedItems:facts, depotSections:buildDepotSections(facts), handover });
  assert(!errors.some(error => error.code === 'contradictory_selected_scope' && error.subject === 'gas supply'));
});

test('customer handover relates confirmed priorities to the selected recommendation', () => {
  const handover = buildHandoverDocuments({
    selectedProposal:{ id:'system-option', name:'System boiler replacement' },
    customerContext:[{
      id:'space-priority', topic:'spaceAppearance', priority:'mostImportant', confirmed:true,
      text:'Gain cupboard space by removing the hot-water cylinder.'
    }],
    customerAdvisories:[{
      id:'system-option:customer_priority_tradeoff', flagType:'customer_priority_tradeoff',
      heading:'How this option matches your priorities', class:'advisory',
      text:'This option does not fully achieve the stated space-saving aim because the stored-hot-water equipment is retained.',
      support:{ customerFactIds:['customer:space-priority'], existingFactIds:[], measurementIds:[], proposedComponentIds:['proposal:system-option:cylinder'] }
    }]
  });
  const relationship = handover.customer.find(section => section.heading === 'How the recommendation relates to your priorities');
  assert.match(relationship.text, /Most important: Gain cupboard space/);
  assert.match(relationship.text, /does not fully achieve/i);
  assert.equal(relationship.proposalOptionId, 'system-option');
  assert.deepEqual(relationship.customerIds, ['space-priority']);
  assert(!handover.customer.some(section => section.heading === 'How this option matches your priorities'));
});

test('handover does not claim an unsupported priority is met', () => {
  const handover = buildHandoverDocuments({
    selectedProposal:{ id:'option-1' },
    customerContext:[{
      id:'budget', topic:'budget', priority:'important', confirmed:true,
      text:'Best long-term value is important.'
    }],
    customerAdvisories:[]
  });
  const relationship = handover.customer.find(section => section.heading === 'How the recommendation relates to your priorities');
  assert.match(relationship.text, /does not yet contain enough structured information/i);
  assert.doesNotMatch(relationship.text, /meets|satisfies/i);
});

test('recommendation relationship contains only the supplied selected-option advisory', () => {
  const handover = buildHandoverDocuments({
    selectedProposal:{ id:'system-option' },
    customerContext:[{ id:'space', topic:'spaceAppearance', priority:'important', confirmed:true, text:'Gain cupboard space.' }],
    customerAdvisories:[{
      id:'system-option:tradeoff', flagType:'customer_priority_tradeoff', heading:'How this option matches your priorities',
      text:'The cylinder is retained for this option.', support:{ customerFactIds:['customer:space'] }
    }]
  });
  const text = handover.customer.find(section => section.heading === 'How the recommendation relates to your priorities').text;
  assert.match(text, /cylinder is retained/i);
  assert.doesNotMatch(text, /cylinder is removed/i);
});

test('customer hot-water use is related to measured recommendation advice without repetition', () => {
  const advisory = {
    id:'combi:outlet-mismatch', flagType:'combi_multi_outlet_mismatch', heading:'Things to be aware of',
    text:'The recorded water performance supports one hot-water outlet at a time, which may not meet the confirmed simultaneous-use requirement.',
    support:{ customerFactIds:['customer:simultaneous'], measurementIds:['measurement:flow','measurement:dynamic'] }
  };
  const handover = buildHandoverDocuments({
    selectedProposal:{ id:'combi' },
    customerContext:[{ id:'simultaneous', topic:'hotWater', priority:'mostImportant', confirmed:true, text:'Two hot-water outlets are sometimes used together.' }],
    customerAdvisories:[advisory]
  });
  const relationship = handover.customer.find(section => section.heading === 'How the recommendation relates to your priorities');
  assert.match(relationship.text, /one hot-water outlet at a time/i);
  assert.equal(handover.customer.flatMap(section => section.advisoryIds || []).filter(id => id === advisory.id).length, 1);
  assert(!handover.customer.some(section => section.heading === 'Things to be aware of'));
});
