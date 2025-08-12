#!/bin/bash

# Company Deployment Script for inspirationcap.com
# Usage: ./deploy-company.sh

set -e

echo "🏢 Trading Approval System - Company Deployment"
echo "==============================================="
echo "Domain: pre-trading-approval.inspirationcap.com"
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install Docker Compose."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📄 Creating .env file from company template..."
    cp .env.inspirationcap .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file and update:"
    echo "   - POSTGRES_PASSWORD (use a strong company password)"
    echo "   - SESSION_SECRET (generate a new 32-character key)"
    echo "   - Verify AZURE credentials are correct"
    echo ""
    echo "After editing .env, run this script again."
    exit 0
fi

echo "✅ Environment file found"

# Check network configuration
echo "🌐 Network Configuration Check..."
CURRENT_IP=$(curl -s https://ipv4.icanhazip.com 2>/dev/null || echo "UNKNOWN")
echo "   Current public IP: $CURRENT_IP"

# DNS Check
echo "🔍 Checking DNS configuration..."
DNS_RESULT=$(nslookup pre-trading-approval.inspirationcap.com 2>/dev/null || echo "NOT_FOUND")

if echo "$DNS_RESULT" | grep -q "NXDOMAIN\|NOT_FOUND"; then
    echo "⚠️  DNS record not found for pre-trading-approval.inspirationcap.com"
    echo ""
    echo "📋 DNS Setup Options:"
    echo "   Option 1 (Recommended): CNAME to LazyCat tunnel"
    echo "     Type: CNAME"
    echo "     Name: pre-trading-approval"  
    echo "     Value: your-lazycat-tunnel.lazycat.cloud"
    echo ""
    echo "   Option 2: A record to current IP (dynamic IP setup)"
    echo "     Type: A"
    echo "     Name: pre-trading-approval"
    echo "     Value: $CURRENT_IP"
    echo ""
    read -p "Continue deployment for testing? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled. Please configure DNS first."
        echo "See LAZYCAT_NO_FIXED_IP_GUIDE.md for detailed setup instructions."
        exit 1
    fi
else
    echo "✅ DNS record found"
    if echo "$DNS_RESULT" | grep -q "CNAME"; then
        echo "   Type: CNAME (LazyCat tunnel - excellent choice!)"
    else
        DNS_IP=$(echo "$DNS_RESULT" | grep "Address:" | tail -1 | awk '{print $2}')
        echo "   Type: A record pointing to $DNS_IP"
        if [ "$DNS_IP" != "$CURRENT_IP" ] && [ "$CURRENT_IP" != "UNKNOWN" ]; then
            echo "   ⚠️  Note: DNS IP ($DNS_IP) differs from current IP ($CURRENT_IP)"
            echo "        This is normal if using LazyCat tunneling or DDNS"
        fi
    fi
fi

# Create SSL directory
mkdir -p nginx/ssl

# SSL Certificate Setup
echo ""
echo "🔐 SSL Certificate Setup"
echo "========================"

if [ ! -f nginx/ssl/pre-trading-approval.inspirationcap.com.crt ] || [ ! -f nginx/ssl/pre-trading-approval.inspirationcap.com.key ]; then
    echo "📋 SSL Certificate Options:"
    echo "   1. Generate self-signed certificate (for testing)"
    echo "   2. Use Let's Encrypt (recommended for production)"
    echo "   3. Use existing company certificate"
    echo ""
    read -p "Choose option (1-3): " SSL_OPTION
    
    case $SSL_OPTION in
        1)
            echo "🔐 Generating self-signed certificate..."
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout nginx/ssl/pre-trading-approval.inspirationcap.com.key \
                -out nginx/ssl/pre-trading-approval.inspirationcap.com.crt \
                -subj "/C=US/ST=CA/L=SF/O=Inspiration Capital/CN=pre-trading-approval.inspirationcap.com" \
                -addext "subjectAltName=DNS:pre-trading-approval.inspirationcap.com"
            echo "✅ Self-signed certificate generated"
            ;;
        2)
            if command -v certbot &> /dev/null; then
                echo "🔐 Generating Let's Encrypt certificate..."
                sudo certbot certonly --standalone \
                    -d pre-trading-approval.inspirationcap.com \
                    --agree-tos --email admin@inspirationcap.com \
                    --non-interactive
                
                sudo cp /etc/letsencrypt/live/pre-trading-approval.inspirationcap.com/fullchain.pem \
                    nginx/ssl/pre-trading-approval.inspirationcap.com.crt
                sudo cp /etc/letsencrypt/live/pre-trading-approval.inspirationcap.com/privkey.pem \
                    nginx/ssl/pre-trading-approval.inspirationcap.com.key
                sudo chown $(whoami):$(whoami) nginx/ssl/*
                echo "✅ Let's Encrypt certificate installed"
            else
                echo "❌ certbot not found. Installing..."
                sudo apt-get update && sudo apt-get install -y certbot
                echo "Please run this script again to continue with Let's Encrypt"
                exit 1
            fi
            ;;
        3)
            echo "📁 Please place your certificate files:"
            echo "   Certificate: nginx/ssl/pre-trading-approval.inspirationcap.com.crt"
            echo "   Private Key: nginx/ssl/pre-trading-approval.inspirationcap.com.key"
            echo ""
            read -p "Press Enter when certificate files are in place..."
            
            if [ ! -f nginx/ssl/pre-trading-approval.inspirationcap.com.crt ] || [ ! -f nginx/ssl/pre-trading-approval.inspirationcap.com.key ]; then
                echo "❌ Certificate files not found. Please place them and try again."
                exit 1
            fi
            echo "✅ Company certificate found"
            ;;
        *)
            echo "❌ Invalid option"
            exit 1
            ;;
    esac
else
    echo "✅ SSL certificates found"
fi

echo ""
echo "🔨 Building and deploying application..."

# Stop existing containers
docker-compose down

# Pull latest images and build
docker-compose pull
docker-compose build --no-cache app

# Start all services
docker-compose up -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 15

# Check service status
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "🔍 Testing endpoints..."

# Health check
if curl -k -f -s https://localhost:443/health > /dev/null 2>&1; then
    echo "✅ Local HTTPS health check passed"
else
    echo "⚠️  Local HTTPS health check failed (services may still be starting)"
fi

# External health check
if curl -f -s https://pre-trading-approval.inspirationcap.com/health > /dev/null 2>&1; then
    echo "✅ External HTTPS health check passed"
else
    echo "⚠️  External HTTPS health check failed (DNS/network configuration needed)"
fi

echo ""
echo "🎉 Company Deployment Complete!"
echo ""
echo "🏢 Company Access URLs:"
echo "   • Main Portal: https://pre-trading-approval.inspirationcap.com"
echo "   • Admin Login: https://pre-trading-approval.inspirationcap.com/admin-login"
echo "   • Health Check: https://pre-trading-approval.inspirationcap.com/health"
echo ""
echo "👥 Employee Instructions:"
echo "   • URL: https://pre-trading-approval.inspirationcap.com"
echo "   • Login: Microsoft 365 company account"
echo "   • Features: Stock/Bond trading requests, history, escalations"
echo ""
echo "🔧 Management Commands:"
echo "   • View logs: docker-compose logs -f app"
echo "   • Restart: docker-compose restart"
echo "   • Stop: docker-compose down"
echo "   • Backup: ./backup-company.sh (create this script)"
echo ""
echo "📋 Next Steps:"
echo "   1. Test admin login with: admin / admin"
echo "   2. Change admin password immediately"
echo "   3. Test employee Microsoft 365 login"
echo "   4. Set up monitoring and backups"
echo "   5. Distribute access instructions to employees"
echo ""
echo "🛡️  Security Reminders:"
echo "   • Change default admin password"
echo "   • Review Microsoft 365 user access"
echo "   • Set up regular backups"
echo "   • Monitor access logs"
echo ""
echo "Happy trading! 📈 Your company system is now live!"