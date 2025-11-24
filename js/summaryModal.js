/**
 * Summary Modal Module
 * Modal interface for collecting pricing, finance, and HomeCare data before generating PDF summary
 */

import { generateComprehensiveSummaryPDF, previewComprehensiveSummaryPDF } from './pdfGenerator.js';
import { fetchPDFData } from './databaseQuery.js';

let modalElement = null;
let currentSessionData = null;

/**
 * Create and show the summary modal
 * @param {Object} sessionData - Current session data
 */
export async function showSummaryModal(sessionData) {
  currentSessionData = sessionData;

  // Create modal if it doesn't exist
  if (!modalElement) {
    createModal();
  }

  // Populate with session data
  populateSessionInfo(sessionData);

  // Show modal
  modalElement.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Create the modal HTML structure
 */
function createModal() {
  const modalHTML = `
    <div id="summaryDataModal" class="modal-overlay">
      <div class="modal-container" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2 style="margin: 0; color: var(--accent);">📊 Create Summary Report</h2>
          <button id="closeSummaryModal" class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--muted);">×</button>
        </div>

        <div class="modal-body" style="padding: 20px;">
          <!-- Session Information -->
          <div class="form-section" style="margin-bottom: 25px;">
            <h3 style="color: var(--accent); margin-bottom: 15px;">Session Information</h3>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Session Name</label>
              <input type="text" id="summarySessionName" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" />
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Customer Name (optional)</label>
              <input type="text" id="summaryCustomerName" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" placeholder="e.g., Mr. & Mrs. Smith" />
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Property Type (optional)</label>
              <select id="summaryPropertyType" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;">
                <option value="">Select property type...</option>
                <option value="Detached house">Detached house</option>
                <option value="Semi-detached house">Semi-detached house</option>
                <option value="Terraced house">Terraced house</option>
                <option value="Bungalow">Bungalow</option>
                <option value="Flat/Apartment">Flat/Apartment</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">what3words Location (optional)</label>
              <input type="text" id="summaryWhat3words" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" placeholder="e.g., filled.count.soap" />
              <small style="color: var(--muted); font-size: 12px;">Enter three words without '///'</small>
            </div>
          </div>

          <!-- Pricing Information -->
          <div class="form-section" style="margin-bottom: 25px; padding: 15px; background: var(--bg-secondary); border-radius: 12px;">
            <h3 style="color: var(--accent); margin-bottom: 15px;">Pricing Breakdown</h3>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Overall Price (£)</label>
              <input type="number" id="summaryOverallPrice" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" min="0" step="0.01" placeholder="5000.00" />
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 10px;">Individual Items</label>
              <div id="pricingItemsList" style="margin-bottom: 10px;">
                <!-- Items will be added here dynamically -->
              </div>
              <button id="addPricingItem" class="btn-secondary" style="width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer;">+ Add Item</button>
            </div>
          </div>

          <!-- Finance Options -->
          <div class="form-section" style="margin-bottom: 25px;">
            <h3 style="color: var(--accent); margin-bottom: 15px;">Finance Options</h3>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Preferred Finance Term</label>
              <select id="summaryFinanceTerm" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;">
                <option value="24">24 months interest-free</option>
                <option value="36">36 months interest-free</option>
                <option value="60">60 months at 9.9% APR</option>
                <option value="120">120 months at 9.9% APR</option>
              </select>
            </div>
          </div>

          <!-- HomeCare Information -->
          <div class="form-section" style="margin-bottom: 25px; padding: 15px; background: var(--bg-secondary); border-radius: 12px;">
            <h3 style="color: var(--accent); margin-bottom: 15px;">HomeCare Savings Calculator</h3>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Current Annual HomeCare Cost (£)</label>
              <input type="number" id="summaryCurrentHomeCareCost" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" min="0" step="1" placeholder="300" />
            </div>

            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">Proposed Cover Level</label>
              <select id="summaryProposedCover" class="form-input" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px;">
                <option value="15">Essential Cover - £15/month</option>
                <option value="25" selected>Standard Cover - £25/month</option>
                <option value="35">Premium Cover - £35/month</option>
                <option value="45">Total Care - £45/month</option>
              </select>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="modal-actions" style="display: flex; gap: 10px; margin-top: 25px;">
            <button id="previewSummaryBtn" class="btn-secondary" style="flex: 1; padding: 12px; background: white; color: var(--accent); border: 2px solid var(--accent); border-radius: 8px; cursor: pointer; font-weight: bold;">
              👁️ Preview
            </button>
            <button id="generateSummaryBtn" class="btn-primary" style="flex: 1; padding: 12px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
              📥 Generate & Download
            </button>
          </div>

          <div id="summaryStatusMessage" style="margin-top: 15px; padding: 10px; border-radius: 8px; display: none;"></div>
        </div>
      </div>
    </div>
  `;

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  modalElement = document.getElementById('summaryDataModal');

  // Add event listeners
  document.getElementById('closeSummaryModal').addEventListener('click', closeModal);
  document.getElementById('addPricingItem').addEventListener('click', addPricingItem);
  document.getElementById('previewSummaryBtn').addEventListener('click', handlePreview);
  document.getElementById('generateSummaryBtn').addEventListener('click', handleGenerate);

  // Close on overlay click
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      closeModal();
    }
  });

  // Add initial pricing item
  addPricingItem();
}

