#!/bin/bash

echo "🚀 Trading Approval System - Local Testing"
echo "=========================================="
echo ""
echo "✅ App is running locally on: http://localhost:3000"
echo ""
echo "🔗 Test URLs:"
echo "   • Homepage: http://localhost:3000"
echo "   • Admin Login: http://localhost:3000/admin-login"
echo "   • Health Check: http://localhost:3000/health"
echo ""
echo "🔑 Admin Credentials (for testing):"
echo "   • Username: admin"
echo "   • Password: admin"
echo ""
echo "🧪 New Features to Test:"
echo "   1. ✨ Modern UI with SF Pro-inspired design"
echo "   2. 🎨 Fixed button visibility (no more white text on buttons)"
echo "   3. 💎 Bond support - try entering ISINs like:"
echo "      • US1234567890 (12-character ISIN format)"
echo "      • GB0987654321"
echo "      • DE0123456789"
echo "   4. 📊 Equity/Bond filtering in admin and employee views"
echo "   5. 🔍 Auto-detection of ISIN vs stock ticker format"
echo ""
echo "📋 How to Test Bond Trading:"
echo "   1. Go to employee dashboard (login required)"
echo "   2. Enter an ISIN in the 'Stock Ticker or Bond ISIN' field"
echo "   3. The system will automatically detect it as a bond"
echo "   4. Complete the trading request"
echo "   5. Check admin panel to see bond requests with instrument type"
echo ""
echo "🛑 To stop the app: kill the Node.js process or use Ctrl+C"
echo ""

# Test if app is responding
echo "🔍 Testing app health..."
unset http_proxy
unset https_proxy

if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ App is healthy and responding!"
    echo ""
    echo "🌐 Open your browser and visit: http://localhost:3000"
else
    echo "❌ App is not responding. Please check if it's running."
fi