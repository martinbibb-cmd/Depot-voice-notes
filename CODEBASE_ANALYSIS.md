# Depot Voice Notes - Comprehensive Codebase Analysis

## Executive Summary

**Depot Voice Notes** is a voice-to-text survey notes application for heating/boiler installation surveys. It combines local Web Speech API (free) with cloud-based OpenAI transcription (Pro). The app generates structured survey notes with automatic material lists and PDF quotes.

**Current Branch:** `claude/reduce-duplication-shareability-016VBuDnj8qoSWtVMcDTSq1j`

---

## 1. APPLICATION ARCHITECTURE

### 1.1 Overall Design Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                   Web Browser (index.html)                   │
├─────────────────────────────────────────────────────────────┤
│  Frontend: main.js (3024 lines) + Supporting modules         │
│  • Voice input (Web Speech API or MediaRecorder)            │
│  • UI components (sections, materials, quotes)             │
│  • State management (sections, notes, checklist)           │
│  • Session management & autosave                          │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS POST
               ↓
┌─────────────────────────────────────────────────────────────┐
│     Cloudflare Worker: brain-worker.js (613 lines)          │
├─────────────────────────────────────────────────────────────┤
│  Two Endpoints:                                              │
│  1. POST /text  - Process transcript text                   │
│  2. POST /audio - Transcribe audio + process               │
│                                                              │
│  Flow:                                                       │
│  • Audio → Whisper API (transcription)                      │
│  • Transcript → GPT-4 (section structuring)                 │
│  • Returns: JSON with sections, materials, checklist items │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTPS
               ↓
┌─────────────────────────────────────────────────────────────┐
│  OpenAI APIs (External)                                      │
│  • Whisper (audio/transcriptions)                           │
│  • GPT-4 chat.completions (text processing)                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Standalone Mode (Free)
- Uses browser's built-in Web Speech Recognition (SpeechRecognition API)
- No backend required
- Fallback for text input
- Audio recording for backup via MediaRecorder

### 1.3 Cloud Mode (Pro)
- Requires Cloudflare Worker deployment
- Uses OpenAI API keys (configured as secrets)
- License validation via Ed25519 signed tokens
- Supports audio file upload for transcription

---

## 2. NOTE CREATION & PROCESSING FLOW

### 2.1 Data Flow Diagram

```
User Speech/Text Input
        ↓
Web Speech Recognition OR MediaRecorder
        ↓
Transcript String
        ↓
buildVoiceRequestPayload() {
  transcript,
  alreadyCaptured: [],        ← CRITICAL: Previous sections
  expectedSections: [],       ← Canonical section names
  sectionHints: {},          ← Keyword → section mapping
  checklistItems: [],        ← Available checklist items
  depotSections: [],         ← Schema definition
  forceStructured: true      ← Always structure
}
        ↓ (HTTP POST to /text)
        ↓
brain-worker.js: callNotesModel()
        ↓
System Prompt Processing
        ↓
GPT-4 Returns JSON:
{
  "checkedItems": [],
  "sections": [
    {
      "section": "Section Name",
      "plainText": "Bullet items;",
      "naturalLanguage": "Prose description"
    }
  ],
  "materials": [],
  "missingInfo": [],
  "customerSummary": ""
}
        ↓
normaliseSectionsFromResponse()
        ↓
mergeSectionsPreservingRequired() ← DUPLICATION HANDLING
        ↓
cleanSectionContent()        ← FINAL DEDUPLICATION
        ↓
Display in UI + Store in lastRawSections[]
```

### 2.2 Key Processing Functions

#### Frontend (js/main.js)

| Function | Lines | Purpose |
|----------|-------|---------|
| `buildVoiceRequestPayload()` | 1028-1058 | Constructs API request with dedup hints |
| `sendText()` | 1400-1436 | POSTs transcript, handles response |
| `sendAudio()` | 1438-1476 | POSTs audio blob, transcription + processing |
| `normaliseSectionsFromResponse()` | 1060-1074 | Extracts sections from worker response |
| `mergeSectionsPreservingRequired()` | 656-706 | **Deduplication logic** |
| `cleanSectionContent()` | 408-451 | **Final dedup pass** |
| `applyVoiceResult()` | ~1300s | Merges results and updates UI |

