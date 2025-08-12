#!/bin/bash

# Oracle Cloud VPS Deployment Script
# Usage: ./deploy-oracle.sh

set -e

echo "☁️  Trading Approval System - Oracle Cloud VPS Deployment"
echo "======================================================="
echo "Domain: pre-trading-approval.inspirationcap.com"
echo "Oracle Always Free Tier: VM.Standard.E2.1.Micro"
echo ""

# Check if running on Oracle Cloud (detect by checking for Oracle Linux or specific metadata)
if [ -f /etc/oracle-release ] || [ -f /etc/redhat-release ]; then
    echo "✅ Detected Oracle Linux environment"
elif [ -f /etc/debian_version ]; then
    echo "✅ Detected Ubuntu environment (Oracle Cloud)"
else
    echo "ℹ️  System type: $(uname -a)"
fi

# Check if docker and docker-compose are available
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed. Please log out and back in, then run this script again."
    exit 0
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed"
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📄 Creating .env file from Oracle template..."
    cp .env.oracle .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file and update:"
    echo "   - POSTGRES_PASSWORD (use a strong password)"
    echo "   - SESSION_SECRET (generate a new 32-character key)"
    echo "   - Verify domain and Azure credentials"
    echo ""
    echo "After editing .env, run this script again."
    exit 0
fi

echo "✅ Environment file found"

