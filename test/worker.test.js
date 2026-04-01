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
        plainText: 'Replace with Worcester 15Ri',
        naturalLanguage: 'We will replace the boiler and fit Hive.'
      };
    }
    return {
      section: name,
      plainText: '• No additional notes;',
      naturalLanguage: 'No additional notes.'
    };
  });

  assert.deepEqual(body.sections, expectedSections);
  assert.deepEqual(body.materials, []);
  assert.deepEqual(body.checkedItems, []);
  assert.deepEqual(body.missingInfo, []);
  assert.equal(body.customerSummary, '');

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

