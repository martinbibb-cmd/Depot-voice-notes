/**
 * Customer-Facing Proposal Generator
 *
 * Generates a 4-page A4 PDF proposal combining:
 * - Session data (customer info, transcript, property details)
 * - System recommendation JSON (Gold/Silver/Bronze options with detailed specs)
 *
 * Page structure:
 * 1. Your Home & What You Told Us
 * 2. Gold Option (Recommended)
 * 3. Silver & Bronze Options
 * 4. What Happens Next & Important Notes
 */

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Get session data from app state or localStorage
 */
function getSessionData() {
  // Priority 1: Live app state
  const appState = window.__depotAppState || {};

  if (appState.customerName || appState.fullTranscript) {
    return {
      customerName: appState.customerName || 'Valued Customer',
      customerAddress: appState.customerAddress || '',
      propertyType: appState.propertyType || '',
      currentSystem: appState.currentSystem || '',
      propertySummary: appState.propertySummary || '',
      sections: appState.sections || [],
      notes: appState.notes || [],
      transcript: appState.fullTranscript || '',
      customerSummary: appState.customerSummary || ''
    };
  }

  // Priority 2: localStorage fallback
  const autosave = localStorage.getItem('surveyBrainAutosave');
  if (autosave) {
    try {
      const data = JSON.parse(autosave);
      return {
        customerName: data.customerName || 'Valued Customer',
        customerAddress: data.customerAddress || '',
        propertyType: data.propertyType || '',
        currentSystem: data.currentSystem || '',
        propertySummary: data.propertySummary || '',
        sections: data.sections || [],
        notes: data.notes || [],
        transcript: data.fullTranscript || localStorage.getItem('dvn_transcript') || '',
        customerSummary: data.customerSummary || ''
      };
    } catch (e) {
      console.warn('Failed to parse surveyBrainAutosave:', e);
    }
  }

  // Fallback to basic transcript
  return {
    customerName: 'Valued Customer',
    customerAddress: '',
    propertyType: '',
    currentSystem: '',
    propertySummary: '',
    sections: [],
    notes: [],
    transcript: localStorage.getItem('dvn_transcript') || '',
    customerSummary: ''
  };
}

/**
 * Load system recommendation JSON from localStorage
 */
function loadSystemRecommendationJson() {
  const raw = localStorage.getItem('dvn_system_recommendation');
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse system recommendation JSON:', e);
    return null;
  }
}

/**
 * Extract customer priorities from transcript and session data
 */
function extractCustomerPriorities(sessionData) {
  const priorities = [];
  const transcript = sessionData.transcript || '';
  const notes = sessionData.notes || [];

  // Extract from notes
  notes.forEach(note => {
    if (note && note.trim().length > 10) {
      priorities.push(note.trim());
    }
  });

  // If we have few priorities, extract from transcript using keyword matching
  if (priorities.length < 3 && transcript) {
    const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);

    const keywords = [
      /slow to heat/i,
      /run out of/i,
      /not enough/i,
      /cold/i,
      /control/i,
      /efficient|efficiency|waste|wasting/i,
      /disruption|mess/i,
      /noise|noisy/i,
      /pressure/i,
      /shower/i,
      /bathroom/i,
      /hot water/i
    ];

    sentences.forEach(sentence => {
      if (keywords.some(kw => kw.test(sentence)) && priorities.length < 6) {
        // Clean up and add
        const cleaned = sentence.replace(/^(and|but|so|well|um|uh)\s+/i, '').trim();
        if (cleaned.length > 15 && cleaned.length < 150) {
          priorities.push(cleaned);
        }
      }
    });
  }

  return priorities.slice(0, 6);
}

/**
 * Get property summary bullets
 */
