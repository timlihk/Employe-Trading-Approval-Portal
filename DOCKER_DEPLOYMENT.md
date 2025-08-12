# Docker Deployment Guide for Lazycat NAS

This guide covers deploying the Trading Approval System on your home NAS using Docker and Docker Compose.

## 📋 Prerequisites

1. **Docker & Docker Compose** installed on your Lazycat NAS
2. **Domain/DNS** setup pointing to your NAS (e.g., `lazycat.local`)
3. **SSL certificates** for HTTPS (self-signed or Let's Encrypt)
4. **Port forwarding** configured on your router (if accessing externally)

## 🏗️ Architecture Overview

The Docker deployment includes:
- **PostgreSQL Database** (persistent data storage)
- **Node.js Application** (the trading approval system)
- **Nginx Reverse Proxy** (SSL termination, rate limiting, static files)

## 🚀 Quick Start

### Step 1: Clone and Setup

```bash
# Navigate to your deployment directory on Lazycat NAS
cd /path/to/your/apps

# Clone the repository (if not already done)
git clone https://github.com/timlihk/Employe-Trading-Approval-Portal.git
cd Employe-Trading-Approval-Portal

# Copy the Docker environment template
cp .env.docker .env
```

### Step 2: Configure Environment

Edit the `.env` file:

```bash
nano .env
```

**Required Settings:**
```env
# Database password (change this!)
POSTGRES_PASSWORD=your_secure_database_password_here

# Session secret (generate a secure 32+ character key)
SESSION_SECRET=your_super_secure_random_session_key_32_chars_minimum

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=  # Generate this (see below)

# Your NAS domain
DOMAIN=lazycat.local

# Ports (adjust if needed)
HTTP_PORT=8080
HTTPS_PORT=8443
```

### Step 3: Generate Admin Password Hash

```bash
# Generate a secure password hash
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('your-admin-password-here', 12, (err, hash) => {
  console.log('Add this to your .env file:');
  console.log('ADMIN_PASSWORD_HASH=' + hash);
});
"
```

### Step 4: SSL Certificates

Create SSL certificates for HTTPS:

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Option A: Self-signed certificates (for internal use)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=lazycat.local"

# Option B: Use existing certificates from your NAS
# cp /path/to/your/cert.pem nginx/ssl/cert.pem
# cp /path/to/your/key.pem nginx/ssl/key.pem
```

### Step 5: Deploy

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f app
```

## 🔧 Configuration Details

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `POSTGRES_PASSWORD` | Database password | ✅ | - |
| `SESSION_SECRET` | Session encryption key | ✅ | - |
| `ADMIN_USERNAME` | Admin login username | ✅ | admin |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of admin password | ✅ | - |
| `DOMAIN` | Your NAS domain name | ✅ | lazycat.local |
| `HTTP_PORT` | HTTP port mapping | ❌ | 8080 |
| `HTTPS_PORT` | HTTPS port mapping | ❌ | 8443 |
| `LOG_LEVEL` | Logging level | ❌ | info |

### Port Configuration

- **HTTP**: `8080` → redirects to HTTPS
- **HTTPS**: `8443` → main application
- **Database**: `5432` → PostgreSQL (internal only)

### Directory Structure

```
trading-approval/
├── docker-compose.yml          # Main orchestration
├── Dockerfile                  # App container definition
├── .env                       # Environment configuration
├── nginx/
│   ├── nginx.conf            # Nginx configuration
│   └── ssl/                  # SSL certificates
│       ├── cert.pem
│       └── key.pem
└── ...                       # Application files
```

## 📊 Managing the Deployment

### Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart a specific service
docker-compose restart app

# View logs
docker-compose logs -f app
docker-compose logs -f postgres
docker-compose logs -f nginx

# Update the application
git pull
docker-compose build app
docker-compose up -d app

# Database backup
docker-compose exec postgres pg_dump -U trading_user trading_approval > backup.sql

# Database restore
docker-compose exec -T postgres psql -U trading_user trading_approval < backup.sql
```

### Health Checks

```bash
# Check application health
curl -k https://lazycat.local:8443/health

# Check database connection
docker-compose exec app node -e "
const db = require('./src/models/database');
console.log('Database connection test - check logs');
"

# Check all container status
docker-compose ps
```

## 🔒 Security Considerations

### Firewall Configuration

If accessing from outside your network:

```bash
# Allow HTTPS traffic
sudo ufw allow 8443/tcp

# Optional: Allow HTTP for redirects
sudo ufw allow 8080/tcp
```

### SSL Best Practices

- Use proper SSL certificates (Let's Encrypt recommended)
- Keep certificates updated
- Consider using a reverse proxy like Traefik for automatic SSL

### Network Security

- The database port (5432) is not exposed externally
- Nginx handles rate limiting and basic security headers
- All HTTP traffic redirects to HTTPS

## 📁 Data Persistence

### Volume Mounts

| Volume | Purpose | Host Path |
|--------|---------|-----------|
| `postgres_data` | Database storage | Docker managed |
| `app_logs` | Application logs | Docker managed |
| `app_data` | App data files | Docker managed |
| `nginx_logs` | Web server logs | Docker managed |

### Backup Strategy

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/path/to/backups/trading-approval"
mkdir -p "$BACKUP_DIR"

# Database backup
docker-compose exec -T postgres pg_dump -U trading_user trading_approval > "$BACKUP_DIR/db_$DATE.sql"

# Application data backup
docker-compose run --rm app tar czf - /app/logs /app/data > "$BACKUP_DIR/app_data_$DATE.tar.gz"

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup.sh
```

## 🐛 Troubleshooting

### Common Issues

1. **Container fails to start**
   ```bash
   # Check logs
   docker-compose logs app
   
   # Check environment variables
   docker-compose config
   ```

2. **Database connection issues**
   ```bash
   # Verify database is running
   docker-compose exec postgres pg_isready -U trading_user
   
   # Check database logs
   docker-compose logs postgres
   ```

3. **SSL certificate issues**
   ```bash
   # Verify certificate files exist
   ls -la nginx/ssl/
   
   # Test certificate
   openssl x509 -in nginx/ssl/cert.pem -text -noout
   ```

4. **Permission issues**
   ```bash
   # Fix file permissions
   sudo chown -R 1001:1001 logs/ data/
   ```

### Performance Tuning

For better performance on your NAS:

```yaml
# Add to docker-compose.yml under app service
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '1.0'
    reservations:
      memory: 256M
      cpus: '0.5'
```

## 🔄 Updates and Maintenance

### Updating the Application

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose build app
docker-compose up -d app

# Verify update
curl -k https://lazycat.local:8443/health
```

### Log Rotation

```bash
# Add log rotation
cat > /etc/logrotate.d/trading-approval << 'EOF'
/var/lib/docker/volumes/trading-approval_app_logs/_data/*.log
/var/lib/docker/volumes/trading-approval_nginx_logs/_data/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    postrotate
        docker-compose restart nginx app
    endscript
}
EOF
```

## 📞 Support

### Monitoring

Access your application at:
- **Main App**: https://lazycat.local:8443
- **Health Check**: https://lazycat.local:8443/health
- **Admin Panel**: https://lazycat.local:8443/admin-login

### Getting Help

1. Check the logs: `docker-compose logs -f`
2. Verify configuration: `docker-compose config`
3. Test connectivity: `curl -k https://lazycat.local:8443/health`
4. Review environment variables in `.env`

Your Trading Approval System is now running on your Lazycat NAS with Docker! 🎉