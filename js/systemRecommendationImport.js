const SYSTEM_REC_STORAGE_KEY = 'dvn_system_recommendation';

function storeSystemRecommendationJson(obj) {
  try {
    localStorage.setItem(SYSTEM_REC_STORAGE_KEY, JSON.stringify(obj));
    console.info('[SystemRec] Stored system recommendation JSON', obj);
    alert('System recommendation imported successfully.');
  } catch (err) {
    console.error('[SystemRec] Failed to store system recommendation JSON', err);
    alert('There was a problem saving the system recommendation data.');
  }
}

export function loadSystemRecommendationJson() {
  try {
    const raw = localStorage.getItem(SYSTEM_REC_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[SystemRec] Failed to load system recommendation JSON', err);
    return null;
  }
}

function handleSystemRecFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      storeSystemRecommendationJson(json);
    } catch (err) {
      console.error('[SystemRec] Invalid JSON file', err);
      alert('That file does not look like valid JSON.');
    } finally {
      // Reset input so selecting the same file again still triggers change
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function initSystemRecImport() {
  const btn = document.getElementById('btn-import-system-rec');
  const input = document.getElementById('input-system-rec-file');

  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', handleSystemRecFileChange);
}

document.addEventListener('DOMContentLoaded', initSystemRecImport);

// NOTE: loadSystemRecommendationJson is exported for proposal.js to use.