#### Backend (brain-worker.js)

| Function | Lines | Purpose |
|----------|-------|---------|
| `callNotesModel()` | 171-318 | GPT-4 processing main logic |
| `transcribeAudio()` | 145-169 | Whisper API integration |
| `normaliseCapturedSections()` | 320-337 | Parse `alreadyCaptured` array |
| `normaliseSectionsFromModel()` | 365-408 | Ensures all sections present |

---

## 3. AI PROCESSING DETAILS

### 3.1 System Prompt (brain-worker.js:196-247)

The prompt instructs GPT-4 to:
- Parse transcript for checklist items (by ID)
- Output sections in canonical order
- **Avoid duplicates** - explicitly mentioned in the prompt
- Suggest materials with category/qty/notes
- Generate customer summary

**Critical Section from Prompt:**
```
You receive:
- A transcript of what was discussed.
- A list of known checklist items (with ids).
- The depot section names listed below (use them exactly, in this order).
- Optionally, a list of sections already captured so you can avoid duplicates.
- Optional hints that map keywords to section names.
- A forceStructured flag indicating you MUST return structured depot notes even if 
  the transcript is sparse.
```

### 3.2 Model Configuration

- **Model:** `gpt-4.1` (could be updated)
- **Temperature:** 0.2 (very deterministic)
- **Response Format:** JSON only (no markdown wrapping)
- **Validation:** Strict error handling for malformed JSON

### 3.3 Deduplication Strategy in Prompt

The prompt passes `alreadyCaptured` array containing previously captured sections:
```javascript
{
  section: "Section Name",
  plainText: "Previous content",
  naturalLanguage: "Previous description"
}
```

The model is instructed to use this to avoid duplicate information.

---

## 4. DUPLICATION ISSUES & HANDLING

### 4.1 Where Duplication Can Occur

#### Source 1: Multiple API Calls
When user sends multiple transcripts in sequence, sections accumulate:
- Call 1: "Needs" section gets content A
- Call 2: "Needs" section gets content B
- Result: Both A and B appear (should merge)

#### Source 2: Section Content Duplication
Within a single section's `plainText`:
```
"Installation required; Installation required; Power flush needed;"
↓
"Installation required; Power flush needed;"
```

#### Source 3: Repeated Processing
Same transcript sent multiple times creates duplicates in merge logic.

### 4.2 Current Deduplication Layers

#### Layer 1: AI Prompt Instruction
In `brain-worker.js:203`, the prompt hints at duplication avoidance but relies on model compliance.

#### Layer 2: Frontend Merge Logic (js/main.js:656-706)
Function: `mergeSectionsPreservingRequired()`
- Partitions sections into "required" (canonical) and "extras"
- Uses `mergeTextFields()` to combine old + new content
- Checks for text inclusion: `prevTrim.includes(nextTrim)` → skip new
- Checks for equality: `prevTrim.toLowerCase() === nextTrim.toLowerCase()` → skip new

**Code:**
```javascript
function mergeTextFields(existing, incoming) {
  const prev = typeof existing === "string" ? existing : "";
  const next = typeof incoming === "string" ? incoming : "";
  const prevTrim = prev.trim();
  const nextTrim = next.trim();
  
  if (prevTrim.toLowerCase() === nextTrim.toLowerCase()) return next || prev;
  if (prevTrim.includes(nextTrim)) return prev;
  if (nextTrim.includes(prevTrim)) return next;
  return `${prevTrim}\n${nextTrim}`.trim();
}
```

**Issues with this approach:**
- Only checks inclusion at whole-text level
- Doesn't handle partial duplication
- Doesn't handle punctuation/formatting differences

#### Layer 3: Content Cleaning (js/main.js:408-451)
Function: `cleanSectionContent()`
- Splits `plainText` by semicolons/newlines
- Deduplicates individual lines (case-insensitive)
- Filters out "No..." statements unless section has other details
- Joins back with semicolons

