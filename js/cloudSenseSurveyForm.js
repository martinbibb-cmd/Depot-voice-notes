// js/cloudSenseSurveyForm.js
// CloudSense-aligned survey form (13 sections)
// Version: 1.3.0

const CS_FORM_STORAGE_KEY = 'depot.cloudSenseFormEnabled';

// ============================================================================
// FORM FIELD DEFINITIONS (13 Sections)
// ============================================================================

const CLOUDSENSE_SECTIONS = {
  // SECTION 1 — Customer Status & Vulnerability
  vulnerability: {
    title: '🚨 Section 1 — Customer Status & Vulnerability',
    collapsed: false,
    fields: [
      { id: 'confirmHSCRating', label: 'Confirm HSC rating', type: 'select', options: ['yes', 'no', 'none'], path: 'vulnerability.confirmHSCRating' },
      { id: 'boilerWorking', label: 'Boiler working?', type: 'select', options: ['yes', 'no', 'none'], path: 'vulnerability.boilerWorking' },
      { id: 'hotWaterAvailable', label: 'Hot water available?', type: 'select', options: ['yes', 'no', 'none'], path: 'vulnerability.hotWaterAvailable' },
      { id: 'otherFormOfHeating', label: 'Other form of heating?', type: 'select', options: ['yes', 'no', 'none'], path: 'vulnerability.otherFormOfHeating' },
      { id: 'otherHeatingNotes', label: 'Other heating notes', type: 'textarea', path: 'vulnerability.otherHeatingNotes', rows: 2 },
      { id: 'anythingElseToBeAwareOf', label: 'Anything else we should be aware of?', type: 'select', options: ['yes', 'no', 'none'], path: 'vulnerability.anythingElseToBeAwareOf' },
      { id: 'awarenessNotes', label: 'Awareness notes', type: 'textarea', path: 'vulnerability.awarenessNotes', rows: 2 },
      { id: 'hsaInstallationRating', label: 'HSA installation rating', type: 'select', options: ['normal', 'urgent'], path: 'vulnerability.hsaInstallationRating' },
      { id: 'vulnerabilityReason', label: 'Vulnerability reason', type: 'select', options: ['75 and over', 'Disability', 'Illness', 'Other', 'None'], path: 'vulnerability.vulnerabilityReason' },
      { id: 'priorityInstallationRating', label: 'Priority installation rating', type: 'select', options: ['none', 'standard', 'urgent'], path: 'vulnerability.priorityInstallationRating' },
      { id: 'latestCustomerCategory', label: 'Latest customer category', type: 'text', path: 'vulnerability.latestCustomerCategory' },
      { id: 'reasonForQuotation', label: 'Reason for quotation', type: 'select', options: ['Home improvements', 'Boiler failure', 'End of life', 'Energy efficiency', 'Other'], path: 'vulnerability.reasonForQuotation' },
      { id: 'reasonForSystemSelection', label: 'Reason for system selection', type: 'text', path: 'vulnerability.reasonForSystemSelection', placeholder: 'e.g., Customer wants like-for-like' },
      { id: 'customerNeeds', label: 'Customer needs', type: 'textarea', path: 'vulnerability.customerNeeds', rows: 3 },
      { id: 'safetyIssuesAtProperty', label: 'Safety issues at property?', type: 'select', options: ['yes', 'no', 'none'], path: 'vulnerability.safetyIssuesAtProperty' },
      { id: 'safetyIssuesNotes', label: 'Safety issues notes', type: 'textarea', path: 'vulnerability.safetyIssuesNotes', rows: 2 }
    ]
  },

  // SECTION 2 — Existing System Overview
  existingSystem: {
    title: '🔧 Section 2 — Existing System Overview',
    collapsed: true,
    fields: [
      { id: 'existingSystemType', label: 'Existing system type', type: 'select', options: ['conventional', 'system', 'combi', 'back_boiler', 'unknown'], path: 'existingSystem.existingSystemType' },
      { id: 'systemTypeRequired', label: 'System type required', type: 'select', options: ['conventional', 'system', 'combi'], path: 'existingSystem.systemTypeRequired' },
      { id: 'jobTypeRequired', label: 'Job type required', type: 'select', options: ['boiler_replacement', 'full_system', 'conversion', 'new_install'], path: 'existingSystem.jobTypeRequired' },
      { id: 'homecareStatus', label: 'Homecare status', type: 'select', options: ['none', 'boiler_warranty', 'multiprem_homecare', 'unknown'], path: 'existingSystem.homecareStatus' },
      { id: 'systemCharacteristicsNotes', label: 'System characteristics notes', type: 'textarea', path: 'existingSystem.systemCharacteristicsNotes', rows: 3 },
      { id: 'componentsNeedingAssistanceForRemoval', label: 'Components needing assistance for removal', type: 'textarea', path: 'existingSystem.componentsNeedingAssistanceForRemoval', rows: 2 }
    ]
  },

  // SECTION 3 — Electrical Survey
  electrical: {
    title: '⚡ Section 3 — Electrical Survey',
    collapsed: true,
    fields: [
      { id: 'earthSystemType', label: 'Earth system type', type: 'select', options: ['TT', 'TN', 'TN-S', 'TN-C-S', 'unknown'], path: 'electrical.earthSystemType' },
      { id: 'workingVOELCB', label: 'Working VOELCB', type: 'select', options: ['yes', 'no', 'none'], path: 'electrical.workingVOELCB' },
      { id: 'visibleEarth', label: 'Visible earth', type: 'select', options: ['yes', 'no', 'none'], path: 'electrical.visibleEarth' },
      { id: 'customerToArrangeWorks', label: 'Customer to arrange works?', type: 'select', options: ['yes', 'no'], path: 'electrical.customerToArrangeWorks' },
      { id: 'rcdPresent', label: 'RCD present', type: 'select', options: ['yes', 'no', 'none'], path: 'electrical.rcdPresent' },
      { id: 'socketAndSeeReading', label: 'Socket & See reading', type: 'text', path: 'electrical.socketAndSeeReading', placeholder: '<1 ohm or value' },
      { id: 'socketAndSeeLocation', label: 'Socket & See location', type: 'text', path: 'electrical.socketAndSeeLocation' },
      { id: 'earthingBundleResult', label: 'Earthing bundle result', type: 'textarea', path: 'electrical.earthingBundleResult', rows: 2, placeholder: 'e.g., TN system, passed' }
    ]
  },

  // SECTION 4 — Working At Height
  workingAtHeight: {
    title: '🪜 Section 4 — Working At Height',
    collapsed: true,
    fields: [
      { id: 'safeAccessAtHeightRequired', label: 'Safe access at height required?', type: 'select', options: ['yes', 'no', 'none'], path: 'workingAtHeight.safeAccessAtHeightRequired' },
      { id: 'safeAccessPackCode', label: 'Safe access pack code', type: 'text', path: 'workingAtHeight.safeAccessPackCode', placeholder: 'Search code' },
      { id: 'safeAccessQuantity', label: 'Quantity', type: 'number', path: 'workingAtHeight.safeAccessQuantity', min: 0 },
      { id: 'additionalStoreyCharge', label: 'Additional storey charge', type: 'text', path: 'workingAtHeight.additionalStoreyCharge', placeholder: 'Search code' },
      { id: 'workDescription', label: 'Work description', type: 'textarea', path: 'workingAtHeight.workDescription', rows: 2 },
      { id: 'restrictionsToWorkAreas', label: 'Restrictions to work areas', type: 'textarea', path: 'workingAtHeight.restrictionsToWorkAreas', rows: 2 },
      { id: 'externalHazards', label: 'External hazards', type: 'textarea', path: 'workingAtHeight.externalHazards', rows: 2 }
    ]
  },

  // SECTION 5 — Asbestos Survey
  asbestos: {
    title: '☢️ Section 5 — Asbestos Survey',
    collapsed: true,
    fields: [
      { id: 'anyArtexOrSuspectAsbestos', label: 'Any Artex / suspect asbestos?', type: 'select', options: ['yes', 'no'], path: 'asbestos.anyArtexOrSuspectAsbestos' },
      { id: 'asbestosCompany', label: 'Asbestos company', type: 'select', options: ['Environmental Essentials', 'All Task', 'Other'], path: 'asbestos.asbestosCompany' },
      { id: 'numberOfAsbestosLocations', label: 'Number of asbestos locations', type: 'number', path: 'asbestos.numberOfAsbestosLocations', min: 0 },
      { id: 'sampleRequired', label: 'Sample required?', type: 'select', options: ['yes', 'no'], path: 'asbestos.sampleRequired' },
      { id: 'suspectedMaterialDetails', label: 'Suspected material details (comma-separated)', type: 'textarea', path: 'asbestos.suspectedMaterialDetails', rows: 2, placeholder: 'Location 1, Location 2, ...' }
    ]
  },

  // SECTION 6 — Water System & Test Results
  waterSystem: {
    title: '💧 Section 6 — Water System & Test Results',
    collapsed: true,
    fields: [
      { id: 'flowRate', label: 'Flow rate (l/min)', type: 'number', path: 'waterSystem.flowRate', min: 0, step: 0.1 },
      { id: 'pressure', label: 'Pressure (bar)', type: 'number', path: 'waterSystem.pressure', min: 0, step: 0.1 },
      { id: 'waterSystemNotes', label: 'Water system notes', type: 'textarea', path: 'waterSystem.waterSystemNotes', rows: 2 }
    ]
  },

  // SECTION 7 — Boiler Job Type & Location
  boilerJob: {
    title: '🏗️ Section 7 — Boiler Job Type & Location',
    collapsed: true,
    fields: [
      { id: 'systemTypeA', label: 'System Type A', type: 'select', options: ['A2 Conv-Conv', 'A3 Conv-Conv Fully Pumped', 'A4 Combi-Combi', 'A5 System-System', 'Other'], path: 'boilerJob.systemTypeA' },
      { id: 'locationTypeB', label: 'Location Type B', type: 'select', options: ['B1 Same room & location', 'B2 Same room', 'B3 Different room same floor', 'B4 Different floor', 'Other'], path: 'boilerJob.locationTypeB' },
      { id: 'newBoilerMoreThan3MetresFromExisting', label: 'New boiler >3 metres from existing?', type: 'select', options: ['yes', 'no'], path: 'boilerJob.newBoilerMoreThan3MetresFromExisting' },
      { id: 'coreBundleName', label: 'Core bundle name (derived)', type: 'text', path: 'boilerJob.coreBundleName', readonly: true },
      { id: 'fuelType', label: 'Fuel type', type: 'select', options: ['natural_gas', 'lpg', 'oil', 'electric', 'unknown'], path: 'boilerJob.fuelType' },
      { id: 'boilerDimensionsH', label: 'Boiler dimensions H (mm)', type: 'number', path: 'boilerJob.boilerDimensionsH', min: 0 },
      { id: 'boilerDimensionsW', label: 'Boiler dimensions W (mm)', type: 'number', path: 'boilerJob.boilerDimensionsW', min: 0 },
      { id: 'boilerDimensionsD', label: 'Boiler dimensions D (mm)', type: 'number', path: 'boilerJob.boilerDimensionsD', min: 0 },
      { id: 'installationLocation', label: 'Installation location', type: 'select', options: ['Existing', 'New', 'Loft', 'Garage', 'Utility', 'Kitchen', 'Bathroom', 'Other'], path: 'boilerJob.installationLocation' },
      { id: 'bathroomZone', label: 'Bathroom zone', type: 'select', options: ['outside', 'zone_1', 'zone_2', 'zone_3'], path: 'boilerJob.bathroomZone' },
      { id: 'reasonForBoilerSelection', label: 'Reason for boiler selection', type: 'text', path: 'boilerJob.reasonForBoilerSelection' }
    ]
  },

  // SECTION 8 — Cleansing, Protection & Controls
  cleansing: {
    title: '🧹 Section 8 — Cleansing, Protection & Controls',
    collapsed: true,
    fields: [
      { id: 'powerflushRequired', label: 'Powerflush required?', type: 'select', options: ['required', 'not_required', 'recommended'], path: 'cleansing.powerflushRequired' },
      { id: 'magneticFilterType', label: 'Magnetic filter type', type: 'select', options: ['22mm', '28mm', 'none'], path: 'cleansing.magneticFilterType' },
      { id: 'install22mmGas', label: 'Install 22mm gas?', type: 'select', options: ['yes', 'no'], path: 'cleansing.install22mmGas' },
      { id: 'install28mmGas', label: 'Install 28mm gas?', type: 'select', options: ['yes', 'no'], path: 'cleansing.install28mmGas' },
      { id: 'flueType', label: 'Flue type', type: 'text', path: 'cleansing.flueType', placeholder: 'From Clearance-Genie' },
      { id: 'additionalFlueBuildingWork', label: 'Additional flue building work?', type: 'select', options: ['yes', 'no'], path: 'cleansing.additionalFlueBuildingWork' },
      { id: 'flueBuildingWorkNotes', label: 'Flue building work notes', type: 'textarea', path: 'cleansing.flueBuildingWorkNotes', rows: 2 },
      { id: 'smartStatAlreadyInstalled', label: 'Smart stat already installed?', type: 'select', options: ['yes', 'no'], path: 'cleansing.smartStatAlreadyInstalled' },
      { id: 'useExistingControls', label: 'Use existing controls?', type: 'select', options: ['yes', 'no'], path: 'cleansing.useExistingControls' },
      { id: 'controlsNotes', label: 'Controls notes', type: 'textarea', path: 'cleansing.controlsNotes', rows: 2 },
      { id: 'condensateRoute', label: 'Condensate route', type: 'select', options: ['internal_drain', 'external_soakaway', 'pumped', 'other'], path: 'cleansing.condensateRoute' },
      { id: 'fillingLoopGroup', label: 'Filling loop group', type: 'text', path: 'cleansing.fillingLoopGroup' },
      { id: 'fillingLoopSelection', label: 'Filling loop selection', type: 'text', path: 'cleansing.fillingLoopSelection' }
    ]
  },

  // SECTION 9 — Heat Loss Calculation
  heatLoss: {
    title: '🌡️ Section 9 — Heat Loss Calculation',
    collapsed: true,
    fields: [
      { id: 'propertyType', label: 'Property type', type: 'select', options: ['Detached', 'Semi-detached', 'Terraced', 'Flat', 'Bungalow', 'Other'], path: 'heatLoss.propertyType' },
      { id: 'totalHeatLossKw', label: 'Total heat loss (kW)', type: 'number', path: 'heatLoss.totalHeatLossKw', min: 0, step: 0.1, readonly: true },
      { id: 'heatLossNotes', label: 'Heat loss notes', type: 'textarea', path: 'heatLoss.notes', rows: 2 }
    ],
    hasRepeatingSection: true,
    repeatingSectionConfig: {
      title: 'Heat Loss Sections',
      path: 'heatLoss.sections',
      fields: [
        { id: 'storeys', label: 'Storeys', type: 'number', min: 0 },
        { id: 'averageRoomHeight', label: 'Avg room height (m)', type: 'number', min: 0, step: 0.1 },
        { id: 'sectionLength', label: 'Length (m)', type: 'number', min: 0, step: 0.1 },
        { id: 'sectionWidth', label: 'Width (m)', type: 'number', min: 0, step: 0.1 },
        { id: 'sectionHeatLossKw', label: 'Heat loss (kW)', type: 'number', min: 0, step: 0.1, readonly: true }
      ]
    }
  },

  // SECTION 10 — Installer Notes
  installerNotes: {
    title: '📝 Section 10 — Installer Notes',
    collapsed: true,
    fields: [
      { id: 'deliveryLocation', label: 'Delivery location', type: 'select', options: ['Kitchen', 'Hallway', 'Garage', 'Driveway', 'Other'], path: 'installerNotes.deliveryLocation' },
      { id: 'additionalDeliveryNotes', label: 'Additional delivery notes', type: 'textarea', path: 'installerNotes.additionalDeliveryNotes', rows: 2 },
      { id: 'officeNotes', label: 'Office notes', type: 'textarea', path: 'installerNotes.officeNotes', rows: 2 },
      { id: 'boilerControlsNotes', label: 'Boiler/Controls notes', type: 'textarea', path: 'installerNotes.boilerControlsNotes', rows: 2 },
      { id: 'flueNotes', label: 'Flue notes', type: 'textarea', path: 'installerNotes.flueNotes', rows: 2 },
      { id: 'gasWaterNotes', label: 'Gas/Water notes', type: 'textarea', path: 'installerNotes.gasWaterNotes', rows: 2 },
      { id: 'disruptionNotes', label: 'Disruption notes', type: 'textarea', path: 'installerNotes.disruptionNotes', rows: 2 },
      { id: 'customerAgreedActions', label: 'Customer agreed actions', type: 'textarea', path: 'installerNotes.customerAgreedActions', rows: 2 },
      { id: 'specialRequirements', label: 'Special requirements', type: 'textarea', path: 'installerNotes.specialRequirements', rows: 2 }
    ]
  },

  // SECTION 11 — Parts, Stores & Cylinders
  partsStoresCylinders: {
    title: '🔩 Section 11 — Parts, Stores & Cylinders',
    collapsed: true,
    fields: [],
    hasRepeatingSection: true,
    repeatingSectionConfig: {
      title: 'Cylinders',
      path: 'cylinders',
      fields: [
        { id: 'cylinderDescription', label: 'Description', type: 'text' },
        { id: 'capacity', label: 'Capacity (L)', type: 'number', min: 0 },
        { id: 'productCode', label: 'Product code', type: 'text' },
        { id: 'quantity', label: 'Quantity', type: 'number', min: 1 }
      ]
    },
    additionalRepeatingSection: {
      title: 'Stores',
      path: 'stores',
      fields: [
        { id: 'category', label: 'Category', type: 'text' },
        { id: 'subcategory', label: 'Subcategory', type: 'text' },
        { id: 'storeCode', label: 'Store code', type: 'text', placeholder: 'e.g., P3322' },
        { id: 'quantity', label: 'Quantity', type: 'number', min: 1 }
      ]
    }
  },

  // SECTION 12 — Discounts & Allowances
  allowances: {
    title: '💰 Section 12 — Discounts & Allowances',
    collapsed: true,
    fields: [
      { id: 'grossPriceIncVat', label: 'Gross price (inc VAT)', type: 'number', path: 'allowances.grossPriceIncVat', min: 0, step: 0.01, readonly: true },
      { id: 'totalDiscounts', label: 'Total discounts', type: 'number', path: 'allowances.totalDiscounts', min: 0, step: 0.01, readonly: true },
      { id: 'finalPricePayable', label: 'Final price payable', type: 'number', path: 'allowances.finalPricePayable', min: 0, step: 0.01, readonly: true }
    ],
    hasRepeatingSection: true,
    repeatingSectionConfig: {
      title: 'Allowances',
      path: 'allowances.allowances',
      fields: [
        { id: 'allowanceType', label: 'Type', type: 'text' },
        { id: 'refNumber', label: 'Ref number', type: 'text' },
        { id: 'maxAmount', label: 'Max amount', type: 'number', min: 0, step: 0.01 },
        { id: 'actualAmount', label: 'Actual amount', type: 'number', min: 0, step: 0.01 },
        { id: 'applied', label: 'Applied', type: 'checkbox' }
      ]
    }
  },

  // SECTION 13 — Photos & Evidence
  photos: {
    title: '📷 Section 13 — Photos & Evidence',
    collapsed: true,
    fields: [
      { id: 'photosNote', label: 'Photos managed separately', type: 'note', text: 'Use the photo upload feature to add evidence photos. Categories: Boiler, Flue terminal, Gas route, Cylinder, Loft area, Electric earth/RCD, Safe access.' }
    ]
  }
};

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

