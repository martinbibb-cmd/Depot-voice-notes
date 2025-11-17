/**
 * Quote Builder UI
 * Creates modal for reviewing and confirming quote items
 */

import { searchPricebook, calculateQuoteTotals } from './pricebook.js';

/**
 * Create and show quote builder modal
 */
export function showQuoteBuilderModal(pricebook, matchedItems, options = {}) {
  const {
    customerName = '',
    jobReference = '',
    onConfirm = null,
    onCancel = null,
    allowMultipleQuotes = false
  } = options;

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'quote-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 20px;
    overflow-y: auto;
  `;

  // Create modal content
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 1200px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `;

  // State for multiple quotes
  let quotes = [{ items: matchedItems, name: 'Quote 1' }];
  let currentQuoteIndex = 0;

  function renderModal() {
    const currentQuote = quotes[currentQuoteIndex];
    const totals = calculateQuoteTotals(currentQuote.items);

    modal.innerHTML = `
      <div style="padding: 30px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px;">
          <h2 style="margin: 0; color: #0f766e; font-size: 24px;">Quote Builder</h2>
          <button id="close-quote-modal" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #64748b; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>

        <!-- Customer Details -->
        <div style="margin-bottom: 25px; padding: 20px; background: #f8fafc; border-radius: 12px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
              <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #475569;">Customer Name</label>
              <input type="text" id="quote-customer-name" value="${escapeHtml(customerName)}"
                style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px;"
                placeholder="Enter customer name">
            </div>
            <div>
              <label style="display: block; font-weight: 600; margin-bottom: 5px; color: #475569;">Job Reference</label>
              <input type="text" id="quote-job-ref" value="${escapeHtml(jobReference)}"
                style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px;"
                placeholder="Enter job reference">
            </div>
          </div>
        </div>

        <!-- Multiple Quotes Tabs -->
        ${allowMultipleQuotes ? `
          <div style="margin-bottom: 25px;">
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
              ${quotes.map((q, idx) => `
                <button class="quote-tab ${idx === currentQuoteIndex ? 'active' : ''}" data-quote-idx="${idx}"
                  style="padding: 10px 20px; border: 2px solid ${idx === currentQuoteIndex ? '#0f766e' : '#cbd5e1'};
                  background: ${idx === currentQuoteIndex ? '#0f766e' : 'white'};
                  color: ${idx === currentQuoteIndex ? 'white' : '#475569'};
                  border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                  ${escapeHtml(q.name)}
                </button>
              `).join('')}
              ${quotes.length < 3 ? `
                <button id="add-quote-btn"
                  style="padding: 10px 20px; border: 2px dashed #cbd5e1; background: white; color: #64748b;
                  border-radius: 8px; cursor: pointer; font-weight: 600;">
                  + Add Quote Option
                </button>
              ` : ''}
            </div>
            <input type="text" id="quote-name-input" value="${escapeHtml(currentQuote.name)}"
              style="width: 300px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;"
              placeholder="Quote name">
          </div>
        ` : ''}

        <!-- Items Table -->
        <div style="margin-bottom: 25px; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Item</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; color: #475569;">Component ID</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569; width: 80px;">Qty</th>
                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; width: 100px;">Unit Price</th>
                <th style="padding: 12px; text-align: right; font-weight: 600; color: #475569; width: 100px;">Total</th>
                <th style="padding: 12px; text-align: center; font-weight: 600; color: #475569; width: 80px;">Action</th>
              </tr>
            </thead>
            <tbody id="quote-items-tbody">
              ${renderQuoteItems(currentQuote.items)}
            </tbody>
          </table>
        </div>

        <!-- Add Manual Item -->
        <div style="margin-bottom: 25px; padding: 15px; background: #f8fafc; border-radius: 12px;">
          <button id="add-manual-item-btn"
            style="padding: 10px 20px; border: 2px solid #0f766e; background: white; color: #0f766e;
            border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
            + Add Manual Item
          </button>
        </div>

        <!-- Totals -->
        <div style="margin-top: 30px; padding: 20px; background: #f8fafc; border-radius: 12px; border: 2px solid #0f766e;">
          <div style="display: flex; justify-content: flex-end; gap: 30px;">
            <div style="text-align: right;">
              <div style="margin-bottom: 10px;">
                <span style="color: #64748b; font-weight: 500;">Subtotal:</span>
                <span style="font-weight: 700; font-size: 18px; margin-left: 15px;">£${totals.subtotal}</span>
              </div>
              <div style="margin-bottom: 10px;">
                <span style="color: #64748b; font-weight: 500;">VAT (${totals.vatRate}):</span>
                <span style="font-weight: 700; font-size: 18px; margin-left: 15px;">£${totals.vat}</span>
              </div>
              <div style="border-top: 2px solid #cbd5e1; padding-top: 10px; margin-top: 10px;">
                <span style="color: #0f766e; font-weight: 700; font-size: 20px;">Total:</span>
                <span style="font-weight: 700; font-size: 24px; color: #0f766e; margin-left: 15px;">£${totals.total}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="margin-top: 30px; display: flex; gap: 15px; justify-content: flex-end; border-top: 2px solid #e5e7eb; padding-top: 20px;">
          <button id="cancel-quote-btn"
            style="padding: 12px 30px; border: 2px solid #cbd5e1; background: white; color: #64748b;
            border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; transition: all 0.2s;">
            Cancel
          </button>
          <button id="confirm-quote-btn"
            style="padding: 12px 30px; border: none; background: #0f766e; color: white;
            border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 16px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3);">
            Generate PDF Quote${quotes.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    `;

    attachEventListeners();
  }

  function renderQuoteItems(items) {
    return items.map((match, idx) => {
      const selected = match.selectedMatch;
      const isUnmatched = match.isUnmatched || !selected;
      const price = selected ? (parseFloat(selected.selling_price_gbp) || 0) : 0;
      const qty = parseInt(match.quantity) || 1;
      const total = price * qty;

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;" data-item-idx="${idx}">
          <td style="padding: 12px;">
            ${isUnmatched ? `
              <div style="color: #ef4444; font-weight: 600;">⚠ ${escapeHtml(match.material.item)}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">No match found - click to search</div>
            ` : `
              <div style="font-weight: 600; color: #1e293b;">${escapeHtml(selected.description)}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${escapeHtml(selected.section || '')}${selected.subsection ? ' - ' + selected.subsection : ''}</div>
            `}
            ${match.notes ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px; font-style: italic;">${escapeHtml(match.notes)}</div>` : ''}
          </td>
          <td style="padding: 12px;">
            <span style="font-family: monospace; color: #64748b;">${selected ? escapeHtml(selected.component_id) : 'N/A'}</span>
          </td>
          <td style="padding: 12px; text-align: center;">
            <input type="number" class="qty-input" data-item-idx="${idx}" value="${qty}" min="1" max="999"
              style="width: 60px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
          </td>
          <td style="padding: 12px; text-align: right; font-weight: 600;">
            £${price.toFixed(2)}
          </td>
          <td style="padding: 12px; text-align: right; font-weight: 700; color: #0f766e;">
            £${total.toFixed(2)}
          </td>
          <td style="padding: 12px; text-align: center;">
            <button class="change-item-btn" data-item-idx="${idx}"
              style="padding: 6px 12px; border: 1px solid #cbd5e1; background: white; color: #64748b;
              border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s;">
              ${isUnmatched ? 'Search' : 'Change'}
            </button>
            <button class="remove-item-btn" data-item-idx="${idx}"
              style="padding: 6px 12px; border: 1px solid #ef4444; background: white; color: #ef4444;
              border-radius: 6px; cursor: pointer; font-size: 12px; margin-left: 5px; transition: all 0.2s;">
              Remove
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function attachEventListeners() {
    // Close button
    document.getElementById('close-quote-modal')?.addEventListener('click', () => {
      overlay.remove();
      if (onCancel) onCancel();
    });

    // Cancel button
    document.getElementById('cancel-quote-btn')?.addEventListener('click', () => {
      overlay.remove();
      if (onCancel) onCancel();
    });

    // Confirm button
    document.getElementById('confirm-quote-btn')?.addEventListener('click', () => {
      const customerName = document.getElementById('quote-customer-name').value.trim();
      const jobRef = document.getElementById('quote-job-ref').value.trim();

      overlay.remove();

      if (onConfirm) {
        onConfirm({
          quotes,
          customerName,
          jobReference: jobRef
        });
      }
    });

    // Quantity inputs
    document.querySelectorAll('.qty-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.itemIdx);
        const newQty = parseInt(e.target.value) || 1;
        quotes[currentQuoteIndex].items[idx].quantity = newQty;
        renderModal();
      });
    });

    // Change item buttons
    document.querySelectorAll('.change-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.itemIdx);
        showItemSearchDialog(idx);
      });
    });

    // Remove item buttons
    document.querySelectorAll('.remove-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.itemIdx);
        if (confirm('Remove this item from the quote?')) {
          quotes[currentQuoteIndex].items.splice(idx, 1);
          renderModal();
        }
      });
    });

    // Add manual item
    document.getElementById('add-manual-item-btn')?.addEventListener('click', () => {
      showItemSearchDialog(-1);
    });

    // Quote tabs (if multiple quotes enabled)
    document.querySelectorAll('.quote-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        currentQuoteIndex = parseInt(e.target.dataset.quoteIdx);
        renderModal();
      });
    });

    // Add quote button
    document.getElementById('add-quote-btn')?.addEventListener('click', () => {
      quotes.push({
        items: JSON.parse(JSON.stringify(matchedItems)), // Deep copy
        name: `Quote ${quotes.length + 1}`
      });
      currentQuoteIndex = quotes.length - 1;
      renderModal();
    });

    // Quote name input
    document.getElementById('quote-name-input')?.addEventListener('change', (e) => {
      quotes[currentQuoteIndex].name = e.target.value || `Quote ${currentQuoteIndex + 1}`;
      renderModal();
    });
  }

  function showItemSearchDialog(itemIdx) {
    const searchDialog = document.createElement('div');
    searchDialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      z-index: 10001;
      width: 600px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
    `;

    searchDialog.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: #0f766e;">Search Pricebook</h3>
      <input type="text" id="item-search-input" placeholder="Search by description or component ID..."
        style="width: 100%; padding: 12px; border: 2px solid #cbd5e1; border-radius: 8px; font-size: 14px; margin-bottom: 15px;">
      <div id="search-results" style="max-height: 400px; overflow-y: auto;"></div>
      <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
        <button id="close-search-dialog"
          style="padding: 10px 20px; border: 2px solid #cbd5e1; background: white; color: #64748b;
          border-radius: 8px; cursor: pointer; font-weight: 600;">
          Close
        </button>
      </div>
    `;

    modal.appendChild(searchDialog);

    const searchInput = document.getElementById('item-search-input');
    const searchResults = document.getElementById('search-results');

    function performSearch() {
      const query = searchInput.value.trim();
      if (query.length < 2) {
        searchResults.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">Enter at least 2 characters to search</p>';
        return;
      }

      const results = searchPricebook(pricebook, query, 20);

      if (results.length === 0) {
        searchResults.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No items found</p>';
        return;
      }

      searchResults.innerHTML = results.map((item, idx) => `
        <div class="search-result-item" data-result-idx="${idx}"
          style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s;">
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(item.description)}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
            ${escapeHtml(item.component_id)} - ${escapeHtml(item.section || '')}${item.subsection ? ' - ' + item.subsection : ''}
          </div>
          <div style="font-weight: 600; color: #0f766e; margin-top: 4px;">£${parseFloat(item.selling_price_gbp || 0).toFixed(2)}</div>
        </div>
      `).join('');

      // Add click handlers to results
      searchResults.querySelectorAll('.search-result-item').forEach((el, idx) => {
        el.addEventListener('click', () => {
          const selectedItem = results[idx];

          if (itemIdx === -1) {
            // Add new item
            quotes[currentQuoteIndex].items.push({
              material: { item: selectedItem.description },
              pricebookMatches: [selectedItem],
              selectedMatch: selectedItem,
              quantity: 1,
              notes: '',
              isUnmatched: false
            });
          } else {
            // Update existing item
            quotes[currentQuoteIndex].items[itemIdx].selectedMatch = selectedItem;
            quotes[currentQuoteIndex].items[itemIdx].pricebookMatches = [selectedItem];
            quotes[currentQuoteIndex].items[itemIdx].isUnmatched = false;
          }

          searchDialog.remove();
          renderModal();
        });

        el.addEventListener('mouseenter', () => {
          el.style.background = '#f8fafc';
          el.style.borderColor = '#0f766e';
        });

        el.addEventListener('mouseleave', () => {
          el.style.background = 'white';
          el.style.borderColor = '#e5e7eb';
        });
      });
    }

    searchInput.addEventListener('input', performSearch);
    searchInput.focus();

    document.getElementById('close-search-dialog').addEventListener('click', () => {
      searchDialog.remove();
    });
  }

  renderModal();
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