/**
 * Populate session information
 */
function populateSessionInfo(sessionData) {
  const sessionNameInput = document.getElementById('summarySessionName');
  if (sessionNameInput) {
    sessionNameInput.value = sessionData.sessionName || 'Heating System Assessment';
  }

  // Auto-populate overall price if materials exist
  if (sessionData.materials && Array.isArray(sessionData.materials)) {
    let totalPrice = 0;
    sessionData.materials.forEach(material => {
      if (material.selling_price_gbp) {
        totalPrice += parseFloat(material.selling_price_gbp);
      }
    });

    if (totalPrice > 0) {
      const priceInput = document.getElementById('summaryOverallPrice');
      if (priceInput && !priceInput.value) {
        priceInput.value = totalPrice.toFixed(2);
      }
    }
  }
}

/**
 * Add a pricing item row
 */
function addPricingItem() {
  const itemsList = document.getElementById('pricingItemsList');
  const itemCount = itemsList.children.length;

  const itemHTML = `
    <div class="pricing-item" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
      <input type="text" class="pricing-item-description" placeholder="Item description" style="flex: 2; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" />
      <input type="number" class="pricing-item-price" placeholder="Price" min="0" step="0.01" style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 8px;" />
      <button class="remove-item-btn" style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 8px; cursor: pointer;">×</button>
    </div>
  `;

  itemsList.insertAdjacentHTML('beforeend', itemHTML);

  // Add remove listener to the new button
  const items = itemsList.querySelectorAll('.pricing-item');
  const newItem = items[items.length - 1];
  const removeBtn = newItem.querySelector('.remove-item-btn');
  removeBtn.addEventListener('click', () => {
    newItem.remove();
  });
}

/**
 * Collect all form data
 */
function collectFormData() {
  // Session info
  const sessionName = document.getElementById('summarySessionName').value.trim();
  const customerName = document.getElementById('summaryCustomerName').value.trim();
  const propertyType = document.getElementById('summaryPropertyType').value;
  const what3words = document.getElementById('summaryWhat3words').value.trim();

  // Pricing
  const overallPrice = parseFloat(document.getElementById('summaryOverallPrice').value) || 0;
  const pricingItems = [];

  document.querySelectorAll('.pricing-item').forEach(item => {
    const description = item.querySelector('.pricing-item-description').value.trim();
    const price = parseFloat(item.querySelector('.pricing-item-price').value) || 0;

    if (description && price > 0) {
      pricingItems.push({ description, price });
    }
  });

  // Finance
  const financeTerm = document.getElementById('summaryFinanceTerm').value;

  // HomeCare
  const currentHomeCareCost = parseFloat(document.getElementById('summaryCurrentHomeCareCost').value) || 300;
  const proposedHomeCareCost = parseFloat(document.getElementById('summaryProposedCover').value) || 25;

  return {
    sessionName: sessionName || 'Heating System Assessment',
    customerName: customerName || undefined,
    propertyType: propertyType || undefined,
    what3words: what3words || undefined,
    totalPrice: overallPrice,
    pricingItems,
    financeTerm: parseInt(financeTerm),
    currentHomeCareCost,
    proposedHomeCareCost,
    sessionDate: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  };
}