**Code:**
```javascript
const seen = new Set();
let uniqueLines = [];
rawLines.forEach((line) => {
  const key = line.toLowerCase();
  if (seen.has(key)) return;  // Skip duplicate
  seen.add(key);
  uniqueLines.push(line);
});

const hasDetail = uniqueLines.some((line) => !/^no\b/i.test(line));
if (hasDetail) {
  uniqueLines = uniqueLines.filter((line) => !/^no\b/i.test(line));
}

cleaned.plainText = uniqueLines.length ? `${uniqueLines.join("; ")};` : "";
```

### 4.3 Known Duplication Bugs (from Git History)

- **Commit 31aa765** (Nov 16): "Clean duplicated section content" - Recent fix
- **Commit 09e3b98** (Nov 15): "Centralise depot notes schema and dedupe notes output"
- **Commit c0983c8** (Nov 10): "Reroute flue clauses and dedupe disruption"
- **Commit 5183321** (Nov 8): "Fix routing and deduplicate disruption notes"

**Pattern:** These all fix recurring duplication issues, suggesting the problem is persistent.

### 4.4 Why Duplication Still Occurs

1. **AI Model doesn't reliably follow dedup instructions**
   - `alreadyCaptured` array passed but model may ignore
   - No structured output format enforcement (JSON only helps parsing, not logic)

2. **Partial Match Detection Gaps**
   - "Magnetic filter cleaning" vs "Clean magnetic filter" → Not detected as duplicate
   - "System flush required" vs "Require system flush" → Different word order not detected

3. **Multiple Processing Paths**
   - Live transcription (chunked) processes segments separately
   - Manual text input processes all at once
   - Different merge behavior between paths

4. **No Semantic Deduplication**
   - Only exact case-insensitive matches detected
   - No NLP to understand "we'll fit" = "fitting"

---

## 5. BUG REPORTING FUNCTIONALITY

### 5.1 Current State: **NO FORMAL BUG REPORTING**

The application currently has:
- **Error Display:** Simple text div (`#voice-error`)
- **Error Logging:** Console.error() calls
- **Debug Output:** Browser `window.__depotVoiceNotesDebug` object
- **No Error Submission:** No backend endpoint for reporting

### 5.2 Error Handling Points

#### Frontend Error Display (js/main.js:709-722)
```javascript
function showVoiceError(message) {
  if (!voiceErrorEl) {
    console.error("Voice error:", message);
    alert(message);
    return;
  }
  voiceErrorEl.textContent = message;
  voiceErrorEl.style.display = "block";
}
```

#### Error Catch Points
- Line 1428: `sendText()` catch block
- Line 1467: `sendAudio()` catch block
- Line 1583: Quote generation error
- 20+ other try/catch blocks throughout

#### Worker Error Response (brain-worker.js:24-27)
```javascript
catch (err) {
  console.error("Worker fatal error:", err);
  return jsonResponse({ error: "model_error", message: String(err) }, 500);
}
```

### 5.3 Debug Features Available

**To Frontend Developers:**
```javascript
window.__depotVoiceNotesDebug = {
  lastWorkerResponse: {},      // Full API response
  lastNormalisedSections: []   // Processed sections
}
```

**To End Users:**
- Debug accordion in HTML (`#debugSections`)
- Shows raw worker payload (JSON)
- Shows normalised sections
- **No export/share mechanism for debug data**

### 5.4 What's Missing

1. **Error Capture & Submission**
   - No way to send error logs to backend
   - No timestamp/context collection
   - No user contact info collection

2. **Error Context**
   - No browser/OS info logged
   - No transcript snippet (for privacy)
   - No network latency data (except speed test)

3. **Bug Reporting UI**
   - No "Report Issue" button
   - No feedback form
   - No GitHub issue creation flow

---

## 6. APP INTEGRATION POINTS

### 6.1 Standalone vs. Cloud Integration

#### Standalone (Free Mode)
- **Files:** `index.html`, `js/main.js`, supporting JS files
- **Requirements:** None (pure browser)
- **Hosting:** Static site (GitHub Pages, nginx, etc.)
- **Limitation:** Web Speech API only (limited accuracy)