/**
 * Initialize CloudSense survey form
 */
export function initCloudSenseSurveyForm() {
  const container = document.getElementById('cloudSenseFormContainer');
  const card = document.getElementById('cloudSenseFormCard');
  const toggleBtn = document.getElementById('toggleCloudSenseFormBtn');
  const unifiedCard = document.getElementById('unifiedSurveyCard');
  const structuredCard = document.getElementById('structuredFormCard');

  if (!container) {
    console.warn('CloudSense form container not found');
    return;
  }

  // Check if form should be visible (legacy support)
  const formEnabled = localStorage.getItem(CS_FORM_STORAGE_KEY) === 'true';

  if (formEnabled && card) {
    card.style.display = 'block';
    // Hide structured form if showing CloudSense
    if (structuredCard) {
      structuredCard.style.display = 'none';
    }
    // If unified card exists, show it too
    if (unifiedCard) {
      unifiedCard.style.display = 'block';
    }
    // Only render form content when needed
    if (container.children.length === 0) {
      renderCloudSenseForm(container);
    }
  }

  // Toggle button (legacy support - may not exist in new layout)
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      const isVisible = card && card.style.display !== 'none';
      if (isVisible && card) {
        card.style.display = 'none';
        localStorage.setItem(CS_FORM_STORAGE_KEY, 'false');
      } else if (card) {
        card.style.display = 'block';
        localStorage.setItem(CS_FORM_STORAGE_KEY, 'true');
        if (container.children.length === 0) {
          renderCloudSenseForm(container);
        }
      }
      toggleBtn.textContent = isVisible ? 'Show Survey' : 'Hide Survey';
    };
  }

  // Expose toggle function
  window.toggleCloudSenseSurveyForm = () => {
    if (toggleBtn) {
      toggleBtn.click();
    } else if (unifiedCard && card) {
      // New unified layout - toggle the unified card and show CloudSense form
      const computedDisplay = window.getComputedStyle(unifiedCard).display;
      const isVisible = computedDisplay !== 'none';
      if (isVisible) {
        unifiedCard.style.display = 'none';
      } else {
        unifiedCard.style.display = 'block';
        card.style.display = 'block';
        // Hide structured form
        if (structuredCard) {
          structuredCard.style.display = 'none';
        }
        if (container.children.length === 0) {
          renderCloudSenseForm(container);
        }
      }
    }
  };
}

