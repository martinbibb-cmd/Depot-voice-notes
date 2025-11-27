/**
 * Customer-Facing Presentation Generator
 * Generates a professional 4-page A4 proposal from session data and system recommendations
 *
 * Page 1: Your Home & What You Told Us
 * Page 2: Gold Option (Recommended)
 * Page 3: Silver & Bronze Options
 * Page 4: What Happens Next & Important Notes
 */

import { loadSystemRecommendationJson } from './systemRecommendationImport.js';

/**
 * Load image as base64 for embedding in PDF
 */
async function loadImageAsBase64(imagePath) {
  try {
    const response = await fetch(imagePath);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Failed to load image: ${imagePath}`, error);
    return null;
  }
}

/**
 * Get current session data
 */
function getSessionData() {
  // Priority 1: Live app state
  const appState = window.__depotAppState || {};

  // Priority 2: localStorage fallback
  let transcript = '';
  try {
    const autosave = localStorage.getItem('surveyBrainAutosave');
    if (autosave) {
      const parsed = JSON.parse(autosave);
      transcript = parsed.fullTranscript || '';
    }
  } catch (e) {
    console.warn('Could not read autosave:', e);
  }

  // Fallback to dvn_transcript
  if (!transcript) {
    transcript = localStorage.getItem('dvn_transcript') || '';
  }

  return {
    customerName: appState.customerName || 'Valued Customer',
    customerAddress: appState.customerAddress || '',
    propertyType: appState.propertyType || 'property',
    currentSystem: appState.currentSystem || 'existing heating system',
    propertySummary: appState.propertySummary || '',
    sections: appState.sections || [],
    notes: appState.notes || [],
    transcript: transcript || appState.fullTranscript || appState.transcriptText || '',
    customerSummary: appState.customerSummary || ''
  };
}

/**
 * Extract key customer priorities from transcript
 */
function extractCustomerPriorities(sessionData) {
  const priorities = [];
  const transcript = sessionData.transcript.toLowerCase();

  // Common heating/hot water issues and priorities
  const priorityPatterns = [
    { pattern: /radiator.*slow|slow.*heat|cold spot/i, text: "Radiators at the far end of the house are slow to heat up." },
    { pattern: /run.*out.*hot water|shower.*cold|not enough hot water/i, text: "You often run out of hot water when showers are back-to-back." },
    { pattern: /save.*energy|reduce.*bill|energy.*efficien|waste.*energy/i, text: "You'd like better control and to avoid wasting energy." },
    { pattern: /disruption|minimal.*work|mess|quick.*install/i, text: "You'd like to keep disruption and mess to a minimum." },
    { pattern: /smart.*control|app.*control|remote.*control/i, text: "You want smart controls to manage heating from your phone." },
    { pattern: /solar|renewable|heat pump|future.*proof/i, text: "You're considering renewables like solar panels or a heat pump in future." },
    { pattern: /pressure.*shower|strong.*shower|mains.*pressure/i, text: "You want strong, mains-pressure showers." },
    { pattern: /noisy.*boiler|quiet|loud/i, text: "Your current boiler is noisy and you'd like a quieter system." }
  ];

  priorityPatterns.forEach(({ pattern, text }) => {
    if (pattern.test(transcript)) {
      priorities.push(text);
    }
  });

  // Add from sections if available
  if (sessionData.sections) {
    sessionData.sections.forEach(section => {
      if (section.section === 'Needs' && section.content) {
        const needs = Array.isArray(section.content) ? section.content : [section.content];
        needs.forEach(need => {
          if (typeof need === 'string' && need.length > 10 && need.length < 200) {
            priorities.push(need);
          }
        });
      }
    });
  }

  // If no priorities found, add generic ones
  if (priorities.length === 0) {
    priorities.push("You want a reliable, efficient heating and hot water system.");
    priorities.push("You're looking for good value and professional installation.");
  }

  return priorities.slice(0, 6); // Max 6 priorities
}

/**
 * Add wrapped text and return new Y position
 */
function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 6) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach(line => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

/**
 * Add a badge with text
 */
function addBadge(doc, text, x, y, color) {
  const colors = {
    gold: [255, 215, 0],
    silver: [192, 192, 192],
    bronze: [205, 127, 50]
  };

  const [r, g, b] = colors[color] || colors.gold;

  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y - 5, 35, 8, 2, 2, 'F');

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text(text.toUpperCase(), x + 17.5, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

/**
 * PAGE 1: Your Home & What You Told Us
 */
function generatePage1(doc, sessionData, priorities) {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Header
  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Your Heating & Hot Water Proposal', margin, 20);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const dateStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  doc.text(`Prepared for ${sessionData.customerName} – ${dateStr}`, margin, 28);

  doc.setTextColor(0, 0, 0);
  yPos = 45;

  // Section 1: Your Home at a Glance
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('Your Home at a Glance', margin, yPos);
  yPos += 8;

  // Summary panel background
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, yPos - 3, contentWidth, 40, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  yPos += 5;
  const bullets = [
    `• Home type: ${sessionData.propertyType || 'property'}`,
    `• Hot water setup today: ${sessionData.currentSystem || 'existing system'}`,
    `• ${sessionData.propertySummary || 'Family home with standard heating requirements'}`,
    `• ${sessionData.customerSummary || 'Looking to improve heating and hot water performance'}`
  ];

  bullets.forEach(bullet => {
    yPos = addWrappedText(doc, bullet, margin + 5, yPos, contentWidth - 10, 6);
  });

  yPos += 8;
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.setFont(undefined, 'italic');
  yPos = addWrappedText(doc, 'This summary helps us match your system to how your home is actually used.', margin + 5, yPos, contentWidth - 10, 5);

  yPos += 10;

  // Section 2: What You Told Us
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('What matters most to you', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  priorities.forEach(priority => {
    yPos = addWrappedText(doc, `• ${priority}`, margin + 3, yPos, contentWidth - 6, 7);
    yPos += 2;
  });

  yPos += 5;
  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(100, 116, 139);
  yPos = addWrappedText(doc, 'The options on the next pages are built around these priorities.', margin, yPos, contentWidth, 5);

  yPos += 12;

  // Section 3: Our Overall Recommendation
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(134, 239, 172);
  doc.roundedRect(margin, yPos - 3, contentWidth, 25, 3, 3, 'FD');

  yPos += 4;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text('Our recommendation:', margin + 5, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  const recommendation = 'Based on your home, hot-water use and current system, we recommend the option shown on the next page as the best balance of comfort, running cost and future-proofing.';
  yPos = addWrappedText(doc, recommendation, margin + 5, yPos, contentWidth - 10, 6);

  // Footer
  addFooter(doc, 1, 4);
}

/**
 * PAGE 2: Gold Option (Recommended)
 */
function generatePage2(doc, goldOption) {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Header
  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Your Heating & Hot Water Proposal', margin, 18);

  doc.setTextColor(0, 0, 0);
  yPos = 40;

  // Badge
  addBadge(doc, 'GOLD', margin, yPos, 'gold');
  yPos += 4;

  // Title
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  const title = goldOption.title || 'Recommended System';
  yPos = addWrappedText(doc, title, margin + 40, yPos - 4, contentWidth - 40, 7);
  yPos += 3;

  // Subtitle
  doc.setFontSize(10);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(100, 116, 139);
  const subtitle = 'Best balance of strong hot water performance, efficiency and future-readiness for your home.';
  yPos = addWrappedText(doc, subtitle, margin, yPos, contentWidth, 6);
  yPos += 8;

  // Key Benefits
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('Key Benefits', margin, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const benefits = goldOption.keyFactors || goldOption.pros || [
    'Strong, mains-pressure showers even when more than one tap is running',
    'Improved efficiency compared with your current system, helping to control bills',
    'Smart controls so you can schedule and adjust heating from your phone',
    'No loft tanks – tidier installation and reduced risk of leaks'
  ];

  benefits.forEach(benefit => {
    yPos = addWrappedText(doc, `✓ ${benefit}`, margin + 3, yPos, contentWidth - 6, 7);
    yPos += 2;
  });

  yPos += 8;

  // At a Glance
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('At a Glance – Spec Summary', margin, yPos);
  yPos += 7;

  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, yPos - 3, contentWidth, 35, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  yPos += 4;

  const specs = [
    `• System type: ${goldOption.variantLabel || goldOption.title || 'Recommended system'}`,
    `• Efficiency: ${goldOption.efficiency || 'High efficiency (88-92%)'}`,
    `• Lifespan: ${goldOption.lifespan || '15-20 years with proper maintenance'}`,
    `• Controls: Smart thermostat with app control and zoning options`
  ];

  specs.forEach(spec => {
    yPos = addWrappedText(doc, spec, margin + 5, yPos, contentWidth - 10, 6);
  });

  yPos += 12;

  // Why this suits your home
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('Why this suits your home', margin, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const bestFor = goldOption.bestFor || 'This system provides excellent performance and reliability for your home';
  yPos = addWrappedText(doc, `• ${bestFor}`, margin + 3, yPos, contentWidth - 6, 7);
  yPos += 2;

  if (goldOption.reasoningSummary) {
    yPos = addWrappedText(doc, `• ${goldOption.reasoningSummary}`, margin + 3, yPos, contentWidth - 6, 7);
  }

  // Footer
  addFooter(doc, 2, 4);
}

/**
 * PAGE 3: Silver & Bronze Options
 */
function generatePage3(doc, silverOption, bronzeOption) {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Header
  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Your Heating & Hot Water Proposal', margin, 18);

  doc.setTextColor(0, 0, 0);
  yPos = 40;

  // SILVER OPTION
  addBadge(doc, 'SILVER', margin, yPos, 'silver');
  yPos += 4;

  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  const silverTitle = silverOption.title || 'Alternative System Option';
  yPos = addWrappedText(doc, silverTitle, margin + 40, yPos - 4, contentWidth - 40, 7);
  yPos += 3;

  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(100, 116, 139);
  const silverSubtitle = 'Strong performance while keeping more of your existing layout.';
  yPos = addWrappedText(doc, silverSubtitle, margin, yPos, contentWidth, 5);
  yPos += 6;

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('Key Benefits', margin, yPos);
  yPos += 5;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const silverBenefits = silverOption.keyFactors || silverOption.pros || [
    'Improved boiler efficiency vs. your current unit',
    'Compatible with your existing setup – less change to pipework'
  ];

  silverBenefits.slice(0, 3).forEach(benefit => {
    yPos = addWrappedText(doc, `✓ ${benefit}`, margin + 3, yPos, contentWidth - 6, 6);
  });

  yPos += 5;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Best for:', margin, yPos);
  doc.setFont(undefined, 'normal');
  yPos += 4;
  const silverBestFor = silverOption.bestFor || 'Homes wanting better efficiency while keeping cost and disruption lower';
  yPos = addWrappedText(doc, silverBestFor, margin + 3, yPos, contentWidth - 6, 5);

  yPos += 10;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // BRONZE OPTION
  addBadge(doc, 'BRONZE', margin, yPos, 'bronze');
  yPos += 4;

  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  const bronzeTitle = bronzeOption.title || 'Budget-Friendly Option';
  yPos = addWrappedText(doc, bronzeTitle, margin + 40, yPos - 4, contentWidth - 40, 7);
  yPos += 3;

  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(100, 116, 139);
  const bronzeSubtitle = 'Lowest upfront cost with minimal disruption, keeping the system broadly as it is today.';
  yPos = addWrappedText(doc, bronzeSubtitle, margin, yPos, contentWidth, 5);
  yPos += 6;

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('Key Benefits', margin, yPos);
  yPos += 5;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const bronzeBenefits = bronzeOption.keyFactors || bronzeOption.pros || [
    'New, more efficient boiler compared to your current one',
    'Least disruption to existing pipework and cylinders'
  ];

  bronzeBenefits.slice(0, 3).forEach(benefit => {
    yPos = addWrappedText(doc, `✓ ${benefit}`, margin + 3, yPos, contentWidth - 6, 6);
  });

  yPos += 5;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Best for:', margin, yPos);
  doc.setFont(undefined, 'normal');
  yPos += 4;
  const bronzeBestFor = bronzeOption.bestFor || 'Homes focused on keeping initial cost and disruption down';
  yPos = addWrappedText(doc, bronzeBestFor, margin + 3, yPos, contentWidth - 6, 5);

  yPos += 10;

  // Recommendation nudge
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin, yPos - 3, contentWidth, 12, 2, 2, 'F');
  yPos += 3;
  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(146, 64, 14);
  yPos = addWrappedText(doc, 'We recommend the Gold option where budget allows, but all options are designed to be safe, compliant and appropriate for your home.', margin + 5, yPos, contentWidth - 10, 5);

  // Footer
  addFooter(doc, 3, 4);
}

/**
 * PAGE 4: What Happens Next & Important Notes
 */
function generatePage4(doc) {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // Header
  doc.setFillColor(102, 126, 234);
  doc.rect(0, 0, pageWidth, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Your Heating & Hot Water Proposal', margin, 18);

  doc.setTextColor(0, 0, 0);
  yPos = 40;

  // What Happens Next
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('What Happens Next', margin, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const steps = [
    {
      num: '1.',
      title: 'Confirm your preferred option',
      desc: 'We'll agree which option suits you best and answer any questions.'
    },
    {
      num: '2.',
      title: 'Arrange a survey/installation date',
      desc: 'An engineer visit is booked at a time that works for you.'
    },
    {
      num: '3.',
      title: 'Engineer checks & final details',
      desc: 'On the day, they'll confirm measurements, flue route and any details before starting work.'
    },
    {
      num: '4.',
      title: 'Installation & handover',
      desc: 'System is installed, tested and we show you how to use the controls.'
    }
  ];

  steps.forEach(step => {
    doc.setFont(undefined, 'bold');
    doc.text(step.num, margin, yPos);
    doc.text(step.title, margin + 8, yPos);
    yPos += 5;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    yPos = addWrappedText(doc, step.desc, margin + 8, yPos, contentWidth - 8, 5);
    yPos += 8;
    doc.setFontSize(10);
  });

  yPos += 5;

  // Important Notes
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(102, 126, 234);
  doc.text('Important Notes', margin, yPos);
  yPos += 8;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);

  const notes = [
    'All options are subject to a final safety and suitability check by the installing engineer.',
    'Any extra works (for example unexpected pipework or electrical issues) will be discussed and agreed with you before going ahead.',
    'Running-cost savings depend on how you use heating and hot water and on future energy prices.',
    'Warranties and guarantees apply as per manufacturer specifications and our installation terms.'
  ];

  notes.forEach(note => {
    yPos = addWrappedText(doc, `• ${note}`, margin + 3, yPos, contentWidth - 6, 6);
    yPos += 3;
  });

  yPos += 10;

  // Final message
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(margin, yPos - 3, contentWidth, 18, 2, 2, 'F');
  yPos += 4;
  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(22, 101, 52);
  yPos = addWrappedText(doc, 'If anything in this proposal doesn't feel right for your home, please tell us – we'd rather adjust the plan now than install the wrong thing.', margin + 5, yPos, contentWidth - 10, 5);

  // Footer
  addFooter(doc, 4, 4);
}

/**
 * Add footer to page
 */
function addFooter(doc, pageNum, totalPages) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'This proposal is for informational purposes only and does not constitute a formal quotation or contract.',
    pageWidth / 2,
    pageHeight - 10,
    { align: 'center' }
  );
  doc.text(
    `Generated by Depot Voice Notes - ${new Date().toLocaleString('en-GB')} - Page ${pageNum} of ${totalPages}`,
    pageWidth / 2,
    pageHeight - 5,
    { align: 'center' }
  );
}

/**
 * Main function to generate the presentation
 */
export async function generatePresentation() {
  console.log('🎨 Starting presentation generation...');

  // Get session data
  const sessionData = getSessionData();
  console.log('📊 Session data:', sessionData);

  // Get system recommendations
  const systemRec = loadSystemRecommendationJson();
  console.log('🎯 System recommendations:', systemRec);

  if (!systemRec) {
    alert('⚠️ No system recommendations found. Please generate or import system recommendations first.');
    return;
  }

  // Extract options (Gold, Silver, Bronze)
  const options = systemRec.topRecommendations || systemRec.recommendations || systemRec.options || [];

  if (options.length === 0) {
    alert('⚠️ System recommendations do not contain any options.');
    return;
  }

  const goldOption = options[0] || {};
  const silverOption = options[1] || options[0];
  const bronzeOption = options[2] || options[1] || options[0];

  // Extract customer priorities
  const priorities = extractCustomerPriorities(sessionData);

  // Create PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  try {
    // Generate all 4 pages
    console.log('📄 Generating Page 1...');
    generatePage1(doc, sessionData, priorities);

    doc.addPage();
    console.log('📄 Generating Page 2...');
    generatePage2(doc, goldOption);

    doc.addPage();
    console.log('📄 Generating Page 3...');
    generatePage3(doc, silverOption, bronzeOption);

    doc.addPage();
    console.log('📄 Generating Page 4...');
    generatePage4(doc);

    // Save the PDF
    const filename = `Heating_Proposal_${sessionData.customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    console.log('✅ Presentation generated successfully!');
    alert(`✅ Customer presentation generated: ${filename}`);

  } catch (error) {
    console.error('❌ Error generating presentation:', error);
    alert('❌ Failed to generate presentation. Check console for details.');
  }
}

/**
 * Initialize presentation button
 */
export function initPresentationButton() {
  // Find the toolbar
  const toolbar = document.querySelector('.toolbar-row');
  if (!toolbar) {
    console.warn('⚠️ Toolbar not found, cannot add presentation button');
    return;
  }

  // Create button
  const btn = document.createElement('button');
  btn.id = 'generatePresentationBtn';
  btn.className = 'pill-secondary';
  btn.innerHTML = '📊 Presentation';
  btn.title = 'Generate customer-facing proposal presentation (4-page PDF)';

  // Add event listener
  btn.addEventListener('click', () => {
    generatePresentation();
  });

  // Insert button after system recommendation button or at the end
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

  console.log('✅ Presentation button initialized');
}
