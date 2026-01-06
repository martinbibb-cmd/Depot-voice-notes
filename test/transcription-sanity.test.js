import test from 'node:test';
import assert from 'node:assert/strict';

// Import the worker to access the transcription sanity check function
// Since the function is not exported, we'll test it through the /text endpoint
import worker from '../src/worker.js';

const originalFetch = globalThis.fetch;

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error?.message || error}\n${text}`);
  }
}

function createMockAIResponse(transcript) {
  return JSON.stringify({
    sections: [
      {
        section: 'Needs',
        plainText: 'Test notes',
        naturalLanguage: 'Test description'
      }
    ],
    materials: [],
    checkedItems: [],
    missingInfo: [],
    customerSummary: 'Test summary'
  });
}

test('Heating vocabulary: corrects "flu" to "flue"', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'The flu needs to be extended to the external wall.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('flue'), `Expected "flue" in transcript, got: ${capturedTranscript}`);
  assert(!capturedTranscript.includes('flu '), `Should not contain "flu " in: ${capturedTranscript}`);
});

test('Heating vocabulary: does not change "flu" when followed by "jab"', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Customer mentioned they had their flu jab yesterday.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('flu jab'), `Expected "flu jab" to remain, got: ${capturedTranscript}`);
});

test('Heating vocabulary: corrects TRV variations', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Install tee are vee valves on all radiators and also add T R V controls.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  const trvCount = (capturedTranscript.match(/TRV/g) || []).length;
  assert(trvCount >= 2, `Expected at least 2 occurrences of "TRV", got ${trvCount} in: ${capturedTranscript}`);
});

test('Heating vocabulary: corrects combi boiler variations', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Replace old con bee with a new combination boiler.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  const combiCount = (capturedTranscript.match(/combi/gi) || []).length;
  assert(combiCount >= 2, `Expected "combi" to appear at least twice, got: ${capturedTranscript}`);
});

test('Heating vocabulary: corrects brand names', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Install Worchester boiler with Ferox TF1 filter and Valiant controls.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('Worcester'), `Expected "Worcester" in: ${capturedTranscript}`);
  assert(capturedTranscript.includes('Fernox'), `Expected "Fernox" in: ${capturedTranscript}`);
  assert(capturedTranscript.includes('Vaillant'), `Expected "Vaillant" in: ${capturedTranscript}`);
});

test('kW corrections: fixes "4030" to "30kW"', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'The boiler is rated at 4030 which should be adequate.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('30kW'), `Expected "30kW" in: ${capturedTranscript}`);
  assert(!capturedTranscript.includes('4030'), `Should not contain "4030" in: ${capturedTranscript}`);
});

test('kW corrections: normalizes "30 kw" to "30kW"', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Install a 24 kw boiler or maybe 30 kay would be better. The current one is 18 kilowatts.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('24kW'), `Expected "24kW" in: ${capturedTranscript}`);
  assert(capturedTranscript.includes('30kW'), `Expected "30kW" in: ${capturedTranscript}`);
  assert(capturedTranscript.includes('18kW'), `Expected "18kW" in: ${capturedTranscript}`);
});

test('kW corrections: adds kW to numbers followed by boiler context', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Recommend a 28 boiler with 35 output for this property.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('28kW'), `Expected "28kW" in: ${capturedTranscript}`);
  assert(capturedTranscript.includes('35kW'), `Expected "35kW" in: ${capturedTranscript}`);
});

test('kW corrections: flags unusual boiler ratings outside 12-45kW range', async (t) => {
  let capturedSanityNotes = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedSanityNotes = userMessage.sanityNotes;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse('test') } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'The boiler is rated at 8 kw which seems low, and another at 60 kw which seems high.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(Array.isArray(capturedSanityNotes), 'Expected sanityNotes to be an array');
  
  const hasUnusualRatingNote = capturedSanityNotes.some(note => 
    note.includes('Unusual boiler power rating')
  );
  assert(hasUnusualRatingNote, `Expected sanity note about unusual rating, got: ${JSON.stringify(capturedSanityNotes)}`);
});

test('Pipe size normalization: still works with new changes', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Replace 16mm pipe with 23mm pipe for better flow.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  assert(capturedTranscript.includes('15mm'), `Expected "15mm" in: ${capturedTranscript}`);
  assert(capturedTranscript.includes('22mm'), `Expected "22mm" in: ${capturedTranscript}`);
});

test('Combined corrections: handles multiple issues in one transcript', async (t) => {
  let capturedTranscript = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes('openai.com')) {
      const body = JSON.parse(options.body);
      const userMessage = JSON.parse(body.messages[1].content);
      capturedTranscript = userMessage.transcript;
      
      return new Response(
        JSON.stringify({ choices: [{ message: { content: createMockAIResponse(capturedTranscript) } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = new Request('https://example.com/text', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 
      transcript: 'Install Worchester con bee with 4024 output, extend the flu with 16mm pipe, add tee are vee valves and Ferox filter.'
    })
  });

  const response = await worker.fetch(request, { OPENAI_API_KEY: 'test-key' }, {});
  assert.equal(response.status, 200);
  
  // Check all corrections were applied
  assert(capturedTranscript.includes('Worcester'), `Expected "Worcester" correction`);
  assert(capturedTranscript.includes('combi'), `Expected "combi" correction`);
  assert(capturedTranscript.includes('24kW'), `Expected "24kW" correction`);
  assert(capturedTranscript.includes('flue'), `Expected "flue" correction`);
  assert(capturedTranscript.includes('15mm'), `Expected "15mm" pipe correction`);
  assert(capturedTranscript.includes('TRV'), `Expected "TRV" correction`);
  assert(capturedTranscript.includes('Fernox'), `Expected "Fernox" correction`);
});
