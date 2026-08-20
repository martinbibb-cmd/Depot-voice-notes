import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const originalFetch = globalThis.fetch;

test('transcript evidence reaches the model without silent terminology or measurement changes', async (t) => {
  const source = 'Discussed Valiant but chose Worcester. Flue rises vertical above lintel. Condensate clearance is 150mm. Pump sounded like impala.';
  let forwarded = '';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const content = body.messages?.[1]?.content || body.contents?.[0]?.parts?.[0]?.text || '';
    const jsonStart = content.lastIndexOf('\n\n');
    forwarded = JSON.parse(jsonStart >= 0 ? content.slice(jsonStart + 2) : content).transcript;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      sections: [{ section: 'Needs', plainText: 'Test;', naturalLanguage: '- Test' }], materials: [], checkedItems: [], missingInfo: []
    }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await worker.fetch(new Request('https://example.com/text', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transcript: source })
  }), { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  assert.equal(forwarded, source);
});
