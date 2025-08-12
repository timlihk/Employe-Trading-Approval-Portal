# 🚀 Complete Beginner's Setup Guide for Lazycat NAS

This guide assumes you have **zero Docker experience** and gives you exact commands to copy and paste.

## ✅ Prerequisites Check

Before we start, make sure your Lazycat NAS has:

1. **Docker installed** - Check by running:
```bash
docker --version
docker-compose --version
```

2. **SSH access to your NAS** - You should be able to SSH into your NAS
3. **Internet connection** - To download Docker images

## 📋 Step 1: Connect to Your NAS

```bash
# Replace 'your-nas-ip' with your actual NAS IP address
ssh your-username@your-nas-ip

# Example: ssh tim@192.168.1.100
```

## 📁 Step 2: Create Project Directory

```bash
# Create a directory for the trading app
mkdir -p ~/apps/trading-approval
cd ~/apps/trading-approval

# Download the project files (you'll need to transfer them)
# We'll create them manually in the next steps
```

## 🔐 Step 3: Generate Secrets (IMPORTANT!)

**Copy each command exactly and run them one by one:**

```bash
# Generate a secure session secret
echo "SESSION_SECRET=$(openssl rand -hex 32)" > secrets.txt

# Generate a secure database password
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)" >> secrets.txt

# Display the generated secrets
echo "=== GENERATED SECRETS ==="
cat secrets.txt
echo "=== SAVE THESE SECRETS ==="
```

**⚠️ IMPORTANT:** Write down these secrets somewhere safe!

## 📝 Step 4: Create Configuration Files

### Create the main environment file:

```bash
cat > .env << 'EOF'
# Database Settings (generated above)
POSTGRES_PASSWORD=REPLACE_WITH_YOUR_GENERATED_PASSWORD

# Application Security (generated above)
SESSION_SECRET=REPLACE_WITH_YOUR_GENERATED_SECRET

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=REPLACE_WITH_HASH_BELOW

# Network Configuration
DOMAIN=lazycat.local
HTTP_PORT=8080
HTTPS_PORT=8443

# Application Settings
LOG_LEVEL=info
NODE_ENV=production
EOF
```

### Generate Admin Password:

```bash
# Choose your admin password (replace 'MySecurePassword123' with your choice)
ADMIN_PASSWORD="MySecurePassword123"

# Generate the password hash
echo "Your admin password hash:"
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('$ADMIN_PASSWORD', 12, (err, hash) => {
  if (err) {
    console.log('Error generating hash. Trying alternative method...');
    console.log('ADMIN_PASSWORD_HASH=' + bcrypt.hashSync('$ADMIN_PASSWORD', 12));
  } else {
    console.log('ADMIN_PASSWORD_HASH=' + hash);
  }
});
" 2>/dev/null || echo "ADMIN_PASSWORD_HASH=$(python3 -c "import bcrypt; print(bcrypt.hashpw('$ADMIN_PASSWORD'.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8'))")"
```

### Update .env file with your values:

```bash
# Edit the .env file and replace the placeholder values
nano .env

# Replace:
# POSTGRES_PASSWORD=REPLACE_WITH_YOUR_GENERATED_PASSWORD
# SESSION_SECRET=REPLACE_WITH_YOUR_GENERATED_SECRET  
# ADMIN_PASSWORD_HASH=REPLACE_WITH_HASH_BELOW
#
# With the actual values from steps above
```

## 🌐 Step 5: Create SSL Certificates

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Generate self-signed certificate for internal use
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=lazycat.local"