function getPropertySummary(sessionData, sysRec) {
  const bullets = [];

  // Home type
  if (sessionData.propertyType) {
    bullets.push(`Home type: ${sessionData.propertyType}`);
  } else if (sysRec?.inputs?.houseType) {
    bullets.push(`Home type: ${sysRec.inputs.houseType}`);
  }

  // Current system
  if (sessionData.currentSystem) {
    bullets.push(`Hot water setup today: ${sessionData.currentSystem}`);
  } else if (sysRec?.inputs?.currentBoiler || sysRec?.inputs?.currentWater) {
    const boiler = sysRec.inputs.currentBoiler || '';
    const water = sysRec.inputs.currentWater || '';
    bullets.push(`Hot water setup today: ${boiler} ${water}`.trim());
  }

  // Bathrooms
  if (sysRec?.inputs?.bathrooms) {
    const count = sysRec.inputs.bathrooms;
    bullets.push(`Bathrooms: ${count} ${count === 1 ? 'bathroom' : 'bathrooms'}`);
  }

  // Household
  if (sysRec?.inputs?.occupants) {
    const occ = sysRec.inputs.occupants;
    const usage = occ >= 4 ? 'busy morning/evening hot water use' : 'regular hot water use';
    bullets.push(`Household: ${occ} ${occ === 1 ? 'person' : 'people'} – ${usage}`);
  }

  // Mains pressure (if available)
  if (sysRec?.inputs?.mainsPressure && sysRec.inputs.mainsPressure > 0) {
    bullets.push(`Mains pressure: ${sysRec.inputs.mainsPressure.toFixed(1)} bar`);
  }

  return bullets;
}

// ============================================================================
// PDF STYLING & LAYOUT HELPERS
// ============================================================================

const COLORS = {
  primary: '#2563eb',      // Blue
  gold: '#d97706',         // Amber
  silver: '#64748b',       // Slate
  bronze: '#92400e',       // Brown
  text: '#1f2937',         // Dark gray
  textLight: '#6b7280',    // Mid gray
  border: '#e5e7eb',       // Light gray
  bgLight: '#f9fafb',      // Very light gray
  green: '#059669'         // Success green
};

const LAYOUT = {
  margin: 20,
  pageWidth: 210,  // A4 width in mm
  pageHeight: 297, // A4 height in mm
  lineHeight: 1.5,
  sectionGap: 8
};

/**
 * Add page header with title and customer info
 */
function addPageHeader(doc, pageNum, customerName, date) {
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 0, LAYOUT.pageWidth, 15, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Your Heating & Hot Water Proposal', LAYOUT.margin, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Page ${pageNum}`, LAYOUT.pageWidth - LAYOUT.margin, 10, { align: 'right' });

  // Subheading
  doc.setTextColor(COLORS.text);
  doc.setFontSize(10);
  doc.text(`Prepared for ${customerName} – ${date}`, LAYOUT.margin, 22);

  return 30; // Return Y position after header
}

/**
 * Add section title
 */
function addSectionTitle(doc, title, y, color = COLORS.primary) {
  doc.setFillColor(color);
  doc.rect(LAYOUT.margin - 2, y - 5, 4, 8, 'F');

  doc.setTextColor(COLORS.text);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, LAYOUT.margin + 5, y);

  return y + 8;
}

/**
 * Add badge (Gold/Silver/Bronze)
 */
function addBadge(doc, label, x, y, color) {
  doc.setFillColor(color);
  doc.roundedRect(x, y - 4, 35, 6, 1, 1, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(label.toUpperCase(), x + 17.5, y, { align: 'center' });
}

/**
 * Add bullet list
 */
function addBulletList(doc, items, y, maxWidth, indent = 0) {
  doc.setTextColor(COLORS.text);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  let currentY = y;
  const bulletX = LAYOUT.margin + indent;
  const textX = bulletX + 5;

  items.forEach(item => {
    // Check if we need a new page
    if (currentY > LAYOUT.pageHeight - 30) {
      return; // Skip if too close to bottom
    }

    // Bullet point
    doc.circle(bulletX + 1, currentY - 1.5, 0.8, 'F');

    // Wrap text
    const lines = doc.splitTextToSize(item, maxWidth - indent - 5);
    doc.text(lines, textX, currentY);

    currentY += lines.length * 5;
  });

  return currentY;
}

/**
 * Add checkmark list (for benefits)
 */
function addCheckmarkList(doc, items, y, maxWidth) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  let currentY = y;

  items.forEach(item => {
    if (currentY > LAYOUT.pageHeight - 30) {
      return;
    }

    // Checkmark
    doc.setTextColor(COLORS.green);
    doc.text('✓', LAYOUT.margin, currentY);

    // Text
    doc.setTextColor(COLORS.text);
    const lines = doc.splitTextToSize(item, maxWidth - 10);
    doc.text(lines, LAYOUT.margin + 6, currentY);

    currentY += lines.length * 5;
  });

  return currentY;
}

