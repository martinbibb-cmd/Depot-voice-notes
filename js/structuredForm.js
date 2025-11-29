// js/structuredForm.js
// Structured survey form management

const FORM_STORAGE_KEY = 'depot.structuredFormEnabled';

// Form field definitions
const FORM_FIELDS = {
  propertyBasics: {
    title: '🏠 Property Basics',
    fields: [
      { id: 'houseType', label: 'House Type', type: 'select', options: ['Detached', 'Semi-detached', 'Terraced', 'Flat/Apartment', 'Bungalow', 'Other'] },
      { id: 'bedrooms', label: 'Number of Bedrooms', type: 'number', min: 1, max: 10 },
      { id: 'bathrooms', label: 'Number of Bathrooms', type: 'number', min: 1, max: 5, step: 0.5 },
      { id: 'mainsPressure', label: 'Mains Pressure (bar)', type: 'number', min: 0, max: 10, step: 0.1 },
      { id: 'mainsFlow', label: 'Mains Flow (L/min)', type: 'number', min: 0, max: 100, step: 1 }
    ]
  },
  existingSystem: {
    title: '🔧 Existing System',
    fields: [
      { id: 'existingBoilerType', label: 'Existing Boiler Type', type: 'select', options: ['Combi', 'System', 'Regular', 'Back boiler', 'None'] },
      { id: 'existingFuel', label: 'Fuel Type', type: 'select', options: ['Natural Gas', 'LPG', 'Oil', 'Electric', 'Other'] },
      { id: 'existingBoilerAge', label: 'Boiler Age (years)', type: 'number', min: 0, max: 50 },
      { id: 'existingCylinderType', label: 'Hot Water Cylinder', type: 'select', options: ['None (Combi)', 'Vented', 'Unvented', 'Thermal store'] },
      { id: 'existingControls', label: 'Current Controls', type: 'text', placeholder: 'e.g., Programmer, room thermostat, TRVs' },
      { id: 'gasRoute', label: 'Gas Supply Route', type: 'textarea', placeholder: 'Describe gas meter location and route to boiler' },
      { id: 'primariesRoute', label: 'Primaries Route', type: 'textarea', placeholder: 'Describe primary flow/return pipework route' },
      { id: 'feedAndExpansion', label: 'F&E Tank Present', type: 'checkbox' }
    ]
  },
  newSystem: {
    title: '✨ New System',
    fields: [
      { id: 'newSystemType', label: 'Proposed System Type', type: 'select', options: ['Combi', 'System', 'Regular'], required: true },
      { id: 'systemTier', label: 'System Tier', type: 'select', options: ['Gold (Premium)', 'Silver (Standard)', 'Bronze (Budget)'] },
      { id: 'newBoilerModel', label: 'Proposed Boiler Model', type: 'text', placeholder: 'e.g., Worcester Bosch 30CDi' },
      { id: 'newBoilerOutput', label: 'Boiler Output (kW)', type: 'number', min: 10, max: 50, step: 1 },
      { id: 'newCylinderSize', label: 'Cylinder Size (L)', type: 'number', min: 0, max: 500, step: 50 },
      { id: 'systemReasons', label: 'Reasons for Choice', type: 'textarea', placeholder: 'Why this system type and tier?' }
    ]
  },
  customerNeeds: {
    title: '💡 Customer Needs & Priorities',
    fields: [
      { id: 'spaceAvailable', label: 'Space Available', type: 'textarea', placeholder: 'Where equipment can be installed' },
      { id: 'runningCosts', label: 'Running Costs Priority', type: 'select', options: ['High priority', 'Medium priority', 'Low priority'] },
      { id: 'comfort', label: 'Comfort Priority', type: 'select', options: ['High priority', 'Medium priority', 'Low priority'] },
      { id: 'futureProofing', label: 'Future-proofing', type: 'textarea', placeholder: 'Plans for solar, heat pump, extensions, etc.' },
      { id: 'budget', label: 'Budget Indication', type: 'text', placeholder: 'Customer budget range' },
      { id: 'specialRequirements', label: 'Special Requirements', type: 'textarea', placeholder: 'Any specific needs or constraints' }
    ]
  }
};

/**
 * Initialize structured form
 */