/**
 * Render the complete CloudSense form
 */
function renderCloudSenseForm(container) {
  container.innerHTML = '';

  Object.entries(CLOUDSENSE_SECTIONS).forEach(([sectionKey, sectionConfig]) => {
    const sectionEl = createSection(sectionKey, sectionConfig);
    container.appendChild(sectionEl);
  });
}

/**
 * Create a collapsible section
 */
function createSection(sectionKey, config) {
  const section = document.createElement('div');
  section.className = 'cs-survey-section';
  section.dataset.section = sectionKey;

  // Header
  const header = document.createElement('div');
  header.className = 'cs-section-header';
  header.innerHTML = `
    <h3>${config.title}</h3>
    <button class="cs-collapse-btn">${config.collapsed ? '▼' : '▲'}</button>
  `;

  // Body
  const body = document.createElement('div');
  body.className = 'cs-section-body';
  body.style.display = config.collapsed ? 'none' : 'block';

  // Render fields
  config.fields.forEach(field => {
    const fieldEl = createField(field);
    body.appendChild(fieldEl);
  });

  // Render repeating sections
  if (config.hasRepeatingSection && config.repeatingSectionConfig) {
    const repeatingSectionEl = createRepeatingSection(config.repeatingSectionConfig);
    body.appendChild(repeatingSectionEl);
  }

  // Additional repeating section (for Section 11)
  if (config.additionalRepeatingSection) {
    const additionalRepeatingSectionEl = createRepeatingSection(config.additionalRepeatingSection);
    body.appendChild(additionalRepeatingSectionEl);
  }

  // Toggle collapse
  header.querySelector('.cs-collapse-btn').onclick = () => {
    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? 'block' : 'none';
    header.querySelector('.cs-collapse-btn').textContent = isCollapsed ? '▲' : '▼';
  };

  section.appendChild(header);
  section.appendChild(body);

  return section;
}

