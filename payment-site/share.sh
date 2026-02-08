#!/bin/bash

# WCDMR 2026 - Website Sharing Script
# This script helps you share your website with your team for testing

echo "=========================================="
echo "  WCDMR 2026 - Website Sharing Helper"
echo "=========================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

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

echo "📍 Your website will be available at:"
echo ""
echo "   Local:    http://localhost:$PORT"
echo "   Network:  http://$LOCAL_IP:$PORT"
echo ""
echo "📱 Share the Network URL with your team (same WiFi required)"
echo ""
echo "=========================================="
echo ""

# Check if ngrok is installed
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok detected!"
    echo ""
    read -p "Do you want to create a public URL with ngrok? (y/n): " use_ngrok
    echo ""
    
    if [[ $use_ngrok == "y" || $use_ngrok == "Y" ]]; then
        echo "🚀 Starting local server and ngrok..."
        echo ""
        echo "⚠️  Press Ctrl+C to stop both servers"
        echo ""
        
        # Start Python server in background
        $PYTHON_CMD -m http.server $PORT > /dev/null 2>&1 &
        SERVER_PID=$!
        
        # Wait a moment for server to start
        sleep 2
        
        # Start ngrok
        ngrok http $PORT
        
        # Cleanup when ngrok exits
        kill $SERVER_PID 2>/dev/null
        exit 0
    fi
fi

# Just start local server
echo "🚀 Starting local server..."
echo ""
echo "⚠️  Press Ctrl+C to stop the server"
echo ""
echo "📋 Share this URL with your team:"
echo "   http://$LOCAL_IP:$PORT"
echo ""

# Start the server
$PYTHON_CMD -m http.server $PORT