export function initStructuredForm() {
  const container = document.getElementById('structuredFormContainer');
  const card = document.getElementById('structuredFormCard');
  const toggleBtn = document.getElementById('toggleFormBtn');
  const unifiedCard = document.getElementById('unifiedSurveyCard');

  if (!container) {
    console.warn('Structured form container not found');
    return;
  }

  // Render form content if not already rendered
  if (container.children.length === 0) {
    renderForm(container);
  }

  // Check if form should be visible (legacy support)
  const formEnabled = localStorage.getItem(FORM_STORAGE_KEY) === 'true';

  if (formEnabled && card) {
    card.style.display = 'block';
    // If unified card exists, show it too
    if (unifiedCard) {
      unifiedCard.style.display = 'block';
    }
  }

  // Toggle button (legacy support - may not exist in new layout)
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      const isVisible = card && card.style.display !== 'none';
      if (isVisible && card) {
        card.style.display = 'none';
        localStorage.setItem(FORM_STORAGE_KEY, 'false');
      } else if (card) {
        card.style.display = 'block';
        localStorage.setItem(FORM_STORAGE_KEY, 'true');
        if (container.children.length === 0) {
          renderForm(container);
        }
      }
      toggleBtn.textContent = isVisible ? 'Show Form' : 'Hide Form';
    };
  }

  // Expose toggle function
  window.toggleStructuredForm = () => {
    if (toggleBtn) {
      toggleBtn.click();
    } else if (unifiedCard && card) {
      // New unified layout - toggle the unified card and show structured form
      const isVisible = unifiedCard.style.display !== 'none';
      if (isVisible) {
        unifiedCard.style.display = 'none';
      } else {
        unifiedCard.style.display = 'block';
        card.style.display = 'block';
        if (container.children.length === 0) {
          renderForm(container);
        }
      }
    }
  };
}

/**
 * Render the complete form
 */
function renderForm(container) {
  container.innerHTML = '';

  // Add form enable/disable toggle at top
  const enableToggle = document.createElement('div');
  enableToggle.style.cssText = 'padding: 12px; background: var(--accent-soft); border-radius: var(--radius); margin-bottom: 16px;';
  enableToggle.innerHTML = `
    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
      <input type="checkbox" id="formModeCheckbox" ${isFormEnabled() ? 'checked' : ''}>
      <span style="font-weight: 600;">Use form data as primary source (overrides transcript)</span>
    </label>
    <p class="small" style="margin: 8px 0 0 28px; color: var(--muted);">
      When enabled, form fields take priority over voice transcript when generating notes.
    </p>
  `;
  container.appendChild(enableToggle);

  // Add form mode toggle event
  const checkbox = enableToggle.querySelector('#formModeCheckbox');
  if (checkbox) {
    checkbox.onchange = () => {
      setFormMode(checkbox.checked);
    };
  }

  // Render each section
  Object.entries(FORM_FIELDS).forEach(([sectionKey, section]) => {
    const sectionEl = createFormSection(sectionKey, section);
    container.appendChild(sectionEl);
  });

  // Load saved form data
  loadFormData();
}

/**
 * Create a form section
 */
function createFormSection(sectionKey, section) {
  const sectionEl = document.createElement('div');
  sectionEl.className = 'form-section';
  sectionEl.style.cssText = 'margin-bottom: 20px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius); border: 1px solid var(--border);';

  const titleEl = document.createElement('h3');
  titleEl.style.cssText = 'margin: 0 0 16px 0; font-size: 1rem; font-weight: 700; color: var(--accent);';
  titleEl.textContent = section.title;
  sectionEl.appendChild(titleEl);

  // Render fields
  section.fields.forEach(field => {
    const fieldEl = createFormField(sectionKey, field);
    sectionEl.appendChild(fieldEl);
  });

  return sectionEl;
}

/**
 * Create a form field
 */
