#!/bin/bash

sudo apt update
sudo apt upgrade -y
sudo apt install ufw
sudo apt install fail2ban
sudo apt install unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw list
sudo ufw status
sudo ufw allow 443
sudo ufw allow 80
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22

# WebRTC TURN/STUN Server Ports
echo ">>> Configuring WebRTC TURN/STUN server ports..."
sudo ufw allow 3478/tcp    # TURN/STUN TCP port
sudo ufw allow 3478/udp    # TURN/STUN UDP port
sudo ufw allow 49152:65535/udp  # TURN relay port range (UDP only)

sudo ufw --force enable
sudo ufw status

echo "✅ WebRTC TURN/STUN ports configured:"
echo "   - Port 3478 (TCP/UDP) - TURN/STUN server"
echo "   - Ports 49152-65535 (UDP) - TURN relay range"
echo "   - All ports configured for both ingress and egress"

sudo systemctl start fail2ban.service


# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run hello-world

# Setup deployment directories and files
echo ">>> Setting up deployment directories..."
mkdir -p ~/dao-app-dev
mkdir -p ~/dao-app

# Create acme.json files with correct permissions for Traefik
echo ">>> Creating acme.json files for SSL certificates..."
touch ~/dao-app-dev/acme.json
touch ~/dao-app/acme.json
chmod 600 ~/dao-app-dev/acme.json
chmod 600 ~/dao-app/acme.json

# Add user to docker group to avoid sudo for docker commands
echo ">>> Adding user to docker group..."
sudo usermod -aG docker $USER

echo "✅ Deployment directories and SSL certificate files created."
echo "⚠️  You may need to log out and back in for docker group changes to take effect."

# A script to generate and authorize an SSH key for GitHub Actions.

echo ">>> Generating a new 4096-bit RSA key for GitHub Actions..."
# Generate a key without a passphrase, outputting to a specific file.
ssh-keygen -t rsa -b 4096 \
  -f ~/.ssh/github_actions_key \
  -C "GitHub Actions Key" \
  -N ''

echo ">>> Authorizing the new public key..."
# Append the public key to the authorized_keys file.
cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys

echo ">>> Setting strict file permissions for SSH..."
# Set correct permissions for security.
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/github_actions_key
chmod 644 ~/.ssh/github_actions_key.pub


echo "✅ SSH key setup for GitHub Actions is complete on the server."
echo ""
echo "🎥 WebRTC TURN/STUN server ports have been configured:"
echo "   - Port 3478 (TCP/UDP) for TURN/STUN signaling"
echo "   - Ports 49152-65535 (UDP) for TURN relay traffic"
echo ""
echo "⬇️ COPY THE PRIVATE KEY BELOW AND ADD IT AS A GITHUB REPOSITORY SECRET NAMED 'VPS_SSH_PRIVATE_KEY' ⬇️"
echo "========================================================================================================"
cat ~/.ssh/github_actions_key
echo "========================================================================================================"
