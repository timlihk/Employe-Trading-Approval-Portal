#!/bin/bash

echo "Starting Employee Pre-Trading Approval Request System..."

# Create Python virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment and install Python dependencies
echo "Installing Python dependencies..."
source venv/bin/activate
pip install -r requirements.txt

# Start the Node.js application
echo "Starting Node.js application..."
npm start