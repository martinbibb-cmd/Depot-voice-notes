import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPipelineOutput, buildDepotSections, buildHandoverDocuments, claimIntegrityErrors } from '../js/pipelineInvariants.js';

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

test('claim checks reject numeric drift, certainty promotion and lost negation', () => {
  assert(claimIntegrityErrors({ text: 'Flow is 13 L/min.', evidenceQuote: 'Flow was about 10 L/min.' }).some(x => /numeric/.test(x)));
  assert(claimIntegrityErrors({ text: 'Flow is 10 L/min.', evidenceQuote: 'Flow was about 10 L/min.' }).some(x => /uncertainty/.test(x)));
  assert(claimIntegrityErrors({ text: 'Asbestos was observed.', evidenceQuote: 'No visual indication of asbestos was observed.' }).some(x => /negation/.test(x)));
  assert.deepEqual(claimIntegrityErrors({ text: '22 mm gas pipe recorded.', evidenceQuote: '22mm gas pipe' }), []);
});

test('unresolved evidence remains explicit and customer intent survives an incompatible selected proposal', () => {
  const facts = [
    fact('want', 'Customer wants to remove stored-water equipment to gain space.', 'Needs'),
    fact('selected', 'Install a like-for-like system boiler and retain stored hot water.', 'New boiler and controls')
  ];
  const uncertainty = fact('u1', 'Exact recognised component name remains uncertain.', 'Office notes', { evidenceState: 'uncertain' });
  const handover = buildHandoverDocuments({ confirmedChecklistItems: facts, uncertainties: [uncertainty] });
  assert.match(handover.customer.find(x => x.heading === 'Why this suits your home').text, /does not imply that every original objective is achieved/);
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
