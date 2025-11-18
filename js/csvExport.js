/**
 * CSV Export Utility
 * Handles conversion of various data structures to CSV format
 */

/**
 * Escape CSV field value
 * @param {string} value - The value to escape
 * @returns {string} - Properly escaped CSV value
 */
function escapeCSVValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If contains comma, newline, or quotes, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Convert sections array to CSV
 * @param {Array} sections - Array of section objects
 * @returns {string} - CSV formatted string
 */
export function sectionsToCSV(sections) {
  if (!sections || sections.length === 0) {
    return '';
  }

  // Determine columns based on first object
  const firstSection = sections[0];
  const columns = Object.keys(firstSection);

  // Create header row
  const header = columns.map(escapeCSVValue).join(',');

  // Create data rows
  const rows = sections.map(section => {
    return columns.map(col => escapeCSVValue(section[col])).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Convert depot notes export to CSV
 * @param {Object} payload - The export payload with exportedAt and sections
 * @returns {string} - CSV formatted string
 */
export function depotNotesToCSV(payload) {
  const lines = [];

  // Add metadata header
  lines.push('# Depot Notes Export');
  lines.push(`# Exported At: ${payload.exportedAt}`);
  lines.push('');

  // Add sections data
  if (payload.sections && payload.sections.length > 0) {
    lines.push(sectionsToCSV(payload.sections));
  }

  return lines.join('\n');
}

/**
 * Convert session data to CSV (multiple CSV files structure)
 * @param {Object} session - The session object
 * @returns {Object} - Object with multiple CSV files {sections, materials, checkedItems, etc.}
 */
export function sessionToMultipleCSVs(session) {
  const csvs = {};

  // Main info CSV
  const mainInfo = [
    ['Field', 'Value'],
    ['Version', session.version],
    ['Created At', session.createdAt],
    ['Full Transcript', escapeCSVValue(session.fullTranscript)],
    ['Customer Summary', escapeCSVValue(session.customerSummary)],
    ['Has Audio', session.audioBase64 ? 'Yes' : 'No']
  ];
  csvs.info = mainInfo.map(row => row.join(',')).join('\n');

  // Sections CSV
  if (session.sections && session.sections.length > 0) {
    csvs.sections = sectionsToCSV(session.sections);
  }

  // Materials CSV
  if (session.materials && session.materials.length > 0) {
    csvs.materials = sectionsToCSV(session.materials);
  }

  // Checked Items CSV
  if (session.checkedItems && Object.keys(session.checkedItems).length > 0) {
    const checkedRows = [['Item', 'Checked']];
    Object.entries(session.checkedItems).forEach(([key, value]) => {
      checkedRows.push([escapeCSVValue(key), value ? 'Yes' : 'No']);
    });
    csvs.checkedItems = checkedRows.map(row => row.join(',')).join('\n');
  }

  // Missing Info CSV
  if (session.missingInfo && session.missingInfo.length > 0) {
    const missingRows = [['Missing Information']];
    session.missingInfo.forEach(item => {
      missingRows.push([escapeCSVValue(item)]);
    });
    csvs.missingInfo = missingRows.map(row => row.join(',')).join('\n');
  }

  return csvs;
}

/**
 * Convert session to a single consolidated CSV
 * @param {Object} session - The session object
 * @returns {string} - Single CSV with all data
 */
export function sessionToSingleCSV(session) {
  const lines = [];

  lines.push('# Depot Voice Session Export');
  lines.push(`# Version: ${session.version}`);
  lines.push(`# Created At: ${session.createdAt}`);
  lines.push('');

  // Sections
  if (session.sections && session.sections.length > 0) {
    lines.push('# SECTIONS');
    lines.push(sectionsToCSV(session.sections));
    lines.push('');
  }

  // Materials
  if (session.materials && session.materials.length > 0) {
    lines.push('# MATERIALS');
    lines.push(sectionsToCSV(session.materials));
    lines.push('');
  }

  // Checked Items
  if (session.checkedItems && Object.keys(session.checkedItems).length > 0) {
    lines.push('# CHECKED ITEMS');
    lines.push('Item,Checked');
    Object.entries(session.checkedItems).forEach(([key, value]) => {
      lines.push(`${escapeCSVValue(key)},${value ? 'Yes' : 'No'}`);
    });
    lines.push('');
  }

  // Missing Info
  if (session.missingInfo && session.missingInfo.length > 0) {
    lines.push('# MISSING INFORMATION');
    lines.push('Missing Information');
    session.missingInfo.forEach(item => {
      lines.push(escapeCSVValue(item));
    });
    lines.push('');
  }

  // Customer Summary
  if (session.customerSummary) {
    lines.push('# CUSTOMER SUMMARY');
    lines.push('Summary');
    lines.push(escapeCSVValue(session.customerSummary));
    lines.push('');
  }

  // Full Transcript
  if (session.fullTranscript) {
    lines.push('# FULL TRANSCRIPT');
    lines.push('Transcript');
    lines.push(escapeCSVValue(session.fullTranscript));
  }

  return lines.join('\n');
}

/**
 * Convert automatic/AI notes to CSV
 * @param {Object} data - The notes data object
 * @returns {string} - CSV formatted string
 */
export function notesToCSV(data) {
  const lines = [];

  lines.push(`# ${data.type === 'automatic_notes' ? 'Automatic' : 'AI'} Notes Export`);
  lines.push(`# Timestamp: ${data.timestamp}`);
  lines.push('');

  if (data.sections && data.sections.length > 0) {
    lines.push(sectionsToCSV(data.sections));
  } else if (data.notes && data.notes.length > 0) {
    lines.push(sectionsToCSV(data.notes));
  }

  return lines.join('\n');
}

/**
 * Download data as CSV file
 * @param {string} csvContent - The CSV content
 * @param {string} filename - The filename (without extension)
 */
export function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get export format preference from localStorage
 * @returns {string} - 'json' or 'csv'
 */
export function getExportFormat() {
  return localStorage.getItem('exportFormat') || 'json';
}

/**
 * Set export format preference in localStorage
 * @param {string} format - 'json' or 'csv'
 */
export function setExportFormat(format) {
  localStorage.setItem('exportFormat', format);
}
