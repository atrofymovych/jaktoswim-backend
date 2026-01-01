#!/bin/bash
# The All-in-One MongoDB Installation and Security Script
# This single script handles installation, firewall, admin user creation, and security hardening.

set -e
set -o pipefail

# ##############################################################################
# ##                          CONFIGURATION VARIABLES                         ##
# ##                             EDIT THESE VALUES                            ##
# ##############################################################################

# --- Network & Security ---
# List of comma-separated IPs or CIDR ranges to allow access
# Example: "8.8.8.8,192.168.1.0/24"
ALLOW_ONLY_IPS="109.243.67.87,192.168.1.0/24,161.97.175.164"
MONGODB_PORT=27017
MONGODB_REPLICA_SET_NAME="rs0"

# --- System Paths (Advanced - usually no need to change) ---
MONGODB_DATA_DIR="/var/lib/mongodb"
MONGODB_LOG_DIR="/var/log/mongodb"
MONGODB_KEYFILE="/etc/mongodb/mongodb-keyfile"
MONGODB_CONFIG_FILE="/etc/mongod.conf"

# ##############################################################################
# ##                        END OF CONFIGURATION                              ##
# ##############################################################################

# --- Logging Functions ---
print_status() { echo -e "\n\e[34m[INFO]\e[0m $1"; }
print_success() { echo -e "\e[32m[SUCCESS]\e[0m $1"; }
print_warning() { echo -e "\e[33m[WARNING]\e[0m $1"; }
print_error() { echo -e "\e[31m[ERROR]\e[0m $1"; }

# --- Script Start ---
# Pre-flight check
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Use a user with sudo privileges."
   exit 1
fi

# ==============================================================================
# PHASE 1: INSTALLATION AND INITIAL (INSECURE) STARTUP
# ==============================================================================

print_status "Starting Phase 1: Installation..."

# 1. System Preparation
sudo apt-get update && sudo apt-get upgrade -y
print_status "Installing required packages..."
sudo apt-get install -y wget curl gnupg2 software-properties-common apt-transport-https ca-certificates ufw

# 2. Add MongoDB Repository
print_status "Adding MongoDB 7.0 repository..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
UBUNTU_CODENAME=$(lsb_release -cs)
if [[ "$UBUNTU_CODENAME" == "noble" ]]; then
    print_warning "Ubuntu 24.04 (noble) detected. Using 22.04 (jammy) repository as a fallback."
    UBUNTU_CODENAME="jammy"
fi
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu $UBUNTU_CODENAME/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 3. Install MongoDB
print_status "Installing MongoDB packages..."
sudo apt-get update
sudo apt-get install -y mongodb-org

# 4. Create Directories and Permissions
print_status "Setting up MongoDB directories..."
sudo mkdir -p "$MONGODB_DATA_DIR"
sudo chown -R mongodb:mongodb "$MONGODB_DATA_DIR"

# 5. Create INITIAL (insecure) MongoDB Configuration
print_status "Creating initial temporary configuration..."
sudo tee "$MONGODB_CONFIG_FILE" > /dev/null <<EOF
# MongoDB Configuration - Phase 1 (Initial Setup)
storage:
  dbPath: $MONGODB_DATA_DIR
systemLog:
  destination: file
  logAppend: true
  path: $MONGODB_LOG_DIR/mongod.log
net:
  port: $MONGODB_PORT
  bindIp: 0.0.0.0
replication:
  replSetName: $MONGODB_REPLICA_SET_NAME
EOF

# 6. Configure Firewall (UFW)
print_status "Configuring firewall..."
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
IFS=',' read -ra IPS <<< "$ALLOW_ONLY_IPS"
for ip in "${IPS[@]}"; do
    ip=$(echo "$ip" | xargs)
    sudo ufw allow from "$ip" to any port "$MONGODB_PORT"
done
sudo ufw reload