/**
 * Add highlight box
 */
function addHighlightBox(doc, title, content, y, bgColor = COLORS.bgLight) {
  const boxHeight = 20;
  const boxWidth = LAYOUT.pageWidth - (LAYOUT.margin * 2);

  doc.setFillColor(bgColor);
  doc.roundedRect(LAYOUT.margin, y, boxWidth, boxHeight, 2, 2, 'F');

  doc.setTextColor(COLORS.text);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(title, LAYOUT.margin + 3, y + 5);

  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(content, boxWidth - 6);
  doc.text(lines, LAYOUT.margin + 3, y + 11);

  return y + boxHeight + 5;
}

/**
 * Add divider line
 */
function addDivider(doc, y) {
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(LAYOUT.margin, y, LAYOUT.pageWidth - LAYOUT.margin, y);
  return y + 3;
}

// ============================================================================
// PAGE 1: YOUR HOME & WHAT YOU TOLD US
// ============================================================================

function generatePage1(doc, sessionData, sysRec) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  let y = addPageHeader(doc, 1, sessionData.customerName, date);
  y += 5;

  // Section 1: Your Home at a Glance
  y = addSectionTitle(doc, 'Your Home at a Glance', y);

  const propertySummary = getPropertySummary(sessionData, sysRec);
  if (propertySummary.length > 0) {
    y = addBulletList(doc, propertySummary, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    y += 3;

    doc.setTextColor(COLORS.textLight);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('This summary helps us match your system to how your home is actually used.',
      LAYOUT.margin, y);
    y += 10;
  }

  // Section 2: What You Told Us
  y = addSectionTitle(doc, 'What Matters Most to You', y);

  const priorities = extractCustomerPriorities(sessionData);
  if (priorities.length > 0) {
    // Format as quoted priorities
    const formattedPriorities = priorities.map(p => `"${p}"`);
    y = addBulletList(doc, formattedPriorities, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    y += 5;

    doc.setTextColor(COLORS.text);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('The options on the next pages are built around these priorities.',
      LAYOUT.margin, y);
    y += 12;
  }

  // Section 3: Our Overall Recommendation
  y = addSectionTitle(doc, 'Our Recommendation', y);

  const goldOption = sysRec?.options?.[0];
  if (goldOption) {
    let recommendation = sysRec.reasoningSummary ||
      `Based on your home, hot-water use and current system, we recommend a ${goldOption.title} as the best balance of comfort, running cost and future-proofing.`;

    // Add Mixergy note if applicable
    if (goldOption.water === 'mixergy_unvented' || goldOption.water === 'mixergy_open') {
      recommendation += '\n\nA smart cylinder such as Mixergy lets you heat only what you need, with app control and good options for future solar panels or a heat pump.';
    }

    y = addHighlightBox(doc, 'Our recommendation:', recommendation, y, '#e0f2fe');
  }
}

// ============================================================================
// PAGE 2: GOLD OPTION (RECOMMENDED)
// ============================================================================

function generatePage2(doc, sessionData, sysRec) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  doc.addPage();
  let y = addPageHeader(doc, 2, sessionData.customerName, date);
  y += 5;

  const goldOption = sysRec?.options?.[0];
  if (!goldOption) {
    doc.setTextColor(COLORS.textLight);
    doc.setFontSize(11);
    doc.text('No system recommendation available.', LAYOUT.margin, y);
    return;
  }

  // Badge
  addBadge(doc, 'GOLD – RECOMMENDED', LAYOUT.margin, y + 5, COLORS.gold);
  y += 12;

  // Title
  doc.setTextColor(COLORS.text);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(goldOption.title, LAYOUT.pageWidth - (LAYOUT.margin * 2));
  doc.text(titleLines, LAYOUT.margin, y);
  y += titleLines.length * 6 + 3;

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(COLORS.textLight);
  doc.text('Best balance of strong hot water performance, efficiency and future-readiness for your home.',
    LAYOUT.margin, y);
  y += 10;

  // Key Benefits
  y = addSectionTitle(doc, 'Key Benefits', y, COLORS.gold);

  const benefits = goldOption.pros || [];
  if (benefits.length > 0) {
    y = addCheckmarkList(doc, benefits.slice(0, 6), y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    y += 8;
  }

  // At a Glance – Spec Summary
  y = addSectionTitle(doc, 'At a Glance – Spec Summary', y, COLORS.gold);

  const specs = [];
  specs.push(`Boiler: ${goldOption.boilerLabel || goldOption.boiler}`);
  specs.push(`Hot water cylinder: ${goldOption.waterLabel || goldOption.water}`);

  if (goldOption.profile) {
    if (goldOption.profile.space) specs.push(`Space: ${goldOption.profile.space}`);
    if (goldOption.profile.efficiency) specs.push(`Efficiency: ${goldOption.profile.efficiency}`);
  }

  y = addBulletList(doc, specs, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
  y += 8;

  // Mixergy note if applicable
  if (goldOption.water === 'mixergy_unvented' || goldOption.water === 'mixergy_open') {
    doc.setFillColor('#fef3c7');
    doc.roundedRect(LAYOUT.margin, y, LAYOUT.pageWidth - (LAYOUT.margin * 2), 18, 2, 2, 'F');

    doc.setTextColor(COLORS.text);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('About Mixergy:', LAYOUT.margin + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    const mixergyText = 'Mixergy is a smart hot water cylinder – it measures the hot water inside and only heats what you need, with clear app control and energy-saving modes.';
    const mixLines = doc.splitTextToSize(mixergyText, LAYOUT.pageWidth - (LAYOUT.margin * 2) - 6);
    doc.text(mixLines, LAYOUT.margin + 3, y + 11);

    y += 22;
  }

  // Why this suits your home
  y = addSectionTitle(doc, 'Why This Suits Your Home', y, COLORS.gold);

  const whySuitable = [];

  // Extract from strengths or best-for
  if (goldOption.profile?.strengths && goldOption.profile.strengths.length > 0) {
    whySuitable.push(...goldOption.profile.strengths.slice(0, 3));
  }

  if (whySuitable.length < 3 && goldOption.profile?.bestFor) {
    whySuitable.push(goldOption.profile.bestFor);
  }

  if (whySuitable.length > 0) {
    y = addBulletList(doc, whySuitable, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
  }
}

// ============================================================================
// PAGE 3: SILVER & BRONZE OPTIONS
// ============================================================================

function generatePage3(doc, sessionData, sysRec) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  doc.addPage();
  let y = addPageHeader(doc, 3, sessionData.customerName, date);
  y += 5;

  const silverOption = sysRec?.options?.[1];
  const bronzeOption = sysRec?.options?.[2];

  // ==================== SILVER OPTION ====================
  if (silverOption) {
    addBadge(doc, 'SILVER', LAYOUT.margin, y + 5, COLORS.silver);
    y += 12;

    // Title
    doc.setTextColor(COLORS.text);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const silverTitleLines = doc.splitTextToSize(silverOption.title, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    doc.text(silverTitleLines, LAYOUT.margin, y);
    y += silverTitleLines.length * 6 + 3;

    // Subtitle
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(COLORS.textLight);
    const silverSubtitle = silverOption.profile?.bestFor || 'Strong performance while keeping cost and disruption balanced.';
    doc.text(silverSubtitle, LAYOUT.margin, y);
    y += 8;

    // Key Benefits
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.text);
    doc.text('Key Benefits', LAYOUT.margin, y);
    y += 6;

    const silverBenefits = silverOption.pros?.slice(0, 4) || [];
    if (silverBenefits.length > 0) {
      y = addBulletList(doc, silverBenefits, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
      y += 6;
    }

    // Best For
    doc.setFont('helvetica', 'bold');
    doc.text('Best for', LAYOUT.margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    const silverBestFor = silverOption.profile?.bestFor ||
      'Homes wanting better efficiency and reliability while keeping cost and disruption lower than the Gold option.';
    const silverBestLines = doc.splitTextToSize(silverBestFor, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    doc.text(silverBestLines, LAYOUT.margin, y);
    y += silverBestLines.length * 5 + 10;

    // Divider
    y = addDivider(doc, y);
    y += 5;
  }

  // ==================== BRONZE OPTION ====================
  if (bronzeOption) {
    addBadge(doc, 'BRONZE', LAYOUT.margin, y + 5, COLORS.bronze);
    y += 12;

    // Title
    doc.setTextColor(COLORS.text);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const bronzeTitleLines = doc.splitTextToSize(bronzeOption.title, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    doc.text(bronzeTitleLines, LAYOUT.margin, y);
    y += bronzeTitleLines.length * 6 + 3;

    // Subtitle
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(COLORS.textLight);
    const bronzeSubtitle = 'Lowest upfront cost with minimal disruption, keeping the system broadly as it is today.';
    doc.text(bronzeSubtitle, LAYOUT.margin, y);
    y += 8;

    // Key Benefits
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.text);
    doc.text('Key Benefits', LAYOUT.margin, y);
    y += 6;

    const bronzeBenefits = bronzeOption.pros?.slice(0, 4) || [];
    if (bronzeBenefits.length > 0) {
      y = addBulletList(doc, bronzeBenefits, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
      y += 6;
    }

    // Best For
    doc.setFont('helvetica', 'bold');
    doc.text('Best for', LAYOUT.margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    const bronzeBestFor = bronzeOption.profile?.bestFor ||
      'Homes focused on keeping initial cost and disruption down, happy to keep a similar level of hot water performance.';
    const bronzeBestLines = doc.splitTextToSize(bronzeBestFor, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    doc.text(bronzeBestLines, LAYOUT.margin, y);
    y += bronzeBestLines.length * 5 + 10;
  }

  // Recommendation nudge at bottom
  if (y < LAYOUT.pageHeight - 40) {
    y = addDivider(doc, y);
    y += 5;

    doc.setFillColor('#f0fdf4');
    doc.roundedRect(LAYOUT.margin, y, LAYOUT.pageWidth - (LAYOUT.margin * 2), 12, 2, 2, 'F');

    doc.setTextColor(COLORS.text);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const nudgeText = 'We recommend the Gold option where budget allows, but all options are designed to be safe, compliant and appropriate for your home.';
    const nudgeLines = doc.splitTextToSize(nudgeText, LAYOUT.pageWidth - (LAYOUT.margin * 2) - 6);
    doc.text(nudgeLines, LAYOUT.margin + 3, y + 6);
  }
}

// ============================================================================
// PAGE 4: WHAT HAPPENS NEXT & IMPORTANT NOTES
// ============================================================================

function generatePage4(doc, sessionData) {
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  doc.addPage();
  let y = addPageHeader(doc, 4, sessionData.customerName, date);
  y += 5;

  // What Happens Next
  y = addSectionTitle(doc, 'What Happens Next', y, COLORS.primary);

  const steps = [
    '1. Confirm your preferred option\nWe'll agree which option suits you best and answer any questions.',

    '2. Arrange a survey/installation date\nAn engineer visit is booked at a time that works for you.',

    '3. Engineer checks & final details\nOn the day, they'll confirm measurements, flue route and any details before starting work.',

    '4. Installation & handover\nSystem is installed, tested and we show you how to use the controls.'
  ];

  doc.setTextColor(COLORS.text);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  steps.forEach(step => {
    const lines = doc.splitTextToSize(step, LAYOUT.pageWidth - (LAYOUT.margin * 2));
    doc.text(lines, LAYOUT.margin, y);
    y += lines.length * 5 + 5;
  });

  y += 8;

  // Important Notes
  y = addSectionTitle(doc, 'Important Notes', y, COLORS.primary);

  const notes = [
    'All options are subject to a final safety and suitability check by the installing engineer.',

    'Any extra works (for example unexpected pipework or electrical issues) will be discussed and agreed with you before going ahead.',

    'Running-cost savings depend on how you use heating and hot water and on future energy prices.',

    'Installations typically come with manufacturer warranties – we'll provide full details when you confirm your chosen option.',

    'All work will be carried out to current Building Regulations and industry standards.'
  ];

  y = addBulletList(doc, notes, y, LAYOUT.pageWidth - (LAYOUT.margin * 2));
  y += 10;

  // Final message
  if (y < LAYOUT.pageHeight - 30) {
    doc.setFillColor('#fef3c7');
    doc.roundedRect(LAYOUT.margin, y, LAYOUT.pageWidth - (LAYOUT.margin * 2), 15, 2, 2, 'F');

    doc.setTextColor(COLORS.text);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const finalText = 'If anything in this proposal doesn't feel right for your home, please tell us – we'd rather adjust the plan now than install the wrong thing.';
    const finalLines = doc.splitTextToSize(finalText, LAYOUT.pageWidth - (LAYOUT.margin * 2) - 6);
    doc.text(finalLines, LAYOUT.margin + 3, y + 6);
  }
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export function generateCustomerProposal() {
  try {
    // Load data
    const sessionData = getSessionData();
    const sysRec = loadSystemRecommendationJson();

    if (!sysRec || !sysRec.options || sysRec.options.length === 0) {
      alert('⚠️ No system recommendation found.\n\nPlease import or generate a system recommendation first using the "🎯 System Rec" button.');
      return;
    }

    // Create PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Generate pages
    generatePage1(doc, sessionData, sysRec);
    generatePage2(doc, sessionData, sysRec);
    generatePage3(doc, sessionData, sysRec);
    generatePage4(doc, sessionData);

    // Download
    const filename = `Customer_Proposal_${sessionData.customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    console.log('✅ Customer proposal generated successfully');

  } catch (error) {
    console.error('Failed to generate customer proposal:', error);
    alert('❌ Failed to generate proposal.\n\n' + error.message);
  }
}

// ============================================================================
// UI BUTTON INITIALIZATION
// ============================================================================

export function initCustomerProposalButton() {
  const toolbar = document.querySelector('.toolbar-row');
  if (!toolbar) {
    console.warn('Toolbar not found, cannot add customer proposal button');
    return;
  }

  // Check if button already exists
  if (document.getElementById('customerProposalBtn')) {
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'customerProposalBtn';
  btn.className = 'pill-secondary';
  btn.innerHTML = '📄 Customer Proposal';
  btn.title = 'Generate 4-page customer-facing proposal (requires system recommendation)';

  btn.addEventListener('click', () => {
    generateCustomerProposal();
  });

  // Insert after the regular presentation button, or after system recommendation button
  const presentationBtn = document.getElementById('generatePresentationBtn');
  if (presentationBtn) {
    presentationBtn.parentNode.insertBefore(btn, presentationBtn.nextSibling);
  } else {
    const sysRecBtn = document.getElementById('systemRecommendationBtn');
    if (sysRecBtn) {
      sysRecBtn.parentNode.insertBefore(btn, sysRecBtn.nextSibling);
    } else {
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) {
        settingsBtn.parentNode.insertBefore(btn, settingsBtn.nextSibling);
      } else {
        toolbar.appendChild(btn);
      }
    }
  }

  console.log('✅ Customer proposal button initialized');
}
