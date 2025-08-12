# Oracle Cloud VPS Deployment Guide

## 🌟 **Why Oracle Cloud Always Free Tier?**

✅ **Forever Free** - No time limits, no credit card required after trial  
✅ **Professional hosting** - Enterprise-grade infrastructure  
✅ **Global accessibility** - Access from anywhere  
✅ **1GB RAM, 1 OCPU** - Perfect for this application  
✅ **47GB storage** - Plenty for database and logs  
✅ **Static public IP** - No DDNS needed  

## 📋 **Oracle Cloud Setup Steps**

### **Step 1: Create Oracle Cloud Instance**

**Instance Configuration:**
```
Shape: VM.Standard.E2.1.Micro (Always Free)
Image: Ubuntu 22.04 LTS (or Oracle Linux 8)
Boot Volume: 47GB (default)
Network: Create new VCN or use existing
```

**Security Configuration:**
- **SSH Keys**: Upload your public key
- **Network Security Group**: Allow SSH (22), HTTP (80), HTTPS (443)

### **Step 2: Configure Oracle Cloud Networking**

**In Oracle Console:**
1. **Virtual Cloud Network (VCN)**
   - Create or use existing VCN
   - Public subnet configuration

2. **Security Lists**
   ```
   Ingress Rules:
   - Source: 0.0.0.0/0, Protocol: TCP, Port: 22 (SSH)
   - Source: 0.0.0.0/0, Protocol: TCP, Port: 80 (HTTP)  
   - Source: 0.0.0.0/0, Protocol: TCP, Port: 443 (HTTPS)
   ```

3. **Instance Details**
   - Note your **Public IP Address**
   - This will be your static IP (no DDNS needed!)

### **Step 3: DNS Configuration**

Add A record to your `inspirationcap.com` DNS:
```dns
Type: A
Name: pre-trading-approval
Value: YOUR_ORACLE_PUBLIC_IP
TTL: 300
```

### **Step 4: Connect and Deploy**

**SSH to your Oracle instance:**
```bash
ssh ubuntu@YOUR_ORACLE_PUBLIC_IP
# or
ssh opc@YOUR_ORACLE_PUBLIC_IP  # for Oracle Linux
```

**Upload deployment files:**
```bash
# Option 1: Git clone (if repo is public)
git clone https://github.com/your-repo/trading_approval.git
cd trading_approval

# Option 2: SCP from local machine
scp -r /home/timlihk/trading_approval/ ubuntu@YOUR_ORACLE_IP:/home/ubuntu/
ssh ubuntu@YOUR_ORACLE_IP
cd trading_approval
```

**Deploy:**
```bash
# Run the Oracle Cloud deployment script
./deploy-oracle.sh
```

## 🔧 **Oracle-Specific Optimizations**

### **Memory Optimization (Always Free: 1GB)**
The deployment automatically optimizes for Oracle's memory limits:

```yaml
# Auto-generated docker-compose.oracle.yml
services:
  app:
    mem_limit: 400m
    environment:
      - NODE_OPTIONS="--max-old-space-size=256"
  
  postgres:
    mem_limit: 200m
    environment:
      - POSTGRES_SHARED_BUFFERS=32MB
      
  nginx:
    mem_limit: 50m
```

### **Storage Optimization**
- **Boot Volume**: 47GB (Always Free)
- **Database**: PostgreSQL with optimized settings
- **Logs**: Rotated automatically
- **SSL**: Let's Encrypt certificates

## 🔒 **Oracle Cloud Security Setup**

### **Firewall Configuration (Automatic)**
The script handles both levels:

**1. Oracle Console Security Lists:**
- Already configured during instance creation
- Ports 80, 443 open to internet (0.0.0.0/0)

**2. Instance iptables:**
```bash
# Auto-configured by deploy script
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
```

### **SSL Certificate Options**
1. **Let's Encrypt** (Recommended - Free, Auto-renewal)
2. **Self-signed** (Testing only)
3. **Company certificate** (Enterprise)

## 🚀 **Deployment Process**

### **Automatic Detection**
The script detects Oracle Cloud environment and optimizes accordingly:

```bash
./deploy-oracle.sh
```

**What it does:**
1. ✅ Installs Docker & Docker Compose
2. ✅ Configures Oracle firewall rules  
3. ✅ Generates SSL certificates
4. ✅ Optimizes for 1GB memory
5. ✅ Sets up PostgreSQL database
6. ✅ Configures Nginx reverse proxy
7. ✅ Tests all endpoints

