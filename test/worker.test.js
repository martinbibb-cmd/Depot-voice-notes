import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/worker.js';
import depotSchema from '../depot.output.schema.json' with { type: 'json' };
import checklistConfig from '../checklist.config.json' with { type: 'json' };

function extractDefaultSections(schema) {
  if (schema && typeof schema === 'object' && Array.isArray(schema.sections)) {
    return schema.sections;
  }
  return Array.isArray(schema) ? schema : [];
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error?.message || error}\n${text}`);
  }
}

const originalFetch = globalThis.fetch;

test('POST /interpret separates shared evidence, independent options, history and uncertainty', async (t) => {
  const transcript = 'Standing pressure is 2.5 bar. Option one retains the combi. Option two uses a system boiler and accumulator. The old system was powerflushed. The hand flute term is unclear.';
  let modelInput;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const combined = request.contents[0].parts[0].text;
    modelInput = JSON.parse(combined.slice(combined.lastIndexOf('\n\n') + 2));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      sharedFacts: [{ category: 'Water test', text: 'Standing pressure is 2.5 bar.' }],
      options: [
        { title: 'Retain combi', status: 'preferred', facts: [{ category: 'Boiler', text: 'Retain the combi.' }] },
        { title: 'System boiler', status: 'viable', facts: [{ category: 'Boiler', text: 'Use a system boiler and accumulator.' }] }
      ],
      rejectedAlternatives: [],
      uncertainties: [{ text: 'hand flute', context: 'Unclear recognised component term.' }],
      historicalFacts: [{ category: 'System history', text: 'The old system was powerflushed.' }]
    }) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request('https://example.com/interpret', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript, capturedEvidence: '[WATER PRESSURE AND FLOW]\n- Garden tap — standing 2.5 bar' })
  }), { GEMINI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);
  assert.deepEqual(body.options.map(option => option.id), ['option-1', 'option-2']);
  assert.equal(body.options[0].facts[0].text, 'Retain the combi.');
  assert.equal(body.options[1].facts[0].text, 'Use a system boiler and accumulator.');
  assert.equal(body.historicalFacts[0].text, 'The old system was powerflushed.');
  assert.equal(body.uncertainties[0].text, 'hand flute');
  assert.equal(modelInput.transcript, transcript);
  assert.match(modelInput.capturedEvidence, /Garden tap/);
});

test('POST /confirmation-checklist keeps only transcript-grounded proposed facts', async (t) => {
  let combinedText = '';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); combinedText = request.contents[0].parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [
      { description: 'Flue rises vertically then exits horizontally above the lintel.', evidenceQuote: 'rise vertically above the lintel then exit horizontally', evidenceSource: 'transcript', targetSection: 'Flue' },
      { description: 'Lift every floor in the house.', evidenceQuote: 'lift every floor in the house', evidenceSource: 'transcript', targetSection: 'Disruption' }
    ] }) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const interpretation = { sharedFacts: [{ category: 'Access', text: 'Boiler boxing is removable.' }] };
  const proposal = { id: 'option-1', facts: [{ category: 'Pipe route', text: 'Route behind boiler and above window.' }] };
  const transcript = 'The flue will rise vertically above the lintel then exit horizontally through the wall.';
  const response = await worker.fetch(new Request('https://example.com/confirmation-checklist', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ interpretation, proposal, transcript, capturedEvidence: '' })
  }), { GEMINI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);
  assert.equal(body.items.length, 1);
  assert(body.items.every(item => item.checked === false));
  assert(body.items.every(item => item.manual === false));
  assert.equal(body.items[0].targetSection, 'Flue');
  assert.match(body.items[0].evidenceRelation, /rise vertically/);
  assert.match(combinedText, /hallucination guardrail/);
  assert.match(combinedText, /above window/);
});

test('POST /handover-documents creates friendly customer prose and ordered engineer bullets', async (t) => {
  let combinedText = '';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); combinedText = request.contents[0].parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      customer: [
        { heading: 'What we are proposing', text: 'We are proposing a replacement boiler in the existing position.' },
        { heading: 'Why this suits your home', text: 'This keeps the installation compact while improving the recorded heating problem.' },
        { heading: 'Getting ready', text: 'Please clear the confirmed access area before the engineer arrives.' }
      ],
      engineer: [
        { heading: 'Job overview', bullets: ['Replace boiler in existing position.', 'Use recorded controls.', 'Route flue above lintel.', 'Remove confirmed boxing.', 'This fifth overview point must be dropped.'] },
        { heading: 'Flue', bullets: ['Route flue vertically above lintel then horizontally through wall.'] },
        { heading: 'Heating, hot water and pipe routes', bullets: ['Route new heating pipes behind boiler and above window.'] },
        { heading: 'Access and enabling work', bullets: ['Remove and refit confirmed removable boxing.', 'Make good where required.'] }
      ]
    }) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await worker.fetch(new Request('https://example.com/handover-documents', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      sharedFacts: [{ category: 'Customer need', text: 'Improve heating circulation.' }],
      selectedProposal: { id: 'option-1', facts: [{ category: 'Boiler', text: 'Replace boiler in existing position.' }] },
      confirmedChecklistItems: [
        { text: 'Remove and refit removable boxing.', targetSection: 'Restrictions to work' },
        { text: 'Clear confirmed access area.', targetSection: 'Customer actions' }
      ],
      uncertainties: []
    })
  }), { GEMINI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);
  assert.deepEqual(body.customer.map(section => section.heading), [
    'What we are proposing', 'Why this suits your home', 'What to expect during the work', 'Getting ready', 'Points still to confirm'
  ]);
  assert.deepEqual(body.engineer.map(section => section.heading), [
    'Job overview', 'Existing system', 'Boiler and equipment', 'Flue', 'Condensate and discharge', 'Gas supply',
    'Heating, hot water and pipe routes', 'Controls and electrical', 'Access and enabling work',
    'Disruption and customer arrangements', 'Unresolved points'
  ]);
  assert.equal(body.engineer.find(section => section.heading === 'Heating, hot water and pipe routes').bullets[0], 'Route new heating pipes behind boiler and above window.');
  assert.deepEqual(body.engineer.find(section => section.heading === 'Condensate and discharge').bullets, ['No information recorded.']);
  assert.equal(body.engineer.find(section => section.heading === 'Job overview').bullets.length, 4);
  assert(!body.engineer.flatMap(section => section.bullets).includes('Make good where required.'));
  assert.equal(body.customer.find(section => section.heading === 'What to expect during the work').text, 'No specific job disruption has been confirmed.');
  assert.equal(body.customer.find(section => section.heading === 'Points still to confirm').text, 'No unresolved points are currently recorded.');
  assert.match(combinedText, /not the Depot\/British Gas section schema/);
  assert.match(combinedText, /Remove and refit removable boxing/);
});

test('POST /text forwards structured payload and normalises model output', async (t) => {
  const transcript = 'Replace existing boiler and mention Hive smart control.';
  let receivedRequestBody;

  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-1\.5-pro:generateContent\?key=/);
    receivedRequestBody = JSON.parse(options.body);
    const content = JSON.stringify({
      sections: [
        {
          section: 'New boiler and controls',
          plainText: 'Replace with Worcester 15Ri',
          naturalLanguage: 'We will replace the boiler and fit Hive.'
        }
      ],
      materials: null,
      checkedItems: null,
      missingInfo: null,
      customerSummary: 0
    });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const defaultSections = extractDefaultSections(depotSchema);
  const requestBody = {
    transcript,
    alreadyCaptured: [{ section: 'Needs', plainText: 'Existing note' }],
    expectedSections: ['Needs', 'New boiler and controls'],
    sectionHints: { hive: 'New boiler and controls' },
    forceStructured: true,
    checklistItems: [],
    deterministicScope: {
      selectedItems: [{
        id: 'gas_supply_scope',
        label: 'Gas supply',
        outcomeId: 'retain_22mm',
        outcomeLabel: 'Retain 22 mm',
        section: 'Gas'
      }],
      sections: [{ section: 'Gas', plainText: 'Retain existing 22 mm gas supply;', naturalLanguage: '' }],
      materials: [],
      tags: ['gas:retain']
    },
    depotSections: defaultSections
  };

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  const response = await worker.fetch(request, { GEMINI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);

  const expectedSectionOrder = defaultSections.map((entry) => entry.name);
  const expectedSections = expectedSectionOrder.map((name) => {
    if (name === 'New boiler and controls') {
      return {
        section: name,
        plainText: '# Involved #; Replace with Worcester 15Ri;',
        naturalLanguage: '# Involved #\n- Replace with Worcester 15Ri'
      };
    }
    return {
      section: name,
      plainText: '',
      naturalLanguage: ''
    };
  });

  assert.deepEqual(body.sections, expectedSections);
  assert.deepEqual(body.materials, []);
  assert.deepEqual(body.checkedItems, []);
  assert.deepEqual(body.missingInfo, []);
  assert.equal('customerSummary' in body, false);

  assert(receivedRequestBody, 'expected Gemini request body');
  assert(Array.isArray(receivedRequestBody.contents));
  const combinedText = receivedRequestBody.contents?.[0]?.parts?.[0]?.text;
  assert(combinedText, 'expected combined content to be sent');
  const userPayloadStart = combinedText.lastIndexOf('\n\n');
  assert(userPayloadStart >= 0, 'expected separator between system and user content');
  const parsedUser = JSON.parse(combinedText.slice(userPayloadStart + 2));
  assert.equal(parsedUser.transcript, transcript);
  assert.deepEqual(parsedUser.alreadyCaptured, [{
    section: 'Needs',
    plainText: 'Existing note',
    naturalLanguage: ''
  }]);
  assert.deepEqual(parsedUser.expectedSections, expectedSectionOrder);
  assert.equal(parsedUser.sectionHints.hive, 'New boiler and controls');
  assert.equal(parsedUser.forceStructured, true);
  assert.deepEqual(parsedUser.deterministicScope.sections, [{
    section: 'Gas',
    plainText: 'Retain existing 22 mm gas supply;',
    naturalLanguage: ''
  }]);
  assert.match(
    combinedText,
    /deterministicScope contains facts selected by the surveyor in the checklist/
  );
  assert.match(
    combinedText,
    /Do not ask for make, model, serial number, dimensions, or product preference unless it is necessary to resolve a contradiction/
  );
  const expectedChecklistIds = (checklistConfig.items || [])
    .map((item) => item && item.id)
    .filter(Boolean);
  assert.deepEqual(
    parsedUser.checklistItems.map((item) => item.id),
    expectedChecklistIds,
    'expected default checklist items to be forwarded'
  );
});

test('POST /text surfaces Gemini errors as model_error 5xx', async (t) => {
  globalThis.fetch = async () => new Response('failure', { status: 500 });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: 'Something went wrong.' })
  });

  const response = await worker.fetch(request, { GEMINI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 500);
  const body = await parseJson(response);
  assert.equal(body.error, 'model_error');
  assert.match(body.message, /gemini\.generateContent 500/);
});

test('POST /text removes absence notes and keeps headed bullets', async (t) => {
  globalThis.fetch = async () => {
    const content = JSON.stringify({
      sections: [
        {
          section: 'Flue',
          plainText: 'No mention of flue route; # Involved #; Route new flue through loft and out gable;',
          naturalLanguage: ''
        },
        {
          section: 'Future plans',
          plainText: 'No future plans mentioned.',
          naturalLanguage: ''
        }
      ],
      materials: [],
      checkedItems: [],
      missingInfo: [],
      customerSummary: 'Should be removed'
    });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: 'Route new flue through loft and out gable.' })
  });

  const response = await worker.fetch(request, { GEMINI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);

  const flue = body.sections.find((section) => section.section === 'Flue');
  const future = body.sections.find((section) => section.section === 'Future plans');
  assert.equal(flue.plainText, '# Involved #; Route new flue through loft and out gable;');
  assert.equal(flue.naturalLanguage, '# Involved #\n- Route new flue through loft and out gable');
  assert.equal(future.plainText, '');
  assert.equal(future.naturalLanguage, '');
  assert.equal('customerSummary' in body, false);
});
