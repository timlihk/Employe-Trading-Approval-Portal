# NAS Deployment Guide - inspirationcap.com

This guide will help you deploy the Trading Approval System on your NAS with Docker and set up a subdomain under inspirationcap.com.

## 🚀 Quick Setup

### 1. Pre-requisites on Your NAS

**Required:**
- Docker and Docker Compose installed
- Domain `inspirationcap.com` with DNS control
- SSL certificate for the subdomain

### 2. Choose Your Subdomain

Using subdomain for your trading system:
- `pre-trading-approval.inspirationcap.com`

### 3. Setup Steps

#### Step 1: Copy Files to Your NAS

```bash
# On your NAS, create a directory
mkdir -p /volume1/docker/trading-approval
cd /volume1/docker/trading-approval

# Copy all project files here
# (You can use SCP, rsync, or your NAS web interface)
```

#### Step 2: Configure Environment

```bash
# Copy the Docker environment template
cp .env.docker .env

# Edit the configuration
nano .env
```

#### Step 3: Update .env File

```bash
# Database Settings
POSTGRES_PASSWORD=your_secure_db_password_here

# Application Security
SESSION_SECRET=your_32_character_random_key_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$fmipEg4.07oJgcSLqiXl7udjJWFapjMrb1XElY88aXy9zROCoOQdG

# Network Configuration - UPDATE THESE
DOMAIN=pre-trading-approval.inspirationcap.com
HTTP_PORT=8080
HTTPS_PORT=8443
HTTP_REDIRECT_PORT=8080

# Optional: Microsoft 365 Integration
AZURE_CLIENT_ID=fb4dbc56-245f-4a9b-aa9f-8bf3ef62af87
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=5f6e95e2-5d75-4fe2-bd97-6ea1239c310e
```

#### Step 4: Generate SSL Certificate

**Option A: Self-Signed (for testing)**
```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/pre-trading-approval.inspirationcap.com.key \
  -out nginx/ssl/pre-trading-approval.inspirationcap.com.crt \
  -subj "/CN=pre-trading-approval.inspirationcap.com"
```

**Option B: Let's Encrypt (recommended for production)**
```bash
# Install certbot on your NAS
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone \
  -d pre-trading-approval.inspirationcap.com \
  --agree-tos --email your-email@inspirationcap.com

# Copy certificates
mkdir -p nginx/ssl
sudo cp /etc/letsencrypt/live/pre-trading-approval.inspirationcap.com/fullchain.pem nginx/ssl/pre-trading-approval.inspirationcap.com.crt
sudo cp /etc/letsencrypt/live/pre-trading-approval.inspirationcap.com/privkey.pem nginx/ssl/pre-trading-approval.inspirationcap.com.key
sudo chown $(whoami):$(whoami) nginx/ssl/*
```

#### Step 5: Update Nginx Configuration

```bash
# Edit nginx configuration to use your domain
nano nginx/nginx.conf
```

Update the server_name line:
```nginx
server_name pre-trading-approval.inspirationcap.com;
```

#### Step 6: Deploy

```bash
# Build and start all services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f app
```

### 4. DNS Configuration

**Add DNS Records for inspirationcap.com:**

1. **A Record**: `pre-trading-approval.inspirationcap.com` → Your NAS public IP
2. **Or CNAME**: `pre-trading-approval.inspirationcap.com` → your-nas-domain.com

**Example DNS settings:**
```
Type: A
Name: pre-trading-approval
Value: 203.0.113.123  # Your NAS public IP
TTL: 300
```

### 5. Router/Firewall Configuration

**Port Forwarding (if accessing from internet):**
- External Port: 443 → Internal Port: 8443 (HTTPS)
- External Port: 80 → Internal Port: 8080 (HTTP redirect)

**Or use your NAS reverse proxy:**
- Configure your NAS reverse proxy to forward `pre-trading-approval.inspirationcap.com` to `localhost:8443`

### 6. Test the Deployment

1. **Local Access**: `https://your-nas-ip:8443`
2. **Domain Access**: `https://pre-trading-approval.inspirationcap.com`

## 🔧 Management Commands

```bash
# View logs
docker-compose logs -f app
docker-compose logs -f nginx
docker-compose logs -f postgres

# Restart services
docker-compose restart app

# Update application
git pull
docker-compose down
docker-compose build --no-cache app
docker-compose up -d

# Backup database
docker exec trading-approval-db pg_dump -U trading_user trading_approval > backup.sql

# Restore database
docker exec -i trading-approval-db psql -U trading_user trading_approval < backup.sql
```

## 🛡️ Security Checklist

- [ ] Strong `POSTGRES_PASSWORD` set
- [ ] Unique `SESSION_SECRET` generated  
- [ ] SSL certificate properly configured
- [ ] Firewall rules configured
- [ ] Regular backups scheduled
- [ ] Admin password changed from default

## 📱 Access URLs

- **Main Application**: `https://pre-trading-approval.inspirationcap.com`
- **Admin Login**: `https://pre-trading-approval.inspirationcap.com/admin-login`
- **Health Check**: `https://pre-trading-approval.inspirationcap.com/health`

## 🔄 Updates

To update the application:

```bash
cd /volume1/docker/trading-approval
git pull
docker-compose down
docker-compose build --no-cache app
docker-compose up -d
```

## 📞 Support

- Check logs: `docker-compose logs -f`
- Restart: `docker-compose restart`
- Full reset: `docker-compose down && docker-compose up -d`

---

## 🎯 Quick Start Commands

```bash
# 1. Setup
cp .env.docker .env
nano .env  # Update DOMAIN and passwords

# 2. SSL Certificate (choose one method above)

# 3. Deploy
docker-compose up -d

# 4. Check
docker-compose ps
curl -k https://localhost:8443/health
```

Your trading approval system will be available at:
**https://pre-trading-approval.inspirationcap.com** 🚀