/**
 * Show status message
 */
function showStatus(message, isError = false) {
  const statusEl = document.getElementById('summaryStatusMessage');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.style.display = 'block';
    statusEl.style.background = isError ? '#fee' : '#efe';
    statusEl.style.color = isError ? '#ef4444' : '#10b981';
    statusEl.style.border = `1px solid ${isError ? '#fcc' : '#cfc'}`;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 5000);
  }
}

/**
 * Handle preview button click
 */
async function handlePreview() {
  const previewBtn = document.getElementById('previewSummaryBtn');
  previewBtn.disabled = true;
  previewBtn.textContent = '⏳ Generating preview...';

  try {
    const formData = collectFormData();

    // Fetch additional data from database
    showStatus('Fetching technical data...', false);
    const dbData = await fetchPDFData(currentSessionData);

    // Combine all data
    const summaryData = {
      ...formData,
      ...dbData,
      sections: currentSessionData.sections || [],
      aiNotes: currentSessionData.aiNotes || '',
      issues: currentSessionData.issues || [],
      benefits: currentSessionData.benefits || []
    };

    // Generate preview
    await previewComprehensiveSummaryPDF(summaryData);
    showStatus('Preview opened in new tab!', false);
  } catch (error) {
    console.error('Preview error:', error);
    showStatus(`Error: ${error.message}`, true);
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = '👁️ Preview';
  }
}

/**
 * Handle generate button click
 */
async function handleGenerate() {
  const generateBtn = document.getElementById('generateSummaryBtn');
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Generating PDF...';

  try {
    const formData = collectFormData();

    // Validate
    if (formData.totalPrice <= 0 && formData.pricingItems.length === 0) {
      showStatus('Please enter at least one pricing item or overall price', true);
      generateBtn.disabled = false;
      generateBtn.textContent = '📥 Generate & Download';
      return;
    }

    // Fetch additional data from database
    showStatus('Fetching technical specifications...', false);
    const dbData = await fetchPDFData(currentSessionData);

    // Combine all data
    const summaryData = {
      ...formData,
      ...dbData,
      sections: currentSessionData.sections || [],
      aiNotes: currentSessionData.aiNotes || '',
      issues: currentSessionData.issues || [],
      benefits: currentSessionData.benefits || []
    };

    // Generate PDF
    showStatus('Creating PDF document...', false);
    const filename = await generateComprehensiveSummaryPDF(summaryData);

    showStatus(`✅ PDF generated successfully: ${filename}`, false);

    // Close modal after brief delay
    setTimeout(() => {
      closeModal();
    }, 2000);
  } catch (error) {
    console.error('Generation error:', error);
    showStatus(`Error generating PDF: ${error.message}`, true);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '📥 Generate & Download';
  }
}

/**
 * Close the modal
 */
export function closeModal() {
  if (modalElement) {
    modalElement.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Add CSS styles for the modal
const styles = `
<style>
#summaryDataModal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10100;
  align-items: center;
  justify-content: center;
}

#summaryDataModal.active {
  display: flex;
}

#summaryDataModal .modal-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.3s ease;
}

#summaryDataModal .modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 768px) {
  #summaryDataModal .modal-container {
    max-width: 95% !important;
    max-height: 95vh !important;
  }
}
</style>
`;

// Inject styles
if (typeof document !== 'undefined') {
  document.head.insertAdjacentHTML('beforeend', styles);
}
