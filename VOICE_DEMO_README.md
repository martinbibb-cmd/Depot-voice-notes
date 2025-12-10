# Voice-to-Summary Demo

This is a simple Progressive Web App (PWA) demonstration that showcases voice-to-text conversion using the browser's Web Speech API.

## Features

- **Real-time Voice Recognition**: Uses the browser's built-in Web Speech API for continuous voice recognition
- **Live Transcript Display**: Shows your spoken words in real-time as you speak
- **Automatic Categorization**: Processes the transcript and categorizes information into:
  - **Engineer Summary**: Technical details about boiler installation work
  - **Customer Summary**: Customer-friendly explanation of the work
- **Offline Support**: Works offline thanks to the Service Worker caching
- **Simple & Lightweight**: No external dependencies or complex setup required

## How to Use

1. Open `voice-demo.html` in a modern web browser (Chrome, Edge, Safari)
2. Click the "🎙️ Start Recording" button
3. Grant microphone permissions when prompted
4. Speak naturally about the boiler installation work
5. Click "🛑 Stop Recording & Summarize" when finished
6. Review the categorized summaries in the Engineer and Customer sections

## Supported Keywords

The demo automatically detects and categorizes mentions of:

- **Boiler installation** (new boiler, boiler model)
- **Gas routing** (gas route, gas pipe)
- **Working at heights** (scaffold, ladder)
- **Flue work** (flue, chimney)
- **Heating system** (radiator, heating)
- **Hot water** (cylinder, water tank)
- **Pipework** (pipe, pipework)
- **Electrical work** (electrical, wiring)

## Browser Compatibility

The Web Speech API is supported in:
- ✅ Google Chrome (desktop & mobile)
- ✅ Microsoft Edge
- ✅ Safari (desktop & iOS)
- ⚠️ Firefox (limited support)

## Files

- `voice-demo.html` - The main HTML page with UI structure
- `voice-demo-app.js` - JavaScript file containing the voice recognition logic
- `sw.js` - Service Worker for offline functionality (shared with main app)

## Customization

To customize the categorization logic, edit the `categorizeAndSummarize()` function in `voice-demo-app.js`. You can:

- Add new keywords to detect
- Modify the engineer/customer summaries
- Add additional categories
- Implement more sophisticated NLP logic

## Technical Details

The demo uses:
- **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`)
- **Service Worker API** for offline caching
- **Vanilla JavaScript** (no frameworks)
- **Simple keyword-based categorization** (can be enhanced with real NLP)

## Integration with Main App

This demo is separate from the main Depot Voice Notes application and serves as a simplified example of the core voice-to-text functionality. The main application (`index.html`) includes more advanced features like AI processing, structured forms, and cloud synchronization.

## Next Steps

To enhance this demo, consider:

1. Implementing more sophisticated NLP using libraries like compromise.js or natural.js
2. Adding machine learning for better categorization
3. Integrating with the main app's AI processing endpoint
4. Adding export functionality (PDF, JSON, etc.)
5. Implementing user preferences and customization