# 7. Start and Enable MongoDB Service (Insecurely)
print_status "Starting MongoDB service temporarily without authentication..."
sudo systemctl daemon-reload
sudo systemctl stop mongod 2>/dev/null || true
sudo systemctl start mongod
sudo systemctl enable mongod
print_status "Waiting for service to start..."
sleep 10

# ==============================================================================
# PHASE 2: SECURITY CONFIGURATION
# ==============================================================================

print_status "Starting Phase 2: Security Configuration..."

# 8. Initialize Replica Set
print_status "Initializing replica set..."
mongosh --quiet --eval "rs.initiate({ _id: '$MONGODB_REPLICA_SET_NAME', members: [{ _id: 0, host: 'localhost:$MONGODB_PORT' }] });"
print_status "Waiting for replica set to elect a primary..."
sleep 15

# 9. Create Admin User
print_status "Creating admin user..."
MONGODB_ADMIN_PASSWORD=$(openssl rand -base64 32)
mongosh --quiet --eval "
db.getSiblingDB('admin').createUser({
    user: 'admin',
    pwd: '$MONGODB_ADMIN_PASSWORD',
    roles: [
        { role: 'userAdminAnyDatabase', db: 'admin' },
        { role: 'readWriteAnyDatabase', db: 'admin' },
        { role: 'dbAdminAnyDatabase', db: 'admin' }
    ]
});"
print_success "Admin user created."

# 10. Enable Authentication
print_status "Stopping service to enable authentication..."
sudo systemctl stop mongod
sudo mkdir -p "$(dirname "$MONGODB_KEYFILE")"
sudo openssl rand -base64 756 | sudo tee "$MONGODB_KEYFILE" > /dev/null
sudo chmod 400 "$MONGODB_KEYFILE"
sudo chown mongodb:mongodb "$MONGODB_KEYFILE"

# Create FINAL (secure) MongoDB Configuration
print_status "Writing final secure configuration..."
sudo tee "$MONGODB_CONFIG_FILE" > /dev/null <<EOF
# MongoDB Configuration - Final (Secure)
storage:
  dbPath: $MONGODB_DATA_DIR
systemLog:
  destination: file
  logAppend: true
  path: $MONGODB_LOG_DIR/mongod.log
net:
  port: $MONGODB_PORT
  bindIp: 0.0.0.0
replication:
  replSetName: $MONGODB_REPLICA_SET_NAME
security:
  authorization: enabled
  keyFile: $MONGODB_KEYFILE
EOF

# 11. Restart MongoDB with Security Enabled
print_status "Restarting MongoDB in secure mode..."
sudo systemctl daemon-reload
sudo systemctl start mongod
sleep 5

# 12. Verify Connection
print_status "Verifying admin connection..."
mongosh --username admin --password "$MONGODB_ADMIN_PASSWORD" --authenticationDatabase admin --eval "db.runCommand({ping: 1})" --quiet
print_success "Admin connection verified successfully."

# ==============================================================================
# PHASE 3: FINAL OUTPUT
# ==============================================================================
SERVER_IP=$(curl -s4 ifconfig.me || curl -s4 ipinfo.io/ip || hostname -I | awk '{print $1}')
LOG_FILE="mongodb_credentials.log"

{
    echo "==========================================================="
    echo " MongoDB Admin Setup Complete on $(date)"
    echo "==========================================================="
    echo ""
    echo "### Admin Credentials ###"
    echo "Username: admin"
    echo "Password: $MONGODB_ADMIN_PASSWORD"
    echo ""
    echo "### Next Steps ###"
    echo "Use the admin credentials above to connect and create new databases and users."
    echo "Example connection command:"
    echo "mongosh --username admin --password \"$MONGODB_ADMIN_PASSWORD\" --authenticationDatabase admin"
    echo ""
    echo "==========================================================="
    echo "This information has been saved to: $LOG_FILE"
    echo "==========================================================="
} | tee "$LOG_FILE"

print_success "\n🚀 All done! Your MongoDB server is installed and secure."
print_success "Your admin credentials have been saved to '$LOG_FILE'."
