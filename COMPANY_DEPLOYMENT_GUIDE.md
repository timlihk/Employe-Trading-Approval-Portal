# Company Deployment Guide - inspirationcap.com

## 🏢 **Recommended Setup for Business Use**

For your company deployment, I recommend **Public Domain + LazyCat Tunneling** which provides:

✅ **Professional appearance**: `https://pre-trading-approval.inspirationcap.com`  
✅ **Enterprise security**: LazyCat's built-in MFA and encryption  
✅ **Easy access**: Employees can access from any device/network  
✅ **No IT complexity**: LazyCat handles the networking automatically  

## 🚀 **Deployment Strategy**

### **Step 1: DNS Configuration**

Add this DNS record to your `inspirationcap.com` domain:

```dns
Type: A
Name: pre-trading-approval
Value: YOUR_CURRENT_PUBLIC_IP
TTL: 300 (5 minutes)
```

**Find your current IP:**
```bash
curl https://ipv4.icanhazip.com
```

### **Step 2: LazyCat Configuration**

**In your LazyCat admin panel:**

1. **Enable External Access**:
   - Configure port forwarding: 80 → 80, 443 → 443
   - Or enable LazyCat's tunnel exposure to internet

2. **Security Settings**:
   - Enable MFA for admin access
   - Configure access control policies
   - Set up audit logging

### **Step 3: Deploy Application**

```bash
# Use company configuration
cp .env.inspirationcap .env

# Update passwords (IMPORTANT!)
nano .env
```

**Critical .env updates:**
```bash
# CHANGE THESE IMMEDIATELY
POSTGRES_PASSWORD=YourCompanySecureDBPassword2024!
SESSION_SECRET=Generate32CharacterRandomKeyForCompany123

# Company domain
DOMAIN=pre-trading-approval.inspirationcap.com
HTTP_PORT=80
HTTPS_PORT=443

# Your Microsoft 365 integration
AZURE_CLIENT_ID=fb4dbc56-245f-4a9b-aa9f-8bf3ef62af87
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=5f6e95e2-5d75-4fe2-bd97-6ea1239c310e
```

### **Step 4: Deploy**

```bash
./deploy-nas.sh
```

## 🛡️ **Security Considerations for Company Use**

### **1. SSL Certificate (Choose one):**

**Option A: Let's Encrypt (Recommended)**
```bash
# Install certbot on LazyCat
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone \
  -d pre-trading-approval.inspirationcap.com \
  --agree-tos --email admin@inspirationcap.com

# Update nginx to use real certificates
sudo cp /etc/letsencrypt/live/pre-trading-approval.inspirationcap.com/fullchain.pem \
  nginx/ssl/pre-trading-approval.inspirationcap.com.crt
sudo cp /etc/letsencrypt/live/pre-trading-approval.inspirationcap.com/privkey.pem \
  nginx/ssl/pre-trading-approval.inspirationcap.com.key

# Restart nginx
docker-compose restart nginx
```

**Option B: Company SSL Certificate**
```bash
# Use your company's SSL certificate
# Copy certificate files to:
# nginx/ssl/pre-trading-approval.inspirationcap.com.crt
# nginx/ssl/pre-trading-approval.inspirationcap.com.key
```

### **2. Backup Strategy**

```bash
# Create backup script
cat > backup-company.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/volume1/backups/trading-approval"

mkdir -p "$BACKUP_DIR"

# Backup database
docker exec trading-approval-db pg_dump -U trading_user trading_approval > \
  "$BACKUP_DIR/database_$DATE.sql"

# Backup application data
tar -czf "$BACKUP_DIR/app_data_$DATE.tar.gz" \
  -C /volume1/docker/trading-approval \
  .env nginx/ssl logs

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x backup-company.sh

# Run daily at 2 AM
echo "0 2 * * * /volume1/docker/trading-approval/backup-company.sh" | crontab -
```

### **3. Monitoring & Logging**

```bash
# Monitor application health
cat > monitor-health.sh << 'EOF'
#!/bin/bash
URL="https://pre-trading-approval.inspirationcap.com/health"
EMAIL="admin@inspirationcap.com"

if ! curl -f -s "$URL" > /dev/null; then
    echo "Trading approval system is down!" | \
    mail -s "ALERT: Trading System Down" "$EMAIL"
fi
EOF

# Check every 5 minutes
echo "*/5 * * * * /volume1/docker/trading-approval/monitor-health.sh" | crontab -
```

## 📋 **Company Access Management**

### **Employee Access:**
- **URL**: `https://pre-trading-approval.inspirationcap.com`
- **Login**: Microsoft 365 SSO (already configured)
- **Features**: Bond and equity trading requests

### **Admin Access:**
- **URL**: `https://pre-trading-approval.inspirationcap.com/admin-login`
- **Login**: admin / admin (change immediately)
- **Features**: Approve/reject requests, manage restricted stocks

### **IT Management:**
- **Health**: `https://pre-trading-approval.inspirationcap.com/health`
- **Logs**: `docker-compose logs -f app`
- **Database**: PostgreSQL with automated backups

## 🌐 **Network Architecture**

```
Internet
    ↓
inspirationcap.com DNS
    ↓
LazyCat MicroServer (Public IP)
    ↓
Docker Network:
├── Nginx (Reverse Proxy + SSL)
├── Trading App (Node.js)
└── PostgreSQL Database
```

## 📱 **Employee Onboarding**

**Send this to your employees:**

---

**Trading Approval System Access**

**URL**: https://pre-trading-approval.inspirationcap.com

**Login**: Use your company Microsoft 365 account

**Features**:
- Submit stock trading requests (AAPL, MSFT, etc.)
- Submit bond trading requests (enter ISIN codes like US594918AD65)
- View trading history
- Escalate restricted stock requests

**For bonds**: Enter the face value in USD (e.g., 10000 for $10,000 face value)

---

## 🔧 **Maintenance Tasks**

### **Weekly:**
- Check system health and logs
- Review trading requests and audit logs
- Verify backup completion

### **Monthly:**
- Update SSL certificate (if using Let's Encrypt)
- Review user access and permissions
- Check for application updates

### **Quarterly:**
- Full system backup verification
- Security audit
- Performance review

## 🎯 **Quick Deployment Checklist**

- [ ] DNS record added: `pre-trading-approval.inspirationcap.com`
- [ ] LazyCat configured for external access
- [ ] `.env` file updated with company passwords
- [ ] SSL certificate installed (Let's Encrypt or company cert)
- [ ] Application deployed: `./deploy-nas.sh`
- [ ] Health check: `https://pre-trading-approval.inspirationcap.com/health`
- [ ] Admin access tested
- [ ] Employee access tested
- [ ] Backup script configured
- [ ] Monitoring enabled

## 📞 **Support & Troubleshooting**

**Common Issues:**
- **Can't access**: Check DNS propagation and LazyCat port forwarding
- **SSL errors**: Verify certificate installation
- **Login issues**: Check Microsoft 365 configuration
- **Performance**: Monitor Docker resource usage

**Logs:**
```bash
# Application logs
docker-compose logs -f app

# Nginx logs  
docker-compose logs -f nginx

# Database logs
docker-compose logs -f postgres
```

Your company trading approval system will be enterprise-ready with this setup! 🏢📈