#### Cloud Integration (Pro Mode)
- **Files:** `brain-worker.js` (Cloudflare Worker)
- **Requirements:** 
  - Cloudflare account with Workers enabled
  - OpenAI API key
  - Ed25519 license key pair
- **Deployment:** 
  ```bash
  wrangler deploy
  wrangler secret put OPENAI_API_KEY
  ```
- **Config:** `wrangler.toml` with `ALLOWED_ORIGIN`

### 6.2 Integration with Other Systems

#### 1. Quote Generation (PDF)
- **Files:** `js/quoteBuilder.js`, `js/quotePDF.js`, `js/packSelector.js`
- **Flow:** 
  1. Extract materials from notes
  2. Match to pricebook CSV
  3. Show pack selector modal
  4. Generate PDF quote
- **Libraries:** jsPDF, html2canvas (in quotePDF.js)

#### 2. Pricebook System
- **File:** `js/pricebook.js` (315 lines)
- **Format:** CSV files in `pricebook_csvs/` directory
- **Features:** 
  - Match extracted materials to catalog
  - Auto-suggest core packs (boiler kits)
  - Pricing integration
- **Process:** `parse_pricebook.py` converts PDF to CSVs

#### 3. Checklist System
- **Config:** `checklist.config.json` (300+ lines)
- **Format:** Array of items with:
  - id, label, hint, plainText, naturalLanguage
  - Materials list (qty, category, item, notes)
  - depotSection mapping
- **Usage:** 
  - AI marks which items are "checked" by transcript
  - UI shows checked items (future implementation)
  - Materials added to quote

#### 4. Session Management
- **Storage:** Browser localStorage + optional server export
- **State Keys:**
  - `depot.checklistConfig` - Checklist customization
  - `depot-checklist-state` - Checked items
  - `depot.sectionSchema` - Section customization
  - `surveyBrainAutosave` - Autosaved transcript

### 6.3 External Integration Possibilities

#### Could integrate with:
1. **CRM Systems** (Salesforce, Pipedrive)
   - Export notes as case data
   - Auto-create job records

2. **Project Management** (Jira, Monday.com)
   - Create tasks from sections
   - Attach materials list

3. **Analytics Platforms**
   - Track survey duration/material counts
   - Identify common issues

4. **Accounting** (Xero, QuickBooks)
   - Auto-create quotes as invoices
   - Link to job records

#### Current Integration Gaps:
- No API exports (only JSON download)
- No OAuth/authentication integration
- No webhook support
- No third-party embed capability

---

## 7. KEY FILES REFERENCE

### Core Application Logic
| File | Lines | Purpose |
|------|-------|---------|
| `js/main.js` | 3024 | Main app logic, speech recognition, UI control |
| `index.html` | 954 | UI markup, styles, script loader |
| `brain-worker.js` | 613 | Cloudflare Worker, GPT-4 processing |

### State & Config
| File | Lines | Purpose |
|------|-------|---------|
| `src/app/state.js` | 110 | localStorage abstraction, config loading |
| `src/app/worker-config.js` | 104 | Worker URL management |
| `checklist.config.json` | ~300 | Survey checklist definition |
| `depot.output.schema.json` | 18 | Section schema definition |

### Features
| File | Lines | Purpose |
|------|-------|---------|
| `js/quoteBuilder.js` | 432 | Quote creation UI & logic |
| `js/quotePDF.js` | 339 | PDF generation for quotes |
| `js/pricebook.js` | 315 | Pricebook CSV loading & matching |
| `js/packSelector.js` | 328 | Modal for core pack selection |

### Notes Processing
| File | Lines | Purpose |
|------|-------|---------|
| `src/notes/notesEngine.js` | 76 | Note output building from checklist |
| `routing.json` | 51 | ASR normalization & phrase routing |

### Settings & Rendering
| File | Lines | Purpose |
|------|-------|---------|
| `src/settings/settings.js` | 943 | Settings page & schema editor |
| `src/app/renderDepot.js` | 178 | Render sections to depot format |

