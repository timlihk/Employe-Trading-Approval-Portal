# Dynamic IP Solutions for NAS Deployment

You don't need a static IP address! Here are several solutions for hosting with a dynamic IP:

## 🌐 Option 1: Dynamic DNS (DDNS) - Recommended

### What is DDNS?
Dynamic DNS automatically updates your DNS record when your IP address changes.

### Popular DDNS Providers:
1. **No-IP** (free tier available)
2. **DuckDNS** (completely free)
3. **Cloudflare** (free with API)
4. **DynDNS**
5. **Afraid.org** (free)

### Setup with Cloudflare (Recommended):

1. **Add your domain to Cloudflare**:
   - Transfer DNS management to Cloudflare
   - Keep your domain registration where it is

2. **Create A record**:
   ```
   Type: A
   Name: pre-trading-approval
   Value: YOUR_CURRENT_IP (will be auto-updated)
   Proxy: Off (important!)
   TTL: Auto
   ```

3. **Install DDNS updater on your NAS**:
   ```bash
   # Create update script
   cat > /volume1/docker/trading-approval/update-ip.sh << 'EOF'
   #!/bin/bash
   
   # Cloudflare DDNS updater
   ZONE_ID="your-zone-id"
   RECORD_ID="your-record-id"
   API_TOKEN="your-api-token"
   DOMAIN="pre-trading-approval.inspirationcap.com"
   
   # Get current public IP
   CURRENT_IP=$(curl -s https://ipv4.icanhazip.com)
   
   # Update Cloudflare DNS
   curl -X PUT "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$RECORD_ID" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{\"type\":\"A\",\"name\":\"$DOMAIN\",\"content\":\"$CURRENT_IP\"}"
   EOF
   
   chmod +x update-ip.sh
   
   # Add to crontab (update every 5 minutes)
   crontab -e
   # Add this line:
   # */5 * * * * /volume1/docker/trading-approval/update-ip.sh
   ```

## 🏠 Option 2: NAS Built-in DDNS

Most NAS devices have built-in DDNS support:

### Synology NAS:
1. **Control Panel** → **External Access** → **DDNS**
2. Choose provider (Synology, No-IP, DynDNS, etc.)
3. Create account and configure
4. Use: `yourname.synology.me` or custom domain

### QNAP NAS:
1. **Control Panel** → **Network & File Services** → **DDNS**
2. Configure with provider
3. Use: `yourname.myqnapcloud.com` or custom domain

### Setup Steps:
```bash
# Update .env file to use your DDNS hostname
DOMAIN=yourname.synology.me
# or
DOMAIN=pre-trading-approval.inspirationcap.com  # if using custom domain
```

## 🌍 Option 3: Reverse Proxy Services

### Cloudflare Tunnel (Free):
```bash
# Install cloudflared on your NAS
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Login and create tunnel
cloudflared tunnel login
cloudflared tunnel create trading-approval
cloudflared tunnel route dns trading-approval pre-trading-approval.inspirationcap.com

# Create config
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: your-tunnel-id
credentials-file: /root/.cloudflared/your-tunnel-id.json

ingress:
  - hostname: pre-trading-approval.inspirationcap.com
    service: https://localhost:443
    originServerName: pre-trading-approval.inspirationcap.com
  - service: http_status:404
EOF

# Run tunnel
cloudflared tunnel run trading-approval
```

### Ngrok (Paid for custom domains):
```bash
# Install ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Configure with your token
ngrok config add-authtoken YOUR_TOKEN

# Create tunnel (requires paid plan for custom domain)
ngrok http --domain=pre-trading-approval.inspirationcap.com 443
```

## 🏠 Option 4: VPN + Local Access

If external access isn't critical:

### WireGuard VPN:
```bash
# Install WireGuard on NAS
# Create VPN tunnel
# Access via: https://192.168.1.100:443 (local IP)
```

### Tailscale (Easy VPN):
```bash
# Install Tailscale on NAS and devices
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Access via Tailscale IP
# No port forwarding needed!
```

## 🛡️ Option 5: Port Forwarding + Manual Updates

If you rarely change IP:

### Router Configuration:
1. **Reserve IP for NAS** in router (DHCP reservation)
2. **Port Forward**: 80→NAS:80, 443→NAS:443
3. **Find your IP**: `curl https://ipv4.icanhazip.com`
4. **Update DNS manually** when IP changes

### Monitor IP Changes:
```bash
# Script to email you when IP changes
cat > /volume1/docker/check-ip.sh << 'EOF'
#!/bin/bash
OLD_IP=$(cat /tmp/last_ip 2>/dev/null || echo "")
NEW_IP=$(curl -s https://ipv4.icanhazip.com)

if [ "$OLD_IP" != "$NEW_IP" ]; then
    echo "IP changed from $OLD_IP to $NEW_IP"
    echo "$NEW_IP" > /tmp/last_ip
    # Send email notification
    echo "Public IP changed to: $NEW_IP" | mail -s "NAS IP Changed" your-email@inspirationcap.com
fi
EOF

# Run every hour
0 * * * * /volume1/docker/check-ip.sh
```

## 📋 Recommended Setup

**For Production Use:**
1. **Cloudflare DNS** (free)
2. **DDNS script** (auto-update)
3. **Cloudflare Tunnel** (optional, for extra security)

**Quick Setup:**
1. **Use NAS built-in DDNS** (easiest)
2. **Point your domain** to DDNS hostname

## 🚀 Updated Deployment

Choose your preferred method and update `.env`:

```bash
# Option 1: DDNS with custom domain
DOMAIN=pre-trading-approval.inspirationcap.com

# Option 2: NAS DDNS hostname
DOMAIN=yourname.synology.me

# Option 3: Cloudflare Tunnel (no port forwarding needed)
DOMAIN=pre-trading-approval.inspirationcap.com
```

## 🔧 Testing

```bash
# Test external access
curl -k https://pre-trading-approval.inspirationcap.com/health

# Check DNS resolution
nslookup pre-trading-approval.inspirationcap.com

# Check port accessibility
telnet your-public-ip 443
```

You don't need a static IP - dynamic DNS is the modern solution! 🌐