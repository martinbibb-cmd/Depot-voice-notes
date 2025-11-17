/**
 * Pack Selector Modal
 * Displays available core packs and allows user to select the appropriate one
 * before proceeding to quote building
 */

/**
 * Show the pack selector modal
 * @param {Array} pricebook - Full pricebook data
 * @param {Object} systemDetails - Detected system details
 * @param {Object} recommendedPack - Auto-selected pack (can be null)
 * @param {Function} onConfirm - Callback when user confirms selection (receives selected pack)
 * @param {Function} onCancel - Callback when user cancels
 */
export function showPackSelectorModal(pricebook, systemDetails, recommendedPack, onConfirm, onCancel) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  // Create modal content
  const modal = document.createElement('div');
  modal.className = 'pack-selector-modal';
  modal.style.cssText = `
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 900px;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;

  // Get all core packs from pricebook
  const allCorePacks = pricebook.filter(item =>
    item.section === 'Core Packs' && item.component_id
  );

  // Filter packs by system type
  const systemType = systemDetails.systemType || 'Full System';
  const relevantPacks = allCorePacks.filter(pack => {
    const subsection = pack.subsection || '';

    if (systemType === 'Part System') {
      return subsection.includes('Part System');
    } else {
      return subsection.includes('Full System');
    }
  });

  // Sort packs by price
  relevantPacks.sort((a, b) => {
    const priceA = parseFloat(a.selling_price_gbp) || 0;
    const priceB = parseFloat(b.selling_price_gbp) || 0;
    return priceA - priceB;
  });

  // Track selected pack
  let selectedPack = recommendedPack;

  // Build modal HTML
  modal.innerHTML = `
    <div style="padding: 30px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
        <h2 style="margin: 0; color: #333; font-size: 24px;">Select Core Pack</h2>
        <button id="packSelectorClose" style="
          background: none;
          border: none;
          font-size: 28px;
          cursor: pointer;
          color: #666;
          line-height: 1;
          padding: 0;
          width: 30px;
          height: 30px;
        ">&times;</button>
      </div>

      <!-- System Details -->
      <div style="
        background: #f5f5f5;
        padding: 15px;
        border-radius: 6px;
        margin-bottom: 20px;
        border-left: 4px solid #4CAF50;
      ">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">Detected System Details</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 14px;">
          <div>
            <strong>System Type:</strong> ${systemDetails.systemType || 'Full System'}
          </div>
          <div>
            <strong>Boiler Rating:</strong> ${systemDetails.boilerKw || 18} kW
          </div>
          ${systemDetails.isCombiToCombi ? '<div style="color: #2196F3;"><strong>Combi to Combi Replacement</strong></div>' : ''}
          ${systemDetails.isConventionalToCombi ? '<div style="color: #2196F3;"><strong>Conventional to Combi Replacement</strong></div>' : ''}
        </div>
      </div>

      <!-- Pack Selection Info -->
      <div style="margin-bottom: 15px;">
        <p style="margin: 0; color: #666; font-size: 14px;">
          Select the appropriate core pack for this installation. The recommended pack is highlighted based on the detected system details.
        </p>
      </div>

      <!-- Packs Table -->
      <div style="overflow-x: auto; margin-bottom: 20px;">
        <table id="packsTable" style="
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        ">
          <thead>
            <tr style="background: #f0f0f0; text-align: left;">
              <th style="padding: 12px; border-bottom: 2px solid #ddd; width: 40px;"></th>
              <th style="padding: 12px; border-bottom: 2px solid #ddd;">Component ID</th>
              <th style="padding: 12px; border-bottom: 2px solid #ddd;">Description</th>
              <th style="padding: 12px; border-bottom: 2px solid #ddd; text-align: right;">Price</th>
              <th style="padding: 12px; border-bottom: 2px solid #ddd; text-align: center;">Lead Time</th>
            </tr>
          </thead>
          <tbody id="packsTableBody">
          </tbody>
        </table>
      </div>

      ${relevantPacks.length === 0 ? `
        <div style="
          text-align: center;
          padding: 40px 20px;
          color: #666;
          background: #f9f9f9;
          border-radius: 6px;
          margin-bottom: 20px;
        ">
          <p style="margin: 0; font-size: 16px;">No core packs found for ${systemType}</p>
          <p style="margin: 10px 0 0 0; font-size: 14px;">You can proceed without a core pack or adjust system details.</p>
        </div>
      ` : ''}

      <!-- Action Buttons -->
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
        <button id="skipPackBtn" style="
          padding: 12px 24px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          color: #666;
        ">Skip Core Pack</button>
        <button id="cancelPackBtn" style="
          padding: 12px 24px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        ">Cancel</button>
        <button id="confirmPackBtn" style="
          padding: 12px 24px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        " ${relevantPacks.length === 0 ? 'disabled' : ''}>Continue with Selected Pack</button>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Populate packs table
  const tbody = modal.querySelector('#packsTableBody');
  relevantPacks.forEach(pack => {
    const isRecommended = recommendedPack && pack.component_id === recommendedPack.component_id;
    const row = document.createElement('tr');
    row.className = 'pack-row';
    row.style.cssText = `
      cursor: pointer;
      transition: background-color 0.2s;
      ${isRecommended ? 'background: #e8f5e9;' : ''}
    `;

    // Extract kW info from description
    const kwMatch = pack.description.match(/(\d+)kW/i);
    const kwInfo = kwMatch ? kwMatch[0] : '';

    row.innerHTML = `
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
        <input type="radio" name="packSelection" value="${pack.component_id}"
          ${isRecommended ? 'checked' : ''}
          style="cursor: pointer; width: 18px; height: 18px;">
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <strong>${pack.component_id}</strong>
        ${isRecommended ? '<span style="margin-left: 8px; background: #4CAF50; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">RECOMMENDED</span>' : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        ${pack.description}
        ${kwInfo ? `<br><span style="color: #2196F3; font-size: 12px; font-weight: 500;">${kwInfo}</span>` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right; font-weight: 500;">
        £${parseFloat(pack.selling_price_gbp).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
        ${pack.lead_time_days} day${pack.lead_time_days !== 1 ? 's' : ''}
      </td>
    `;

    // Click row to select
    row.addEventListener('click', () => {
      const radio = row.querySelector('input[type="radio"]');
      radio.checked = true;
      selectedPack = pack;

      // Update visual selection
      document.querySelectorAll('.pack-row').forEach(r => {
        r.style.background = '';
      });
      row.style.background = '#e3f2fd';
    });

    // Radio button change
    const radio = row.querySelector('input[type="radio"]');
    radio.addEventListener('change', () => {
      if (radio.checked) {
        selectedPack = pack;
        // Update visual selection
        document.querySelectorAll('.pack-row').forEach(r => {
          r.style.background = '';
        });
        row.style.background = '#e3f2fd';
      }
    });

    // Hover effect
    row.addEventListener('mouseenter', () => {
      if (row.style.background !== 'rgb(227, 242, 253)') { // Not selected
        row.style.background = '#f5f5f5';
      }
    });
    row.addEventListener('mouseleave', () => {
      const radio = row.querySelector('input[type="radio"]');
      if (!radio.checked) {
        const isRec = recommendedPack && pack.component_id === recommendedPack.component_id;
        row.style.background = isRec ? '#e8f5e9' : '';
      }
    });

    tbody.appendChild(row);
  });

  // Set initial selection highlight
  if (selectedPack) {
    const rows = Array.from(document.querySelectorAll('.pack-row'));
    const selectedRow = rows.find(row => {
      const radio = row.querySelector('input[type="radio"]');
      return radio && radio.checked;
    });
    if (selectedRow) {
      selectedRow.style.background = '#e3f2fd';
    }
  }

  // Event listeners
  const closeBtn = modal.querySelector('#packSelectorClose');
  const cancelBtn = modal.querySelector('#cancelPackBtn');
  const confirmBtn = modal.querySelector('#confirmPackBtn');
  const skipBtn = modal.querySelector('#skipPackBtn');

  const cleanup = () => {
    document.body.removeChild(overlay);
  };

  closeBtn.addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });

  cancelBtn.addEventListener('click', () => {
    cleanup();
    if (onCancel) onCancel();
  });

  confirmBtn.addEventListener('click', () => {
    cleanup();
    if (onConfirm) onConfirm(selectedPack);
  });

  skipBtn.addEventListener('click', () => {
    cleanup();
    if (onConfirm) onConfirm(null); // null means no pack selected
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cleanup();
      if (onCancel) onCancel();
    }
  });

  // Keyboard support
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      cleanup();
      if (onCancel) onCancel();
      document.removeEventListener('keydown', escHandler);
    }
  });
}
