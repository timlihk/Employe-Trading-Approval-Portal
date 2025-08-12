#!/bin/bash

# Deploy Trading Approval System to NAS
# Usage: ./deploy-nas.sh

set -e

echo "🚀 Trading Approval System - NAS Deployment"
echo "=========================================="
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📄 Creating .env file from inspirationcap template..."
    cp .env.inspirationcap .env
    echo "⚠️  Please edit .env file and update:"
    echo "   - POSTGRES_PASSWORD (change the password)"
    echo "   - SESSION_SECRET (generate a new 32-character key)"
    echo "   - Any other settings specific to your NAS"
    echo ""
    echo "After editing .env, run this script again."
    exit 0
fi

echo "✅ Environment file found"

# Create SSL directory if it doesn't exist
mkdir -p nginx/ssl

# Check if SSL certificates exist
if [ ! -f nginx/ssl/pre-trading-approval.inspirationcap.com.crt ] || [ ! -f nginx/ssl/pre-trading-approval.inspirationcap.com.key ]; then
    echo "🔐 SSL certificates not found. Generating self-signed certificates..."
    echo "   (For production, replace these with proper certificates)"
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/pre-trading-approval.inspirationcap.com.key \
        -out nginx/ssl/pre-trading-approval.inspirationcap.com.crt \
        -subj "/C=US/ST=CA/L=SF/O=Inspiration Capital/CN=pre-trading-approval.inspirationcap.com" \
        -addext "subjectAltName=DNS:pre-trading-approval.inspirationcap.com"
    
    echo "✅ Self-signed certificates generated"
    echo "⚠️  For production, replace with proper Let's Encrypt certificates"
else
    echo "✅ SSL certificates found"
fi

echo ""
echo "🔨 Building and starting services..."

# Stop existing containers if running
docker-compose down

# Pull latest images and build
docker-compose pull
docker-compose build --no-cache app

# Start all services
docker-compose up -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🔍 Testing health endpoints..."

# Test health endpoint
if curl -k -f -s https://localhost:443/health > /dev/null 2>&1; then
    echo "✅ HTTPS health check passed"
else
    echo "⚠️  HTTPS health check failed (this might be normal during startup)"
fi

echo ""
echo "🎉 Deployment Complete!"
echo ""
echo "📱 Access URLs:"
echo "   • Local HTTPS: https://localhost"
echo "   • Domain (after DNS): https://pre-trading-approval.inspirationcap.com"
echo "   • Admin Login: https://pre-trading-approval.inspirationcap.com/admin-login"
echo ""
echo "🔧 Management Commands:"
echo "   • View logs: docker-compose logs -f app"
echo "   • Restart: docker-compose restart"
echo "   • Stop: docker-compose down"
echo "   • Update: git pull && ./deploy-nas.sh"
echo ""
echo "📋 Next Steps:"
echo "   1. Add DNS record: pre-trading-approval.inspirationcap.com → your NAS IP"
echo "   2. Configure port forwarding: 80→80, 443→443"
echo "   3. Replace self-signed certs with proper certificates"
echo "   4. Test access from external network"
echo ""
echo "Happy trading! 📈"