/**
 * Create a form field
 */
function createField(field) {
  const fieldContainer = document.createElement('div');
  fieldContainer.className = 'cs-field';
  fieldContainer.dataset.path = field.path;

  if (field.type === 'note') {
    fieldContainer.innerHTML = `<p class="cs-note">${field.text}</p>`;
    return fieldContainer;
  }

  const label = document.createElement('label');
  label.textContent = field.label;
  label.htmlFor = field.id;

  let input;

  switch (field.type) {
    case 'select':
      input = document.createElement('select');
      input.id = field.id;
      input.name = field.id;

      // Add empty option
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '—';
      input.appendChild(emptyOption);

      field.options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
      break;

    case 'textarea':
      input = document.createElement('textarea');
      input.id = field.id;
      input.name = field.id;
      input.rows = field.rows || 3;
      if (field.placeholder) input.placeholder = field.placeholder;
      break;

    case 'checkbox':
      input = document.createElement('input');
      input.type = 'checkbox';
      input.id = field.id;
      input.name = field.id;
      break;

    case 'number':
      input = document.createElement('input');
      input.type = 'number';
      input.id = field.id;
      input.name = field.id;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.placeholder) input.placeholder = field.placeholder;
      break;

    default: // text
      input = document.createElement('input');
      input.type = 'text';
      input.id = field.id;
      input.name = field.id;
      if (field.placeholder) input.placeholder = field.placeholder;
  }

  if (field.readonly) {
    input.readOnly = true;
    input.className = 'cs-readonly';
  }

  input.dataset.path = field.path;

  // Auto-save on change
  input.addEventListener('change', () => {
    saveFieldToSession(field.path, input);
  });

  fieldContainer.appendChild(label);
  fieldContainer.appendChild(input);

  return fieldContainer;
}

