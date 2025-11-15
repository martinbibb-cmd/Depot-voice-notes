export function getDefaultSchema() {
  return {
    sections: [],
    checklist: { sectionsOrder: [], items: [] }
  };
}

export function normaliseSchema(raw) {
  return getDefaultSchema();
}

export function loadSchema() {
  return getDefaultSchema();
}

export function saveSchema(schema) {
  return schema;
}