function createFormField(sectionKey, field) {
  const fieldEl = document.createElement('div');
  fieldEl.className = 'form-field';
  fieldEl.style.cssText = 'margin-bottom: 12px;';

  const fieldId = `form_${sectionKey}_${field.id}`;

  // Label
  const label = document.createElement('label');
  label.htmlFor = fieldId;
  label.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 600; font-size: 0.9rem;';
  label.textContent = field.label + (field.required ? ' *' : '');
  fieldEl.appendChild(label);

  // Input element
  let input;

  if (field.type === 'select') {
    input = document.createElement('select');
    input.innerHTML = '<option value="">-- Select --</option>';
    field.options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      input.appendChild(option);
    });
  } else if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
    input.placeholder = field.placeholder || '';
  } else if (field.type === 'checkbox') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.style.cssText = 'width: auto; margin-right: 8px;';
    label.style.cssText += ' display: flex; align-items: center;';
    label.appendChild(input);
    fieldEl.appendChild(label);
    input.id = fieldId;
    input.dataset.sectionKey = sectionKey;
    input.dataset.fieldId = field.id;
    input.onchange = saveFormData;
    return fieldEl; // Early return for checkbox
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    if (field.step !== undefined) input.step = field.step;
    input.placeholder = field.placeholder || '';
  }

  input.id = fieldId;
  input.className = 'form-input';
  input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; font-family: inherit; font-size: 0.9rem;';
  input.dataset.sectionKey = sectionKey;
  input.dataset.fieldId = field.id;

  // Save on change
  input.onchange = saveFormData;
  input.oninput = saveFormData; // Also save on input for text fields

  fieldEl.appendChild(input);

  return fieldEl;
}

/**
 * Save form data to state
 */
function saveFormData() {
  const formData = {};

  Object.keys(FORM_FIELDS).forEach(sectionKey => {
    formData[sectionKey] = {};
    FORM_FIELDS[sectionKey].fields.forEach(field => {
      const fieldId = `form_${sectionKey}_${field.id}`;
      const input = document.getElementById(fieldId);
      if (input) {
        if (field.type === 'checkbox') {
          formData[sectionKey][field.id] = input.checked;
        } else if (field.type === 'number') {
          formData[sectionKey][field.id] = input.value ? parseFloat(input.value) : null;
        } else {
          formData[sectionKey][field.id] = input.value || null;
        }
      }
    });
  });

  // Store in window for access by main.js
  if (window.__depotSessionFormData !== undefined) {
    window.__depotSessionFormData = formData;
  }

  // Store globally for other modules
  window.sessionFormData = formData;

  console.log('Form data saved:', formData);
}

/**
 * Load form data from state
 */
function loadFormData() {
  const formData = window.__depotSessionFormData || window.sessionFormData || {};

  Object.keys(FORM_FIELDS).forEach(sectionKey => {
    if (!formData[sectionKey]) return;

    FORM_FIELDS[sectionKey].fields.forEach(field => {
      const fieldId = `form_${sectionKey}_${field.id}`;
      const input = document.getElementById(fieldId);
      const value = formData[sectionKey][field.id];

      if (input && value !== null && value !== undefined) {
        if (field.type === 'checkbox') {
          input.checked = value;
        } else {
          input.value = value;
        }
      }
    });
  });

  console.log('Form data loaded:', formData);
}

/**
 * Check if form mode is enabled
 */
function isFormEnabled() {
  return localStorage.getItem('depot.formModeEnabled') === 'true';
}

/**
 * Set form mode (form overrides transcript)
 */
function setFormMode(enabled) {
  localStorage.setItem('depot.formModeEnabled', enabled ? 'true' : 'false');
  console.log('Form mode:', enabled ? 'enabled (form overrides transcript)' : 'disabled (transcript is primary)');
}

/**
 * Get current form data
 */
export function getFormData() {
  return window.sessionFormData || window.__depotSessionFormData || {};
}

/**
 * Check if form mode is active
 */
export function isFormModeActive() {
  return isFormEnabled();
}

/**
 * Clear form data
 */
export function clearFormData() {
  Object.keys(FORM_FIELDS).forEach(sectionKey => {
    FORM_FIELDS[sectionKey].fields.forEach(field => {
      const fieldId = `form_${sectionKey}_${field.id}`;
      const input = document.getElementById(fieldId);
      if (input) {
        if (field.type === 'checkbox') {
          input.checked = false;
        } else {
          input.value = '';
        }
      }
    });
  });

  window.sessionFormData = {};
  if (window.__depotSessionFormData !== undefined) {
    window.__depotSessionFormData = {};
  }

  console.log('Form data cleared');
}
