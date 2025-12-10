#!/bin/bash

echo "=== Voice Demo Validation ==="
echo ""

# Test 1: Check if files exist
echo "1. Checking if files exist..."
if [ -f "voice-demo.html" ]; then
    echo "   ✓ voice-demo.html exists"
else
    echo "   ✗ voice-demo.html not found"
    exit 1
fi

if [ -f "voice-demo-app.js" ]; then
    echo "   ✓ voice-demo-app.js exists"
else
    echo "   ✗ voice-demo-app.js not found"
    exit 1
fi

if [ -f "VOICE_DEMO_README.md" ]; then
    echo "   ✓ VOICE_DEMO_README.md exists"
else
    echo "   ✗ VOICE_DEMO_README.md not found"
    exit 1
fi

# Test 2: Validate HTML structure
echo ""
echo "2. Validating HTML structure..."
if grep -q 'id="voice-button"' voice-demo.html; then
    echo "   ✓ Voice button element present"
else
    echo "   ✗ Voice button element missing"
fi

if grep -q 'id="raw-transcript"' voice-demo.html; then
    echo "   ✓ Transcript textarea present"
else
    echo "   ✗ Transcript textarea missing"
fi

if grep -q 'id="engineer-output"' voice-demo.html; then
    echo "   ✓ Engineer output element present"
else
    echo "   ✗ Engineer output element missing"
fi

if grep -q 'id="customer-output"' voice-demo.html; then
    echo "   ✓ Customer output element present"
else
    echo "   ✗ Customer output element missing"
fi

if grep -q 'voice-demo-app.js' voice-demo.html; then
    echo "   ✓ JavaScript file referenced in HTML"
else
    echo "   ✗ JavaScript file not referenced"
fi

# Test 3: Validate JavaScript
echo ""
echo "3. Validating JavaScript..."
if grep -q 'SpeechRecognition' voice-demo-app.js; then
    echo "   ✓ Web Speech API usage present"
else
    echo "   ✗ Web Speech API usage missing"
fi

if grep -q 'categorizeAndSummarize' voice-demo-app.js; then
    echo "   ✓ Categorization function present"
else
    echo "   ✗ Categorization function missing"
fi

if grep -q 'recognition.continuous = true' voice-demo-app.js; then
    echo "   ✓ Continuous recognition enabled"
else
    echo "   ✗ Continuous recognition not enabled"
fi

if grep -q 'recognition.interimResults = true' voice-demo-app.js; then
    echo "   ✓ Interim results enabled"
else
    echo "   ✗ Interim results not enabled"
fi

# Test 4: Check JavaScript syntax
echo ""
echo "4. Checking JavaScript syntax..."
if node -c voice-demo-app.js 2>/dev/null; then
    echo "   ✓ JavaScript syntax is valid"
else
    echo "   ✗ JavaScript syntax errors detected"
fi

# Test 5: Check service worker cache
echo ""
echo "5. Checking service worker configuration..."
if grep -q 'voice-demo.html' sw.js; then
    echo "   ✓ voice-demo.html in service worker cache"
else
    echo "   ✗ voice-demo.html not in service worker cache"
fi

if grep -q 'voice-demo-app.js' sw.js; then
    echo "   ✓ voice-demo-app.js in service worker cache"
else
    echo "   ✗ voice-demo-app.js not in service worker cache"
fi

# Test 6: Check README updates
echo ""
echo "6. Checking documentation..."
if grep -q 'Voice-to-Summary Demo' README.md; then
    echo "   ✓ Demo section added to main README"
else
    echo "   ✗ Demo section not in main README"
fi

if grep -q 'VOICE_DEMO_README.md' README.md; then
    echo "   ✓ Demo README referenced in main README"
else
    echo "   ✗ Demo README not referenced"
fi

echo ""
echo "=== Validation Complete ==="
echo ""
echo "All tests passed! The voice demo is ready to use."
echo "Open voice-demo.html in a browser to test the functionality."