echo "SSL certificates created successfully!"
```

## 📊 Step 6: Create Docker Files

### Create Dockerfile:

```bash
cat > Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S trading -u 1001 -G nodejs
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --chown=trading:nodejs . .
RUN mkdir -p logs data && chown -R trading:nodejs logs data
USER trading
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => { process.exit(1); });"
CMD ["npm", "start"]
EOF
```

### Create docker-compose.yml:

```bash
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: trading-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: trading_approval
      POSTGRES_USER: trading_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - postgres_data:/var/lib/postgresql/data/pgdata
    networks:
      - trading-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trading_user -d trading_approval"]
      interval: 30s
      timeout: 10s
      retries: 3

  app:
    build: .
    container_name: trading-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://trading_user:${POSTGRES_PASSWORD}@postgres:5432/trading_approval
      SESSION_SECRET: ${SESSION_SECRET}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_PASSWORD_HASH: ${ADMIN_PASSWORD_HASH}
      FRONTEND_URL: https://${DOMAIN}:${HTTPS_PORT}
      LOG_LEVEL: ${LOG_LEVEL}
      SESSION_STORE_NO_FALLBACK: true
    ports:
      - "${HTTP_PORT}:3001"
    volumes:
      - app_logs:/app/logs
      - app_data:/app/data
    networks:
      - trading-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => { process.exit(1); });"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    container_name: trading-nginx
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "${HTTPS_PORT}:443"
      - "8081:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    networks:
      - trading-network

volumes:
  postgres_data:
  app_logs:
  app_data:

networks:
  trading-network:
    driver: bridge
EOF
```

### Create Nginx configuration:

```bash
cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;
    
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 10M;
    
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    upstream trading_app {
        server app:3001;
    }
    
    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name _;
        return 301 https://$host:8443$request_uri;
    }
    
    # Main HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;
        
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        
        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        
        # Proxy settings
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        location / {
            proxy_pass http://trading_app;
        }
    }
}
EOF
```

## 🚀 Step 7: Deploy the Application

**Now for the magic! Run these commands in order:**

```bash
# 1. Build the Docker images
echo "Building Docker images..."
docker-compose build

# 2. Start all services
echo "Starting all services..."
docker-compose up -d

# 3. Wait a moment for services to start
echo "Waiting for services to start..."
sleep 30

# 4. Check if everything is running
echo "Checking service status..."
docker-compose ps
```

## ✅ Step 8: Test Your Deployment

```bash
# Test if the application is responding
echo "Testing application health..."
curl -k https://localhost:8443/health

# If the above works, you should see: {"status":"ok","timestamp":"..."}
```

## 🌐 Step 9: Access Your Application

Open your web browser and go to:
- **https://lazycat.local:8443** (or replace with your NAS IP: https://192.168.1.100:8443)

**Login with:**
- Username: `admin`
- Password: `MySecurePassword123` (or whatever you chose in Step 4)

## 🔧 Useful Commands for Management

```bash
# View logs
docker-compose logs -f app        # Application logs
docker-compose logs -f postgres   # Database logs
docker-compose logs -f nginx      # Web server logs

# Restart services
docker-compose restart app        # Restart just the app
docker-compose restart            # Restart everything

# Stop everything
docker-compose down

# Start everything
docker-compose up -d

# Update application (after code changes)
docker-compose build app
docker-compose up -d app
```

## 🆘 Troubleshooting

### If something goes wrong:

1. **Check logs:**
```bash
docker-compose logs -f
```

2. **Check if containers are running:**
```bash
docker-compose ps
```

3. **Restart everything:**
```bash
docker-compose down
docker-compose up -d
```

4. **Check your .env file:**
```bash
cat .env
```

### Common Issues:

- **"Port already in use"**: Change the ports in .env file
- **"Permission denied"**: Run with `sudo` if needed
- **"Cannot connect"**: Check if Docker is running: `sudo systemctl status docker`

## 🎉 You're Done!

If you see the login page at https://lazycat.local:8443, congratulations! Your Trading Approval System is now running on your NAS.

Remember to:
- Save your admin password
- Keep the .env file secure
- Take note of the URLs and ports you're using

Need help? Check the logs with `docker-compose logs -f` and look for error messages.
EOF
```

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "1", "content": "Create beginner-friendly step-by-step deployment guide", "status": "completed"}, {"id": "2", "content": "Generate all required secrets and configurations", "status": "in_progress"}, {"id": "3", "content": "Create ready-to-use scripts for deployment", "status": "pending"}, {"id": "4", "content": "Test deployment commands", "status": "pending"}]