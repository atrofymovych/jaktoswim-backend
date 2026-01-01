#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting VPS Setup..."

# Update system
echo "📦 Updating system packages..."
apt-get update && apt-get upgrade -y
apt-get install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release ufw git

# Setup Firewall (UFW)
echo "🛡️ Configuring Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8080/tcp # For Traefik Dashboard / Dozzle / App debug if needed
# Enable UFW
echo "y" | ufw enable

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Enable Docker service
    systemctl enable docker
    systemctl start docker
else
    echo "Docker already installed."
fi

# Create app directory
echo "Tb Creating app directory..."
mkdir -p ~/dao-app
cd ~/dao-app

echo "✅ VPS Setup Complete! Ready for deployment."
echo "👉 Your server IP: $(curl -s ifconfig.me)"
echo "👉 Add this IP to your GitHub Secrets as SSH_HOST"
