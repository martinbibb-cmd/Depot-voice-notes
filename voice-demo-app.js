const voiceButton = document.getElementById('voice-button');
const rawTranscript = document.getElementById('raw-transcript');
const engineerOutput = document.getElementById('engineer-output').querySelector('ul');
const customerOutput = document.getElementById('customer-output').querySelector('ul');

// Check for Web Speech API Support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    voiceButton.textContent = "Voice Recognition Not Supported in this Browser.";
    voiceButton.disabled = true;
} else {
    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Listen until manually stopped
    recognition.interimResults = true; // Show results as you speak
    recognition.lang = 'en-GB'; // Set language to British English

    let isRecording = false;
    let finalTranscript = '';

    voiceButton.onclick = () => {
        if (!isRecording) {
            recognition.start();
            isRecording = true;
            voiceButton.textContent = "🛑 Stop Recording & Summarize";
            voiceButton.style.backgroundColor = '#dc3545'; // Red
            rawTranscript.value = ""; // Clear old notes
            engineerOutput.innerHTML = "";
            customerOutput.innerHTML = "";
            finalTranscript = '';
        } else {
            recognition.stop();
            isRecording = false;
            voiceButton.textContent = "🎙️ Start Recording";
            voiceButton.style.backgroundColor = '#ffc107'; // Yellow
        }
    };

    // --- VOICE-TO-TEXT HANDLING ---
    recognition.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Display both final and interim results
        rawTranscript.value = finalTranscript + interimTranscript;
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            console.log('No speech detected. Please try again.');
        }
    };

    // --- SUMMARIZATION TRIGGERED ON STOP ---
    recognition.onend = () => {
        isRecording = false;
        voiceButton.textContent = "🎙️ Start Recording";
        voiceButton.style.backgroundColor = '#ffc107';
        
        if (rawTranscript.value.trim() !== "") {
            // *** THIS IS WHERE YOUR CUSTOM LOGIC GOES ***
            const fullTranscript = rawTranscript.value.trim();
            const { engineerNotes, customerNotes } = categorizeAndSummarize(fullTranscript);

            displayNotes(engineerOutput, engineerNotes);
            displayNotes(customerOutput, customerNotes);
        }
    };

    // --- CUSTOM CATEGORIZATION/SUMMARIZATION FUNCTION ---
    function categorizeAndSummarize(text) {
        const lowerText = text.toLowerCase();
        
        // **Engineer Summary Logic (Waffle-free specifics)**
        let engineerNotes = [];
        
        if (lowerText.includes("new boiler") || lowerText.includes("boiler model")) {
            engineerNotes.push("New Boiler: Installation required. Review transcript for specific model and location details.");
        }
        
        if (lowerText.includes("gas route") || lowerText.includes("gas pipe")) {
            engineerNotes.push("Gas route: 22mm run from meter required. Check transcript for specific routing details.");
        }
        
        if (lowerText.includes("scaffold") || lowerText.includes("working at heights") || lowerText.includes("ladder")) {
            engineerNotes.push("Scaffold: Required for flue termination. Verify area is accessible.");
        }
        
        if (lowerText.includes("flue") || lowerText.includes("chimney")) {
            engineerNotes.push("Flue installation: Required. Review transcript for type and routing specifications.");
        }
        
        if (lowerText.includes("radiator") || lowerText.includes("heating")) {
            engineerNotes.push("Heating system: Modifications needed. Check transcript for specific requirements.");
        }
        
        if (lowerText.includes("cylinder") || lowerText.includes("water tank")) {
            engineerNotes.push("Hot water cylinder: Work required. Verify details and location in transcript.");
        }
        
        if (lowerText.includes("pipe") || lowerText.includes("pipework")) {
            engineerNotes.push("Pipework: Modifications needed. Refer to transcript for routes and pipe sizes.");
        }
        
        if (lowerText.includes("electrical") || lowerText.includes("wiring")) {
            engineerNotes.push("Electrical work: Required. Review transcript for specific details.");
        }
        
        // Add default note if nothing detected
        if (engineerNotes.length === 0) {
            engineerNotes.push("General boiler installation work required. Please review transcript for specific details.");
        }
        
        // **Customer Summary Logic (What, Why, How)**
        let customerNotes = [];
        
        customerNotes.push("What: We are installing a new, high-efficiency boiler to replace your current heating system.");
        customerNotes.push("Why: To save you money on energy bills and improve the reliability of your heating.");
        
        if (lowerText.includes("scaffold") || lowerText.includes("roof") || lowerText.includes("flue")) {
            customerNotes.push("How: Work will take approximately two days. Some noise is expected during flue drilling and installation.");
        } else {
            customerNotes.push("How: Work will take approximately one to two days with minimal disruption.");
        }
        
        if (lowerText.includes("radiator") || lowerText.includes("pipe")) {
            customerNotes.push("Additional work: Some pipework modifications will be needed to optimize your heating system.");
        }
        
        customerNotes.push("We will ensure your property is left clean and tidy after the installation.");

        return { engineerNotes, customerNotes };
    }

    // --- DISPLAY HELPER ---
    function displayNotes(outputElement, notesArray) {
        outputElement.innerHTML = ''; // Clear existing notes
        notesArray.forEach(note => {
            const li = document.createElement('li');
            li.textContent = note;
            outputElement.appendChild(li);
        });
    }
}
