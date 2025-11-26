/**
 * Checklist Search and Filter Enhancement
 */

// Checklist filter state
let checklistFilterState = {
  searchTerm: '',
  showCompletedOnly: false,
  showPendingOnly: false,
  selectedGroup: 'all'
};

/**
 * Initialize checklist search and filter UI
 * @param {HTMLElement} container - Container element for checklist
 */
export function initChecklistSearch(container) {
  if (!container) return;

  // Create search/filter UI
  const filterDiv = document.createElement('div');
  filterDiv.className = 'checklist-filter';
  filterDiv.style.cssText = 'margin-bottom: 12px; padding: 10px; background: #f8fafc; border-radius: 8px;';

  filterDiv.innerHTML = `
    <div style="margin-bottom: 8px;">
      <input
        type="text"
        id="checklistSearchInput"
        placeholder="Search checklist items..."
        style="width: 100%; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.75rem;"
      />
    </div>
    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
      <label style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="checkbox" id="filterCompleted" />
        <span>Completed only</span>
      </label>
      <label style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px; cursor: pointer;">
        <input type="checkbox" id="filterPending" />
        <span>Pending only</span>
      </label>
      <select id="filterGroup" style="font-size: 0.7rem; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 4px;">
        <option value="all">All groups</option>
      </select>
    </div>
  `;

  // Insert at the top of the container
  if (container.firstChild) {
    container.insertBefore(filterDiv, container.firstChild);
  } else {
    container.appendChild(filterDiv);
  }

  // Attach event listeners
  const searchInput = document.getElementById('checklistSearchInput');
  const filterCompleted = document.getElementById('filterCompleted');
  const filterPending = document.getElementById('filterPending');
  const filterGroup = document.getElementById('filterGroup');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      checklistFilterState.searchTerm = e.target.value.toLowerCase();
      applyChecklistFilters();
    });
  }

  if (filterCompleted) {
    filterCompleted.addEventListener('change', (e) => {
      checklistFilterState.showCompletedOnly = e.target.checked;
      if (e.target.checked && filterPending) {
        filterPending.checked = false;
        checklistFilterState.showPendingOnly = false;
      }
      applyChecklistFilters();
    });
  }

  if (filterPending) {
    filterPending.addEventListener('change', (e) => {
      checklistFilterState.showPendingOnly = e.target.checked;
      if (e.target.checked && filterCompleted) {
        filterCompleted.checked = false;
        checklistFilterState.showCompletedOnly = false;
      }
      applyChecklistFilters();
    });
  }

  if (filterGroup) {
    filterGroup.addEventListener('change', (e) => {
      checklistFilterState.selectedGroup = e.target.value;
      applyChecklistFilters();
    });
  }
}

/**
 * Populate group filter dropdown
 * @param {Array} checklistItems - Checklist items array
 */
export function populateGroupFilter(checklistItems) {
  const filterGroup = document.getElementById('filterGroup');
  if (!filterGroup) return;

  const groups = new Set();
  checklistItems.forEach(item => {
    if (item.group) {
      groups.add(item.group);
    }
  });

  const currentValue = filterGroup.value;
  filterGroup.innerHTML = '<option value="all">All groups</option>';

  Array.from(groups).sort().forEach(group => {
    const option = document.createElement('option');
    option.value = group;
    option.textContent = group;
    filterGroup.appendChild(option);
  });

  filterGroup.value = currentValue;
}

/**
 * Apply filters to checklist items
 */
function applyChecklistFilters() {
  const checklistItems = document.querySelectorAll('.checklist-item');

  checklistItems.forEach(item => {
    const label = item.querySelector('.label')?.textContent.toLowerCase() || '';
    const hint = item.querySelector('.hint')?.textContent.toLowerCase() || '';
    const group = item.dataset.group || '';
    const isDone = item.classList.contains('done');

    let show = true;

    // Search term filter
    if (checklistFilterState.searchTerm) {
      const searchMatch = label.includes(checklistFilterState.searchTerm) ||
                         hint.includes(checklistFilterState.searchTerm);
      show = show && searchMatch;
    }

    // Completed/Pending filter
    if (checklistFilterState.showCompletedOnly) {
      show = show && isDone;
    }
    if (checklistFilterState.showPendingOnly) {
      show = show && !isDone;
    }

    // Group filter
    if (checklistFilterState.selectedGroup !== 'all') {
      show = show && group === checklistFilterState.selectedGroup;
    }

    item.style.display = show ? '' : 'none';
  });

  // Update group headers visibility
  updateGroupHeadersVisibility();
}

/**
 * Update visibility of group headers based on filtered items
 */
function updateGroupHeadersVisibility() {
  const groupHeaders = document.querySelectorAll('.check-group-title');

  groupHeaders.forEach(header => {
    const group = header.dataset.group;
    const visibleItems = document.querySelectorAll(`.checklist-item[data-group="${group}"]:not([style*="display: none"])`);

    header.style.display = visibleItems.length > 0 ? '' : 'none';
  });
}

/**
 * Add group attribute to checklist items for filtering
 * @param {HTMLElement} item - Checklist item element
 * @param {string} group - Group name
 */
export function tagChecklistItem(item, group) {
  if (item && group) {
    item.dataset.group = group;
  }
}

/**
 * Reset all filters
 */
export function resetChecklistFilters() {
  checklistFilterState = {
    searchTerm: '',
    showCompletedOnly: false,
    showPendingOnly: false,
    selectedGroup: 'all'
  };

  const searchInput = document.getElementById('checklistSearchInput');
  const filterCompleted = document.getElementById('filterCompleted');
  const filterPending = document.getElementById('filterPending');
  const filterGroup = document.getElementById('filterGroup');

  if (searchInput) searchInput.value = '';
  if (filterCompleted) filterCompleted.checked = false;
  if (filterPending) filterPending.checked = false;
  if (filterGroup) filterGroup.value = 'all';

  applyChecklistFilters();
}

/**
 * Get filter statistics
 * @returns {Object} Filter statistics
 */
export function getFilterStats() {
  const allItems = document.querySelectorAll('.checklist-item');
  const visibleItems = document.querySelectorAll('.checklist-item:not([style*="display: none"])');

  return {
    total: allItems.length,
    visible: visibleItems.length,
    hidden: allItems.length - visibleItems.length
  };
}
