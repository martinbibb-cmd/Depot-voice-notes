import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/system-boiler-combi.json' with { type: 'json' };
import { buildCustomerIntent, customerIntentLabel } from '../js/customerIntent.js';
import { auditPipelineOutput, buildDepotSections, buildHandoverDocuments } from '../js/pipelineInvariants.js';

test('customer wants remain distinct from evidence-derived installation needs', () => {
  const customerIntent = buildCustomerIntent(fixture);
  assert.equal(customerIntent.wants.length, 1);
  assert.match(customerIntent.wants[0].text, /gain cupboard or loft space/i);
  assert.equal(customerIntent.wants[0].intentOrigin, 'customerStated');
  assert(customerIntent.needs.every(item => item.intentType === 'need'));
  assert(customerIntent.needs.some(item => item.intentOrigin === 'derivedFromEvidence'));
  assert(customerIntent.needs.every(item => item.supportingFactIds.length > 0));
  assert(customerIntent.needs.every(item => item.supportingEvidenceQuotes.length > 0));
  assert.match(customerIntent.needs.map(item => item.text).join(' '), /restore.*heating and hot-water/i);
  assert.match(customerIntent.needs.map(item => item.text).join(' '), /bath and shower use/i);
  assert.match(customerIntent.needs.map(item => item.text).join(' '), /incoming-water performance/i);
  assert.match(customerIntent.needs.map(item => item.text).join(' '), /combi performance unsupported/i);
  assert.equal(customerIntentLabel(customerIntent.needs[0]), 'DERIVED REQUIREMENT');
});

test('ordinary technical evidence is not automatically promoted to a customer need', () => {
  const customerIntent = buildCustomerIntent({
    sharedFacts: [{ id: 'gas', category: 'Gas supply', text: '22 mm gas pipe measured.', evidenceQuote: '22 mm gas pipe measured.', evidenceSource: 'capturedEvidence' }],
    options: [], rejectedAlternatives: []
  });
  assert.deepEqual(customerIntent, { wants: [], needs: [] });
});

test('confirmed canonical needs cannot produce a false-empty Needs output', () => {
  const customerIntent = buildCustomerIntent(fixture);
  const confirmed = [...customerIntent.wants, ...customerIntent.needs].map(item => ({ ...item, targetSection: 'Needs' }));
  const depot = buildDepotSections(confirmed);
  const handover = buildHandoverDocuments({ confirmedChecklistItems: confirmed, uncertainties: [] });
  assert.doesNotMatch(depot.find(section => section.section === 'Needs').plainText, /No information recorded/i);
  assert.match(handover.customer.find(section => section.heading === 'Why this suits your home').text, /incoming-water performance/i);
  assert.deepEqual(auditPipelineOutput({ confirmedItems: confirmed, depotSections: depot, handover }), []);
});

test('a grounded candidate need remains visibly provisional rather than becoming an empty section', () => {
  const candidate = {
    id: 'candidate', text: 'The exact required hot-water performance remains to be confirmed.',
    intentType: 'need', intentOrigin: 'provisional', evidenceState: 'uncertain',
    evidenceQuote: 'we need to confirm the hot water performance', evidenceSource: 'transcript',
    supportingFactIds: ['source'], supportingEvidenceQuotes: ['we need to confirm the hot water performance']
  };
  assert.equal(customerIntentLabel(candidate), 'PROVISIONAL NEED');
});
