import test from "node:test";
import assert from "node:assert/strict";

import checklistConfig from "../checklist.config.json" with { type: "json" };
import {
  buildDeterministicScope,
  buildRecap,
  detectConfirmationQuestions,
  normaliseChecklistItems
} from "../js/jobState.js";

const checklistItems = normaliseChecklistItems(checklistConfig);

function scopeFor(selections, items = checklistItems) {
  return buildDeterministicScope(items, selections);
}

function sectionLines(scope, sectionName) {
  const section = scope.sections.find((entry) => entry.section === sectionName);
  return section ? section.plainText : "";
}

test("builds simple like-for-like boiler replacement scope from selected outcomes", () => {
  const scope = scopeFor({
    gas_supply_scope: "retain_22mm",
    flue_scope: "existing_position",
    filter_scope: "fit_filter",
    system_clean_scope: "powerflush"
  });

  assert.match(sectionLines(scope, "Pipe work"), /Retain existing 22 mm gas supply;/);
  assert.match(sectionLines(scope, "Flue"), /Replace flue in existing position;/);
  assert.match(sectionLines(scope, "New boiler and controls"), /Powerflush heating system;/);
  assert.match(sectionLines(scope, "New boiler and controls"), /Fit magnetic filter;/);
  assert.deepEqual(detectConfirmationQuestions(scope), []);
});

test("keeps cylinder separate quote alternatives out of base scope wording", () => {
  const scope = scopeFor({
    cylinder_scope: "separate_quote"
  });

  assert.equal(sectionLines(scope, "System characteristics"), "Option A - Cylinder work to be priced separately;");
  assert.equal(scope.selectedItems[0].quoteScope, "option A");
});

test("supports retaining existing cylinder as a distinct selected outcome", () => {
  const scope = scopeFor({
    cylinder_scope: "retain"
  });

  assert.equal(sectionLines(scope, "System characteristics"), "Retain existing cylinder;");
  assert(scope.tags.includes("cylinder:retain"));
});

test("detects vented versus unvented contradiction from selected logic", () => {
  const items = normaliseChecklistItems([
    {
      id: "vented_choice",
      group: "System",
      label: "Vented final scope",
      outcomes: [{ id: "yes", label: "Vented", section: "System characteristics", plainText: "Final scope is vented", tags: ["system:vented"] }]
    },
    {
      id: "unvented_choice",
      group: "System",
      label: "Unvented final scope",
      outcomes: [{ id: "yes", label: "Unvented", section: "System characteristics", plainText: "Final scope is unvented", tags: ["system:unvented"] }]
    }
  ]);
  const scope = scopeFor({ vented_choice: "yes", unvented_choice: "yes" }, items);

  assert.deepEqual(detectConfirmationQuestions(scope), [
    { target: "expert", question: "Final scope includes both vented and unvented system types. Which applies?" }
  ]);
});

test("places builder-required condensate soakaway in customer actions", () => {
  const scope = scopeFor({
    condensate_scope: "builder_soakaway"
  });

  assert.equal(sectionLines(scope, "Customer actions"), "Customer to arrange builder for condensate soakaway;");
  assert(scope.tags.includes("specialist:builder"));
});

test("places customer-arranged work in customer actions only", () => {
  const scope = scopeFor({
    parking_scope: "permits_required"
  });

  assert.equal(sectionLines(scope, "Customer actions"), "Customer to arrange parking permits;");
  assert.equal(scope.sections.length, 1);
});

test("detects conflicting retain and upgrade gas selections", () => {
  const items = normaliseChecklistItems([
    {
      id: "retain_gas",
      group: "Gas",
      label: "Retain gas",
      outcomes: [{ id: "yes", label: "Retain", section: "Gas", plainText: "Retain gas supply", tags: ["gas:retain"] }]
    },
    {
      id: "upgrade_gas",
      group: "Gas",
      label: "Upgrade gas",
      outcomes: [{ id: "yes", label: "Upgrade", section: "Gas", plainText: "Upgrade gas supply", tags: ["gas:upgrade"] }]
    }
  ]);
  const scope = scopeFor({ retain_gas: "yes", upgrade_gas: "yes" }, items);

  assert.deepEqual(detectConfirmationQuestions(scope), [
    { target: "expert", question: "Gas supply is marked as both retained and upgraded. Which scope is correct?" }
  ]);
});

test("recap separates dictated additions from deterministic checklist selections", () => {
  const scope = scopeFor({
    gas_supply_scope: "retain_22mm",
    controls_scope: "fit_smart_control"
  });
  const recap = buildRecap(scope, "Customer asked for install on a Friday.");

  assert.deepEqual(recap.selectedBySection, [
    { section: "Pipe work", items: ["Gas supply: Retain existing 22 mm gas supply"] },
    { section: "New boiler and controls", items: ["Controls: Fit smart control"] }
  ]);
  assert.equal(recap.dictatedAdditions, "Customer asked for install on a Friday.");
});

test("does not ask unnecessary questions when selected scope is complete enough", () => {
  const scope = scopeFor({
    gas_supply_scope: "retain_22mm",
    final_system_type: "combi",
    flue_scope: "existing_position",
    system_clean_scope: "mains_flush"
  });

  assert.deepEqual(detectConfirmationQuestions(scope), []);
});

test("deterministic selected facts remain available to override AI output", () => {
  const scope = scopeFor({
    gas_supply_scope: "retain_22mm"
  });
  const aiSection = { section: "Gas", plainText: "Upgrade gas supply;", naturalLanguage: "" };

  assert.equal(sectionLines(scope, "Pipe work"), "Retain existing 22 mm gas supply;");
  assert.notEqual(sectionLines(scope, "Pipe work"), aiSection.plainText);
});
