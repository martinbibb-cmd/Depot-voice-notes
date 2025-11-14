import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/worker.js';

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
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
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
      JSON.stringify({ choices: [{ message: { content } }] }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const requestBody = {
    transcript,
    alreadyCaptured: [{ section: 'Needs', plainText: 'Existing note' }],
    expectedSections: ['Needs', 'New boiler and controls'],
    sectionHints: { hive: 'New boiler and controls' },
    forceStructured: true,
    checklistItems: [],
    depotSections: []
  };

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);

  assert.deepEqual(body.sections, [
    {
      section: 'New boiler and controls',
      plainText: 'Replace with Worcester 15Ri',
      naturalLanguage: 'We will replace the boiler and fit Hive.'
    }
  ]);
  assert.deepEqual(body.materials, []);
  assert.deepEqual(body.checkedItems, []);
  assert.deepEqual(body.missingInfo, []);
  assert.equal(body.customerSummary, '');

  assert(receivedRequestBody, 'expected OpenAI request body');
  assert.equal(receivedRequestBody.model, 'gpt-4.1');
  assert(Array.isArray(receivedRequestBody.messages));
  const userMessage = receivedRequestBody.messages?.[1]?.content;
  assert(userMessage, 'expected user payload to be sent');
  const parsedUser = JSON.parse(userMessage);
  assert.equal(parsedUser.transcript, transcript);
  assert.deepEqual(parsedUser.alreadyCaptured, [{
    section: 'Needs',
    plainText: 'Existing note',
    naturalLanguage: ''
  }]);
  assert.deepEqual(parsedUser.expectedSections, ['Needs', 'New boiler and controls']);
  assert.equal(parsedUser.sectionHints.hive, 'New boiler and controls');
  assert.equal(parsedUser.forceStructured, true);
});

test('POST /text surfaces OpenAI errors as model_error 5xx', async (t) => {
  globalThis.fetch = async () => new Response('failure', { status: 500 });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript: 'Something went wrong.' })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 500);
  const body = await parseJson(response);
  assert.equal(body.error, 'model_error');
  assert.match(body.message, /chat\.completions 500/);
});

