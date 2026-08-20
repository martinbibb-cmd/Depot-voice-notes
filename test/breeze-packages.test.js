import test from 'node:test';
import assert from 'node:assert/strict';
import { inferredPrimaryRequirement, pipeRequirement, suggestPackage } from '../js/breezePackages.js';

test('adds every drawn pipe run and applies flow-return multiplier before rounding', () => {
  const result = pipeRequirement([
    { service: 'primaryFlowReturn', segmentLengthsMetres: [4.3], manualCorrectionMetres: 0 },
    { service: 'gas', segmentLengthsMetres: [3.1], manualCorrectionMetres: 0 }
  ]);
  assert.equal(result.runs[0].roundedMetres, 10);
  assert.equal(result.totalRoundedMetres, 14);
  assert.equal(result.totalSaleLengths, 7);
});

test('uses recorded ten metre primary crossing when no drawn primary route exists', () => {
  const result = inferredPrimaryRequirement({ facts: [{ text: 'The primaries need to cross the 10 m wide house.' }] }, []);
  assert.equal(result.physicalMetres, 10);
  assert.equal(result.roundedMetres, 20);
  assert.equal(result.saleLengths, 10);
});

test('does not count a spoken primary estimate again when a primary route was drawn', () => {
  assert.equal(inferredPrimaryRequirement({ facts: [{ text: 'Primaries cross 10 m.' }] }, [{ service: 'primaryFlowReturn' }]), null);
});

test('suggests matching package from proposal and reports additional sale lengths', () => {
  const result = suggestPackage({ title: 'Regular boiler replacement', facts: [{ text: 'Install system boiler in the existing position.' }] }, 10);
  assert.equal(result.id, 'conv-same');
  assert.equal(result.possibleAdditionalSaleLengths, 8);
});