# Get Oracle Cloud public IP
echo "🌐 Oracle Cloud Network Configuration..."
PUBLIC_IP=$(curl -s https://ipv4.icanhazip.com 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null || echo "UNKNOWN")
echo "   Oracle VPS public IP: $PUBLIC_IP"

# Check Oracle Cloud firewall status
echo "🔥 Checking Oracle Cloud firewall..."
if command -v iptables &> /dev/null; then
    IPTABLES_RULES=$(sudo iptables -L INPUT -n | grep -E "(80|443)" || echo "")
    if [ -z "$IPTABLES_RULES" ]; then
        echo "⚠️  Firewall rules for ports 80/443 not found"
        echo "📋 Oracle Cloud Firewall Setup Required:"
        echo ""
        echo "1. Oracle Console → Networking → Security Lists"
        echo "   Add Ingress Rules:"
        echo "   - Source: 0.0.0.0/0, Protocol: TCP, Port: 80 (HTTP)"
        echo "   - Source: 0.0.0.0/0, Protocol: TCP, Port: 443 (HTTPS)"
        echo ""
        echo "2. Instance Firewall (iptables):"
        echo "   sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT"
        echo "   sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT"
        echo "   sudo iptables-save > /etc/iptables/rules.v4"
        echo ""
        read -p "Configure firewall now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "🔧 Configuring instance firewall..."
            sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
            sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
            # Save rules (different commands for different distros)
            if command -v iptables-save &> /dev/null; then
                if [ -d /etc/iptables ]; then
                    sudo mkdir -p /etc/iptables
                    sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null
                fi
            fi
            echo "✅ Instance firewall configured"
            echo "⚠️  Don't forget to configure Oracle Console Security Lists!"
        fi
    else
        echo "✅ Firewall rules found for HTTP/HTTPS"
    fi
fi

# DNS Check
echo "🔍 Checking DNS configuration..."
DNS_RESULT=$(nslookup pre-trading-approval.inspirationcap.com 2>/dev/null || echo "NOT_FOUND")

if echo "$DNS_RESULT" | grep -q "NXDOMAIN\|NOT_FOUND"; then
    echo "⚠️  DNS record not found for pre-trading-approval.inspirationcap.com"
    echo ""
    echo "📋 DNS Setup Required:"
    echo "   Add A record to inspirationcap.com DNS:"
    echo "   Type: A"
    echo "   Name: pre-trading-approval"
    echo "   Value: $PUBLIC_IP"
    echo "   TTL: 300"
    echo ""
    read -p "Continue deployment for testing? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled. Please configure DNS first."
        exit 1
    fi
else
    echo "✅ DNS record found"
    DNS_IP=$(echo "$DNS_RESULT" | grep "Address:" | tail -1 | awk '{print $2}')
    echo "   DNS points to: $DNS_IP"
    if [ "$DNS_IP" != "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "UNKNOWN" ]; then
        echo "   ⚠️  Note: DNS IP ($DNS_IP) differs from Oracle VPS IP ($PUBLIC_IP)"
        echo "        You may need to update your DNS record"
    fi
fi

# Create SSL directory
mkdir -p nginx/ssl

# SSL Certificate Setup for Oracle Cloud
echo ""
echo "🔐 SSL Certificate Setup for Oracle Cloud"
echo "========================================"

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
                # Stop any running nginx to free port 80
                docker-compose down nginx 2>/dev/null || true
                
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
                echo "📦 Installing certbot..."
                if [ -f /etc/debian_version ]; then
                    sudo apt-get update && sudo apt-get install -y certbot
                elif [ -f /etc/redhat-release ]; then
                    sudo dnf install -y certbot || sudo yum install -y certbot
                fi
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
echo "🔨 Building and deploying application on Oracle Cloud..."

# Stop existing containers
docker-compose down

# Check available memory (Oracle Free tier has 1GB)
AVAILABLE_MEM=$(free -m | grep '^Mem:' | awk '{print $7}')
echo "📊 Available memory: ${AVAILABLE_MEM}MB"

if [ "$AVAILABLE_MEM" -lt 400 ]; then
    echo "⚠️  Low memory detected. Optimizing for Oracle Always Free tier..."
    # Create memory-optimized docker-compose override
    cat > docker-compose.oracle.yml << 'EOF'
version: '3.8'

services:
  app:
    mem_limit: 400m
    memswap_limit: 600m
    environment:
      - NODE_OPTIONS="--max-old-space-size=256"
    
  postgres:
    mem_limit: 200m
    memswap_limit: 300m
    environment:
      - POSTGRES_SHARED_BUFFERS=32MB
      - POSTGRES_EFFECTIVE_CACHE_SIZE=128MB
      
  nginx:
    mem_limit: 50m
    memswap_limit: 50m
EOF
    COMPOSE_FILES="-f docker-compose.yml -f docker-compose.oracle.yml"
else
    COMPOSE_FILES="-f docker-compose.yml"
fi

# Pull latest images and build
docker-compose $COMPOSE_FILES pull
docker-compose $COMPOSE_FILES build --no-cache app

# Start all services
docker-compose $COMPOSE_FILES up -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 20

# Check service status
echo "📊 Service Status:"
docker-compose $COMPOSE_FILES ps

echo ""
echo "🔍 Testing endpoints..."

# Health check
if curl -k -f -s https://localhost:443/health > /dev/null 2>&1; then
    echo "✅ Local HTTPS health check passed"
else
    echo "⚠️  Local HTTPS health check failed (services may still be starting)"
    # Show logs for debugging
    echo "📝 Application logs:"
    docker-compose logs --tail=10 app
fi

# External health check
if curl -f -s https://pre-trading-approval.inspirationcap.com/health > /dev/null 2>&1; then
    echo "✅ External HTTPS health check passed"
else
    echo "⚠️  External HTTPS health check failed (DNS/firewall configuration needed)"
fi

echo ""
echo "🎉 Oracle Cloud VPS Deployment Complete!"
echo ""
echo "☁️  Oracle Cloud Access URLs:"
echo "   • Main Portal: https://pre-trading-approval.inspirationcap.com"
echo "   • Admin Login: https://pre-trading-approval.inspirationcap.com/admin-login"
echo "   • Health Check: https://pre-trading-approval.inspirationcap.com/health"
echo "   • Direct IP: https://$PUBLIC_IP (if DNS not configured)"
echo ""
echo "👥 Employee Instructions:"
echo "   • URL: https://pre-trading-approval.inspirationcap.com"
echo "   • Login: Microsoft 365 company account"
echo "   • Features: Stock/Bond trading requests, history, escalations"
echo ""
echo "🔧 Oracle Cloud Management Commands:"
echo "   • View logs: docker-compose logs -f app"
echo "   • Restart: docker-compose restart"
echo "   • Stop: docker-compose down"
echo "   • Update: docker-compose pull && docker-compose up -d"
echo ""
echo "📋 Oracle Cloud Next Steps:"
echo "   1. ☁️  Configure Oracle Console Security Lists (ports 80, 443)"
echo "   2. 🔗 Update DNS: pre-trading-approval.inspirationcap.com → $PUBLIC_IP"
echo "   3. 🔑 Test admin login: admin / admin"
echo "   4. 👤 Change admin password immediately"
echo "   5. 🧪 Test employee Microsoft 365 login"
echo "   6. 📊 Monitor memory usage: docker stats"
echo ""
echo "💰 Oracle Always Free Tier Specs:"
echo "   • Instance: VM.Standard.E2.1.Micro"
echo "   • CPU: 1 OCPU (ARM-based Ampere A1 or AMD)"
echo "   • Memory: 1GB RAM"
echo "   • Storage: 47GB boot volume"
echo "   • Network: 10 Mbps"
echo ""
echo "📈 Happy trading! Your company system is now live on Oracle Cloud!"