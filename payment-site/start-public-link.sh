#!/bin/bash

# Simple script to create a public link your team can use
# Just run this and share the link it gives you!

echo "=========================================="
echo "  Creating Public Link for Your Team"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "📥 ngrok not found. Installing it for you..."
    echo ""
    
    # Check if Homebrew is installed
    if command -v brew &> /dev/null; then
        echo "Installing ngrok via Homebrew..."
        brew install ngrok
    else
        echo "❌ Please install ngrok first:"
        echo ""
        echo "   1. Go to: https://ngrok.com/download"
        echo "   2. Download for Mac"
        echo "   3. Unzip and move ngrok to /usr/local/bin/"
        echo "   4. Or install Homebrew first: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo ""
        echo "   Then run this script again!"
        exit 1
    fi
fi

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python not found. Please install Python 3."
    exit 1
fi

PORT=8000

echo "🚀 Starting your website..."
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

# Start ngrok
echo "=========================================="
echo "  YOUR PUBLIC LINK (Share this!):"
echo "=========================================="
echo ""
echo "   👉 Copy the 'Forwarding' URL below 👈"
echo ""
echo "   (It will look like: https://xxxx.ngrok.io)"
echo ""
echo "=========================================="
echo ""
echo "⚠️  Press Ctrl+C when done to stop the server"
echo ""

# Start ngrok and capture the URL
ngrok http $PORT 2>&1 | while IFS= read -r line; do
    # Look for the forwarding URL
    if [[ $line == *"Forwarding"* ]]; then
        URL=$(echo "$line" | grep -oP 'https://[a-z0-9]+\.ngrok\.io')
        if [ ! -z "$URL" ]; then
            echo ""
            echo "🎉 YOUR LINK: $URL"
            echo ""
            echo "Share this link with your team - they can click it directly!"
            echo ""
        fi
    fi
    echo "$line"
done

# Cleanup when ngrok exits
kill $SERVER_PID 2>/dev/null
echo ""
echo "✅ Server stopped. Run this script again to create a new link."
