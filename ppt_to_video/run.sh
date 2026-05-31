#!/bin/bash

echo "Starting AI Avatar Presentation Generator..."

if [ ! -d "venv" ]; then
    echo "Error: Virtual environment not found!"
    echo "Please run setup.sh first:"
    echo "  chmod +x setup.sh"
    echo "  ./setup.sh"
    exit 1
fi

source venv/bin/activate

if [ ! -f "app.py" ]; then
    echo "Error: app.py not found!"
    exit 1
fi

echo "Virtual environment activated"
echo "Starting Flask server..."
echo ""
echo "Open your browser to: http://localhost:5000"
echo "Press Ctrl+C to stop the server"
echo ""

python app.py
