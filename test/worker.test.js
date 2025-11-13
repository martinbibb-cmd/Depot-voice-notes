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

test('POST /api/recommend returns structured checklist items and materials', async () => {
  const transcript = [
    'Existing regular boiler will be replaced with a Worcester 15Ri regular boiler using a turret rear flue.',
    'We will convert to fully pumped with a 98 litre open vented cylinder in the airing cupboard.',
    'Condensate to washing machine waste.',
    'Need ladder to loft and ladder for flue access at the rear elevation.',
    'Customer will clear areas beforehand and parking on the road is fine for the team.',
    'No hazards reported by the customer.',
    'Installer to fit Hive controls, full system power flush and a 22mm magnetic filter.'
  ].join(' ');

  const request = new Request('https://example.com/api/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript })
  });

  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);

  assert.ok(Array.isArray(body.checkedItems), 'checkedItems should be an array');
  const expectedIds = [
    'boiler_wb_15ri_reg',
    'convert_fully_pumped',
    'cyl_ov_98l',
    'condensate_to_wm',
    'ladder_flue_access',
    'ladder_loft_access',
    'customer_clear_areas',
    'parking_on_road',
    'no_hazards'
  ];
  for (const id of expectedIds) {
    assert.ok(
      body.checkedItems.includes(id),
      `expected checklist item ${id} to be returned`
    );
  }

  assert.ok(Array.isArray(body.materials), 'materials should be an array');
  const boiler = body.materials.find(m => m.category === 'Boiler');
  assert.ok(boiler, 'expected boiler material');
  assert.match(boiler.item.toLowerCase(), /worcester/);
  assert.match(boiler.item.toLowerCase(), /15ri/);

  const controls = body.materials.find(m => m.category === 'Controls');
  assert.ok(controls, 'expected controls material');
  assert.match(controls.item.toLowerCase(), /hive/);

  const filter = body.materials.find(m => m.category === 'Filter');
  assert.ok(filter, 'expected filter material');
  assert.match(filter.item.toLowerCase(), /22mm/);

  const flush = body.materials.find(m => m.category === 'System clean');
  assert.ok(flush, 'expected system clean material');
  assert.match(flush.item.toLowerCase(), /power flush/);
});

test('Custom checklist overrides are honoured', async () => {
  const transcript = 'The customer mentioned a bespoke acoustic screen requirement.';
  const request = new Request('https://example.com/api/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      transcript,
      checklistItems: [
        {
          id: 'bespoke_screen',
          label: 'Bespoke acoustic screen',
          match: { any: ['acoustic screen requirement'] }
        }
      ]
    })
  });

  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 200);
  const body = await parseJson(response);

  assert.deepEqual(body.checkedItems, ['bespoke_screen']);
});
