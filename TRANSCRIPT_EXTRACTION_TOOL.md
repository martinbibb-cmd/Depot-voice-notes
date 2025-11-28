# Depot Session Transcript Extraction Tool

## Overview

This document describes the AI-powered transcript extraction tool that parses British Gas heating survey voice transcripts and converts them into structured `DepotSurveySession` data.

## Endpoint

```
POST /tools/auto-fill-session
```

## Request Format

```json
{
  "transcript": "string - raw voice transcript from survey",
  "session": {}, // existing DepotSurveySession object (optional)
  "tool": "auto_fill_depot_session", // optional
  "schema": "DepotSurveySession" // optional
}
```

## Response Format

```json
{
  "sessionPatch": {
    // Partial DepotSurveySession with high-confidence extracted fields
    "existingSystem": {
      "existingSystemType": "conventional",
      "requestedSystemType": "conventional",
      "jobTypeRequired": "boiler_replacement"
    },
    "boilerJob": {
      "systemTypeA": "A2 - Conv-Conv",
      "locationTypeB": "B1 - Same room same location",
      "fuelType": "natural_gas"
    },
    "vulnerability": {
      "hsaInstallRating": "urgent",
      "priorityInstallRating": "urgent",
      "vulnerabilityReason": "75 and over"
    },
    "workingAtHeight": {
      "safeAccessRequired": "no",
      "safeAccessWorkDescription": "Ladder to first floor only"
    },
    "asbestos": {
      "suspectMaterialPresent": "no"
    },
    "installerNotes": {
      "boilerControlsNotes": "Replace existing regular boiler...",
      "flueNotes": "Replace flue",
      "gasWaterNotes": "Connect condensate to adjacent soil pipe.",
      "disruptionNotes": "No decorative work included.",
      "customerAgreedActions": "Customer to clear access.",
      "specialRequirements": ""
    },
    "ai": {
      "customerSummary": "We will replace your existing regular boiler..."
    }
  },
  "missingInfo": [
    {
      "target": "expert",
      "question": "Confirm final boiler output in kW based on full house heat loss."
    },
    {
      "target": "expert",
      "question": "Confirm if powerflush is required or if manual flush is acceptable."
    },
    {
      "target": "customer",
      "question": "Confirm customer availability for installation dates."
    }
  ]
}
```

## Key Features

### 1. High-Confidence Extraction
- Only fills fields that can be reliably extracted from the transcript
- Never invents or guesses values
- Ambiguous data is left out and added to `missingInfo` instead

### 2. Existing Data Preservation
- Does NOT overwrite user-entered values unless transcript explicitly contradicts them
- Merges new data with existing session carefully
- Notes discrepancies as questions in `missingInfo`

### 3. Enum Value Enforcement
The tool uses exact enum values as specified:
- **YesNoNone**: "yes" | "no" | "none"
- **Urgency**: "standard" | "urgent" | "none"
- **SystemType**: "conventional" | "system" | "combi" | "unknown"
- **JobType**: "boiler_replacement" | "full_system"
- **HomecareStatus**: "none" | "boiler_warranty" | "multi_prem_homecare"
- **FuelType**: "natural_gas" | "lpg" | "electric" | "unknown"

### 4. Field Mapping Intelligence

The system understands common heating survey terminology:

| Transcript Phrase | Mapped To |
|------------------|-----------|
| "conventional / regular boiler" | `existingSystem.existingSystemType = "conventional"` |
| "system boiler with cylinder" | `existingSystem.existingSystemType = "system"` |
| "combi boiler" | `existingSystem.existingSystemType = "combi"` |
| "A2 / Conv-Conv" | `boilerJob.systemTypeA` |
| "same room same location" | `boilerJob.locationTypeB = "B1 - Same room same location"` |
| "75 and over" | `vulnerability.vulnerabilityReason` |
| "urgent install" | `vulnerability.hsaInstallRating = "urgent"` |
| "no heating", "no hot water" | `vulnerability.priorityInstallRating = "urgent"` |
| "ladder to first floor" | `workingAtHeight.safeAccessWorkDescription` |
| "no scaffolding" | `workingAtHeight.safeAccessRequired = "no"` |
| "no asbestos identified" | `asbestos.suspectMaterialPresent = "no"` |

### 5. Installer Notes Extraction

The tool populates structured installer notes from transcript:
- **boilerControlsNotes**: Boiler and controls work instructions
- **flueNotes**: Flue work details
- **gasWaterNotes**: Gas and water pipework details
- **disruptionNotes**: Making good, decoration, disruption details
- **customerAgreedActions**: What customer agreed to do
- **specialRequirements**: Future plans or special considerations

### 6. Missing Information Tracking

Questions are categorized by who should answer:
- **target: "expert"** - Adviser or engineer to confirm on site
- **target: "customer"** - Customer to provide or confirm

Focus areas:
- Safety concerns (asbestos, working at height)
- Feasibility (access, materials, constraints)
- Booking requirements (availability, special needs)

## AI Provider Fallback

The tool supports both OpenAI and Anthropic:

1. **Primary**: OpenAI GPT-4.1 (if `OPENAI_API_KEY` configured)
2. **Fallback**: Anthropic Claude Sonnet 4.5 (if `ANTHROPIC_API_KEY` configured)

If both are configured, OpenAI is tried first. If it fails, Anthropic is used.

## System Prompt

The tool uses a comprehensive system prompt that:
- Explains the British Gas heating survey context
- Defines extraction rules and confidence requirements
- Lists all allowed enum values
- Provides field mapping hints
- Instructs on preserving existing data
- Guides missing information identification
- Specifies exact JSON output format

## Implementation

### Location
All code is in `brain-worker.js`:
- Route handler: `handleAutoFillSession()` (lines 197-245)
- AI processing: `autoFillSessionWithAI()` (lines 963-1147)
- System prompt: Embedded in `autoFillSessionWithAI()` (lines 985-1063)

### Usage from Frontend

```typescript
import { autoFillSession } from './api/autoFillSession.js';

const result = await autoFillSession(
  currentSession.fullTranscript,
  currentSession
);

// Merge sessionPatch into session
const updatedSession = {
  ...currentSession,
  ...result.sessionPatch
};

// Append missing info questions
updatedSession.missingInfo = [
  ...(currentSession.missingInfo || []),
  ...result.missingInfo
];
```

## Testing

To test the endpoint manually:

```bash
curl -X POST https://your-worker.workers.dev/tools/auto-fill-session \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Customer has a conventional boiler in the kitchen...",
    "session": {}
  }'
```

## Future Enhancements

Potential improvements:
1. Add SKU/product recommendation (separate tool)
2. Add pricing calculation (separate deterministic tool)
3. Add validation warnings for conflicting data
4. Add confidence scores per field
5. Add multi-language transcript support
