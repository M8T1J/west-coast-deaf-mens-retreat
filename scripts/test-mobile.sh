#!/bin/bash

# Mobile Testing Helper Script
# This script helps you test your website on mobile devices

echo "=========================================="
echo "  Mobile Testing Helper"
echo "=========================================="
echo ""

# Repository root (static site files live here)
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python not found. Please install Python 3."
    exit 1
fi

# Get local IP address
get_local_ip() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        ipconfig getifaddr en0 || ipconfig getifaddr en1 || echo "127.0.0.1"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        hostname -I | awk '{print $1}'
    else
        echo "127.0.0.1"
    fi
}

LOCAL_IP=$(get_local_ip)
PORT=8000

echo "📱 MOBILE TESTING OPTIONS"
echo ""
echo "=========================================="
echo ""

# Option 1: Browser Dev Tools
echo "1️⃣  QUICK TEST (Browser Dev Tools)"
echo "   - Press F12 in your browser"
echo "   - Click device icon (📱)"
echo "   - Select iPhone/Android"
echo "   - No phone needed!"
echo ""

# Option 2: Local Network
echo "2️⃣  TEST ON REAL PHONE (Same WiFi)"
echo ""
echo "   Step 1: Server will start automatically"
echo "   Step 2: On your phone, go to:"
echo ""
echo "   👉 http://$LOCAL_IP:$PORT"
echo ""
echo "   (Make sure phone is on same WiFi!)"
echo ""

# Option 3: Public Link
if command -v ngrok &> /dev/null; then
    echo "3️⃣  PUBLIC LINK (Works Anywhere)"
    echo "   - Creates public URL"
    echo "   - Works on any phone, anywhere"
    echo "   - Share with team"
    echo ""
    read -p "   Create public link? (y/n): " use_ngrok
    echo ""
    
    if [[ $use_ngrok == "y" || $use_ngrok == "Y" ]]; then
        echo "🚀 Starting server and ngrok..."
        echo ""
        
        # Start Python server in background
        $PYTHON_CMD -m http.server $PORT > /dev/null 2>&1 &
        SERVER_PID=$!
        
        # Wait for server to start
        sleep 2
        
        echo "✅ Server started!"
        echo ""
        echo "🌐 Creating public link..."
        echo ""
        echo "=========================================="
        echo "  YOUR PUBLIC LINK:"
        echo "=========================================="
        echo ""
        echo "   👉 Copy the 'Forwarding' URL below 👈"
        echo ""
        echo "   Share this link with anyone!"
        echo ""
        echo "=========================================="
        echo ""
        echo "⚠️  Press Ctrl+C to stop"
        echo ""
        
        # Start ngrok
        ngrok http $PORT
        
        # Cleanup
        kill $SERVER_PID 2>/dev/null
        exit 0
    fi
else
    echo "3️⃣  PUBLIC LINK (Install ngrok first)"
    echo "   Run: brew install ngrok"
    echo "   Or: https://ngrok.com/download"
    echo ""
fi

# Start local server
echo "🚀 Starting local server..."
echo ""
echo "=========================================="
echo "  TEST ON YOUR PHONE:"
echo "=========================================="
echo ""
echo "   1. Make sure phone is on SAME WiFi"
echo "   2. Open browser on phone"
echo "   3. Go to:"
echo ""
echo "      👉 http://$LOCAL_IP:$PORT"
echo ""
echo "=========================================="
echo ""
echo "📋 WHAT TO TEST:"
echo "   ✓ Site loads properly"
echo "   ✓ Navigation works"
echo "   ✓ Forms are easy to use"
echo "   ✓ Text is readable"
echo "   ✓ Buttons are tappable"
echo ""
echo "⚠️  Press Ctrl+C to stop server"
echo ""

# Start the server
$PYTHON_CMD -m http.server $PORT