/**
 * Create a repeating section (for cylinders, stores, allowances, heat loss sections)
 */
function createRepeatingSection(config) {
  const container = document.createElement('div');
  container.className = 'cs-repeating-section';

  const header = document.createElement('div');
  header.className = 'cs-repeating-header';
  header.innerHTML = `
    <h4>${config.title}</h4>
    <button class="cs-add-row-btn">+ Add</button>
  `;

  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'cs-repeating-rows';
  rowsContainer.dataset.path = config.path;

  // Add row button
  header.querySelector('.cs-add-row-btn').onclick = () => {
    const row = createRepeatingRow(config.fields, config.path);
    rowsContainer.appendChild(row);
  };

  container.appendChild(header);
  container.appendChild(rowsContainer);

  return container;
}

/**
 * Create a single repeating row
 */
function createRepeatingRow(fields, basePath) {
  const row = document.createElement('div');
  row.className = 'cs-repeating-row';

  fields.forEach(field => {
    const fieldEl = createField(field);
    row.appendChild(fieldEl);
  });

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.textContent = '🗑️';
  removeBtn.className = 'cs-remove-row-btn';
  removeBtn.onclick = () => row.remove();

  row.appendChild(removeBtn);

  return row;
}

/**
 * Save field value to session
 */
function saveFieldToSession(path, inputEl) {
  if (!path) return;

  const session = window.currentDepotSession || {};

  let value;
  if (inputEl.type === 'checkbox') {
    value = inputEl.checked;
  } else if (inputEl.type === 'number') {
    value = inputEl.value ? parseFloat(inputEl.value) : undefined;
  } else {
    value = inputEl.value || undefined;
  }

  // Set value at path
  const pathParts = path.split('.');
  let current = session;

  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!current[part]) current[part] = {};
    current = current[part];
  }

  current[pathParts[pathParts.length - 1]] = value;

  // Trigger session update
  if (window.updateSession) {
    window.updateSession(session);
  }
}

/**
 * Load session data into form
 */
export function loadSessionIntoCloudSenseForm(session) {
  if (!session) return;

  document.querySelectorAll('.cs-field input, .cs-field select, .cs-field textarea').forEach(input => {
    const path = input.dataset.path;
    if (!path) return;

    const value = getValueAtPath(session, path);

    if (value !== undefined) {
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        input.value = value;
      }
    }
  });
}

/**
 * Get value at path in object
 */
function getValueAtPath(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return current;
}

// Export for use in main.js
window.initCloudSenseSurveyForm = initCloudSenseSurveyForm;
window.loadSessionIntoCloudSenseForm = loadSessionIntoCloudSenseForm;