### UI Enhancements
| File | Lines | Purpose |
|------|-------|---------|
| `js/mainIntegration.js` | 211 | Bridge between main.js & UI enhancements |
| `js/uiEnhancements.js` | 338 | Audio level meter, transcript panels |

---

## 8. ARCHITECTURAL PATTERNS & OBSERVATIONS

### 8.1 Data Flow Principles
1. **Unidirectional:** User input → API → Processing → Display
2. **Stateful:** Maintains `lastRawSections[]`, `lastMaterials[]` in memory
3. **LocalStorage:** Persists across sessions
4. **No Database:** Pure client/serverless architecture

### 8.2 Error Handling Pattern
```javascript
try {
  const result = await operation();
  // SUCCESS: process result
} catch (err) {
  const message = err.voiceMessage || `Operation failed: ${err.message}`;
  showVoiceError(message);
  setStatus("Failed");
}
```

### 8.3 State Management Approach
- **Minimal Framework:** No Redux/Vuex, vanilla state variables
- **Global Objects:** 
  - `APP_STATE` (sections, notes)
  - `window.__depotVoiceNotesDebug` (debug info)
- **Array-based:** `lastRawSections[]`, `lastMaterials[]`

### 8.4 Deduplication is Multi-Layered
```
AI Dedup Hint → Merge Logic → Content Cleaning → Display
  Weakest      ↑ Most Active   ↑ Final Pass      Strongest
```

---

## 9. NOTABLE CODE PATTERNS

### 9.1 Safe JSON Parsing
```javascript
function safeParseJSON(raw, fallback = null) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}
```

### 9.2 Deep Clone Utility
```javascript
function cloneDeep(val) {
  try { return JSON.parse(JSON.stringify(val)); } 
  catch (_) { return val; }
}
```

### 9.3 Adaptive Chunk Intervals
Based on measured internet speed:
- Fast (<200ms latency): 10s chunks
- Medium (<500ms): 20s chunks
- Slow (>500ms): 30s chunks

---

## 10. SUMMARY OF KEY FINDINGS

### ✅ Strengths
1. **Modular Architecture:** Clear separation between UI, logic, and backend
2. **Privacy-First:** Free mode works entirely offline
3. **Flexible Configuration:** Customizable sections, checklist, pricebook
4. **Adaptive Performance:** Internet speed detection & chunk interval adjustment
5. **Comprehensive UI:** Modern layout, real-time feedback, debug tools

### ⚠️ Known Issues & Limitations

1. **Persistent Duplication**
   - Multiple fixes in git history (commits 31aa765, 09e3b98, etc.)
   - Still occurs in certain edge cases
   - Needs semantic/NLP-based deduplication

2. **No Error Reporting**
   - No formal bug report submission
   - Debug data not exportable
   - No error tracking/analytics

3. **Merge Logic Complexity**
   - Multiple overlapping merge functions
   - Hard to trace which pass removes duplicates
   - Fragile text-matching approach

4. **Limited Integration**
   - No API for third-party systems
   - Only JSON export available
   - No webhook/event system

5. **AI Dependency**
   - Relies on GPT-4 following complex prompt instructions
   - Temperature=0.2 but still non-deterministic
   - `alreadyCaptured` array often ignored by model

### 📋 Recommendations for Future Work

1. **Deduplication**
   - Implement semantic hashing (embedding-based)
   - Add cosine similarity matching
   - Track dedup metadata (sources, merges)

2. **Error Handling**
   - Add `/feedback` endpoint to worker
   - Implement error reporting UI modal
   - Collect context: browser, section count, transcript length

3. **Integration**
   - Add API endpoints for external systems
   - Implement webhook support
   - OAuth integration for third-party apps

4. **Testing**
   - Add regression tests for deduplication
   - Create test transcripts for edge cases
   - Mock OpenAI API responses

5. **Monitoring**
   - Error tracking (Sentry/Rollbar)
   - Usage analytics
   - Performance monitoring (API latency, error rates)