### **Memory Monitoring**
```bash
# Monitor resource usage
docker stats

# Check available memory
free -h

# View application logs
docker-compose logs -f app
```

## 📱 **Access URLs**

**Public Access:**
- **Main Portal**: `https://pre-trading-approval.inspirationcap.com`
- **Admin Portal**: `https://pre-trading-approval.inspirationcap.com/admin-login`
- **Health Check**: `https://pre-trading-approval.inspirationcap.com/health`

**Direct IP Access (backup):**
- `https://YOUR_ORACLE_PUBLIC_IP`

## 🎯 **Oracle Always Free Limits**

**Compute:**
- **Instance**: VM.Standard.E2.1.Micro
- **CPU**: 1 OCPU (1/8 of physical core)
- **Memory**: 1GB RAM
- **Network**: 10 Mbps bandwidth

**Storage:**
- **Boot Volume**: 47GB
- **Block Volume**: 200GB total (can create additional)
- **Object Storage**: 20GB

**Database:**
- Can run PostgreSQL in container (included in deployment)
- Or use Oracle Autonomous Database (23GB Always Free)

## 🔧 **Management Commands**

```bash
# Application management
docker-compose logs -f app        # View logs
docker-compose restart app       # Restart app
docker-compose down              # Stop all services
docker-compose up -d             # Start services

# System monitoring  
htop                             # System resources
df -h                            # Disk usage
docker system df                 # Docker storage usage

# Updates
docker-compose pull              # Pull latest images
docker-compose up -d             # Apply updates
```

## 📊 **Performance Expectations**

**Oracle Always Free (1GB RAM):**
- ✅ **Concurrent Users**: 5-10 active users
- ✅ **Response Time**: 200-500ms
- ✅ **Database**: Small-medium datasets (< 100MB)
- ✅ **Uptime**: Enterprise-grade availability

**Optimization tips:**
- Application uses memory-efficient Node.js settings
- PostgreSQL optimized for low memory
- Nginx serves static files efficiently
- Container limits prevent OOM kills

## 🛡️ **Security Features**

**Network Security:**
- ✅ Oracle Cloud Security Lists (enterprise firewall)
- ✅ Instance iptables rules
- ✅ SSL/TLS encryption (Let's Encrypt)
- ✅ Security headers in Nginx

**Application Security:**
- ✅ Microsoft 365 SSO integration
- ✅ CSRF protection
- ✅ Admin authentication
- ✅ Input validation and sanitization

## 💰 **Cost Analysis**

**Always Free Resources Used:**
- ✅ **Compute**: 1 instance (VM.Standard.E2.1.Micro)
- ✅ **Storage**: ~5GB used of 47GB boot volume
- ✅ **Network**: Standard egress (10TB/month free)
- ✅ **Load Balancer**: Not needed (using Nginx)

**Total Monthly Cost: $0.00** 🎉

## 📞 **Troubleshooting Oracle Cloud**

### **Common Issues:**

**1. Can't access after deployment:**
```bash
# Check Oracle Security Lists
# Oracle Console → Networking → Security Lists
# Verify ports 80, 443 are open

# Check instance firewall
sudo iptables -L -n | grep -E "(80|443)"

# Test from instance
curl https://localhost/health
```

**2. Memory issues:**
```bash
# Monitor memory
free -h
docker stats

# If running out of memory
docker system prune -f  # Clean unused containers
```

**3. SSL certificate issues:**
```bash
# Check certificate
openssl x509 -in nginx/ssl/pre-trading-approval.inspirationcap.com.crt -text -noout

# Regenerate if needed
./deploy-oracle.sh  # Re-run with SSL option
```

## 🎉 **Quick Setup Summary**

1. **Create Oracle Cloud instance** (Always Free)
2. **Configure Security Lists** (ports 80, 443)
3. **Add DNS A record**: `pre-trading-approval.inspirationcap.com → ORACLE_IP`
4. **SSH to instance and deploy**:
   ```bash
   git clone YOUR_REPO
   cd trading_approval
   ./deploy-oracle.sh
   ```
5. **Access**: `https://pre-trading-approval.inspirationcap.com`

Your enterprise trading approval system will be running on Oracle Cloud's robust infrastructure with zero monthly costs! 🌟📈