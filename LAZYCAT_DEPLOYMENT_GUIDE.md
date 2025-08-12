# LazyCat MicroServer Deployment Guide

Based on LazyCat's documentation, your system has **built-in network tunneling** which is even better than traditional DDNS!

## 🌟 LazyCat Advantages

### **Built-in Network Tunneling:**
- ✅ **No DDNS needed** - Direct global connection to home network
- ✅ **NAT traversal** - Works behind any router/firewall
- ✅ **Zero configuration** - "无感穿透" (seamless penetration)
- ✅ **Cross-platform** virtual private network framework
- ✅ **Multi-factor authentication** built-in

### **Advanced Networking:**
- ✅ **2.5GbE Ethernet** + **WiFi 6E** + **Bluetooth 5.3**
- ✅ **Virtual private network** between all your devices
- ✅ **Web browser access** to private cloud services

## 🚀 Deployment Options for LazyCat

### Option 1: LazyCat Native Tunneling (Recommended)

**Advantages:**
- No port forwarding needed
- No DDNS configuration required
- Works from anywhere in the world
- Built-in security

**Setup:**
```bash
# 1. Deploy using LazyCat's internal network
cp .env.inspirationcap .env

# Edit .env for internal access
nano .env
```

Update `.env` for LazyCat internal network:
```bash
# Use LazyCat's internal domain or IP
DOMAIN=pre-trading-approval.lazycat.local  # or whatever LazyCat provides
HTTP_PORT=8080
HTTPS_PORT=8443

# Keep other settings the same
POSTGRES_PASSWORD=your_secure_password
SESSION_SECRET=your_32_character_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$fmipEg4.07oJgcSLqiXl7udjJWFapjMrb1XElY88aXy9zROCoOQdG
```

### Option 2: Custom Domain + LazyCat Tunneling

**Setup LazyCat tunnel with your domain:**

1. **Configure LazyCat tunneling** for external access
2. **Point your domain** to LazyCat's tunnel endpoint
3. **Use your custom domain**

```bash
# .env configuration
DOMAIN=pre-trading-approval.inspirationcap.com
HTTP_PORT=80
HTTPS_PORT=443
```

### Option 3: Hybrid - LazyCat + Traditional Methods

**For maximum accessibility:**

```bash
# Configure both LazyCat internal + external domain
# This gives you access via:
# - LazyCat network: pre-trading-approval.lazycat.local
# - Public domain: pre-trading-approval.inspirationcap.com
```

## 📋 Step-by-Step Deployment

### Step 1: Choose Your Access Method

**Internal LazyCat Network (Easiest):**
```bash
# Access only via LazyCat's network
# Perfect for personal/internal use
DOMAIN=trading.lazycat.local  # Check LazyCat admin panel for exact format
```

**Public Domain (Business Use):**
```bash
# Access via your inspirationcap.com domain
# Good for business/external access
DOMAIN=pre-trading-approval.inspirationcap.com
```

### Step 2: Configure Environment

```bash
# Copy and edit environment file
cp .env.inspirationcap .env
nano .env

# Update these key settings based on your choice above:
# - DOMAIN (LazyCat internal or public domain)
# - HTTP_PORT (8080 for internal, 80 for public)
# - HTTPS_PORT (8443 for internal, 443 for public)
```

### Step 3: Deploy

```bash
# Deploy the application
./deploy-nas.sh

# The script will:
# 1. Generate SSL certificates for your domain
# 2. Build and start all Docker containers
# 3. Configure Nginx with proper proxy settings
# 4. Set up PostgreSQL database
# 5. Start the trading approval application
```

### Step 4: Access Configuration

**Via LazyCat Network:**
1. Connect your devices to LazyCat network
2. Access: `https://trading.lazycat.local` (or your configured domain)

**Via Public Domain:**
1. Configure DNS: `pre-trading-approval.inspirationcap.com` → Your public IP
2. Configure LazyCat to expose ports 80/443
3. Access: `https://pre-trading-approval.inspirationcap.com`

## 🔧 LazyCat-Specific Configuration

### Check LazyCat Admin Panel:

1. **Network Settings** - Find your internal domain format
2. **Port Forwarding** - Configure if using public domain
3. **Tunnel Configuration** - Set up external access if needed
4. **Security Settings** - Configure MFA and access controls

### LazyCat Network Discovery:

```bash
# Find your LazyCat internal IP/domain
# Check LazyCat admin interface for:
# - Internal domain format (.lazycat.local or similar)
# - Available ports
# - Network configuration
```

## 📱 Access URLs

**Internal LazyCat Network:**
- Main App: `https://trading.lazycat.local:8443`
- Admin: `https://trading.lazycat.local:8443/admin-login`

**Public Domain (if configured):**
- Main App: `https://pre-trading-approval.inspirationcap.com`
- Admin: `https://pre-trading-approval.inspirationcap.com/admin-login`

## 🛡️ Security Benefits

**LazyCat's Built-in Security:**
- ✅ MFA (Multi-Factor Authentication)
- ✅ Encrypted tunneling
- ✅ No open ports on router needed
- ✅ Virtual private network isolation
- ✅ Cross-platform secure access

## 🚀 Quick Start Commands

```bash
# 1. Configure for LazyCat internal network
cp .env.inspirationcap .env
sed -i 's/pre-trading-approval.inspirationcap.com/trading.lazycat.local/g' .env
sed -i 's/HTTP_PORT=80/HTTP_PORT=8080/g' .env
sed -i 's/HTTPS_PORT=443/HTTPS_PORT=8443/g' .env

# 2. Deploy
./deploy-nas.sh

# 3. Access via LazyCat network
# https://trading.lazycat.local:8443
```

## 📞 Next Steps

1. **Check LazyCat admin panel** for exact internal domain format
2. **Configure your preferred access method** (internal vs public)
3. **Run deployment script**
4. **Test access** from your LazyCat-connected devices

Your LazyCat system's **built-in tunneling is actually superior** to traditional DDNS because it provides secure, direct access without any router configuration! 🎉