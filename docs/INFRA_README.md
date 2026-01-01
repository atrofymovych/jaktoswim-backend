# Infrastructure Scripts Documentation

This document provides comprehensive documentation for all scripts in the `infra/` folder, which contains infrastructure setup and management scripts for the CRM-as-a-Service application.

## 📁 Folder Structure

```
infra/
├── create_database_users.bash    # Database user management
├── database_migrator.bash        # Database migration tool
├── install_database.bash         # MongoDB installation & setup
├── setup_user.bash              # User account setup
└── vps_setup.bash               # VPS initial configuration
```

## 🚀 Quick Start

### Prerequisites
- Ubuntu 20.04+ (tested on 22.04, 24.04)
- Root or sudo access
- Internet connectivity
- At least 2GB RAM, 10GB disk space

### Typical Setup Order
1. **VPS Setup** → `vps_setup.bash`
2. **User Setup** → `setup_user.bash`
3. **Database Installation** → `install_database.bash`
4. **Database Users** → `create_database_users.bash`
5. **Data Migration** → `database_migrator.bash`

---

## 📋 Script Details

### 1. `vps_setup.bash` - VPS Initial Configuration

**Purpose**: Initial server hardening and Docker installation

**What it does**:
- Updates system packages
- Configures UFW firewall (SSH, HTTP, HTTPS)
- Installs and configures fail2ban
- Installs Docker and Docker Compose
- Sets up SSL certificate directories
- Generates SSH keys for GitHub Actions

**Usage**:
```bash
sudo bash vps_setup.bash
```

**Configuration**: No configuration needed - runs with defaults

**Security Features**:
- ✅ Firewall configured (UFW)
- ✅ Fail2ban protection
- ✅ Unattended security updates
- ✅ SSH key generation for CI/CD

---

### 2. `setup_user.bash` - User Account Setup

**Purpose**: Creates dedicated user account for application deployment

**What it does**:
- Creates `daodevdatabase` user
- Adds user to sudo and docker groups
- Switches to the new user

**Usage**:
```bash
sudo bash setup_user.bash
```

**Configuration**: No configuration needed

---

### 3. `install_database.bash` - MongoDB Installation & Security

**Purpose**: Complete MongoDB setup with security hardening

**What it does**:
- Installs MongoDB 7.0 (Ubuntu 24.04 compatible)
- Configures replica set (rs0)
- Sets up authentication and keyfile
- Configures firewall with IP restrictions
- Creates admin user with secure password
- Sets up monitoring and backup scripts
- Configures log rotation
- Installs fail2ban protection

**Usage**:
```bash
bash install_database.bash
```

**Configuration** (Edit these variables in the script):
```bash
# Network & Security
ALLOW_ONLY_IPS="109.243.67.87,192.168.1.0/24,161.97.175.164"
MONGODB_PORT=27017
MONGODB_REPLICA_SET_NAME="rs0"
```

**Security Features**:
- ✅ IP-based access control
- ✅ Authentication enabled
- ✅ Replica set with keyfile
- ✅ Fail2ban protection
- ✅ Automated backups (daily)
- ✅ Health monitoring (every 5 minutes)
- ✅ Log rotation

**Output**:
- Admin credentials
- Connection strings for applications
- Service status information

---

### 4. `create_database_users.bash` - Database User Management

**Purpose**: Creates application-specific database users

**What it does**:
- Creates users for each application database
- Assigns readWrite permissions per database
- Uses admin credentials for user creation

**Usage**:
```bash
bash create_database_users.bash
```

**Configuration** (Edit the USERS_TO_CREATE array):
```bash
USERS_TO_CREATE=(
    "morcarsuser:securepassword:morcars"
    "jaktoswimuser:securepassword:jaktoswim"
    "zdrowowuser:securepassword:zdrowow"
)
```

**Format**: `USERNAME:PASSWORD:DATABASE`

**Security Features**:
- ✅ Database-specific permissions
- ✅ Secure password handling
- ✅ Admin authentication required

---

### 5. `database_migrator.bash` - Database Migration Tool

**Purpose**: Migrates data between MongoDB instances

**What it does**:
- Dumps databases from source MongoDB
- Restores to target MongoDB
- Handles multiple database migrations
- Supports different source/target database names

**Usage**:
```bash
bash database_migrator.bash
```

**Configuration** (Edit the MIGRATIONS array):
```bash
MIGRATIONS=(
    "mongodb+srv://user:pass@source.mongodb.net/sourcedb" "mongodb://user:pass@target:27017/targetdb"
    # Add more migration pairs as needed
)
```

**Features**:
- ✅ Multiple database support
- ✅ Namespace mapping (source.* → target.*)
- ✅ Drop and replace target data
- ✅ Temporary backup management

---

## 🔧 Configuration Guide

### MongoDB Connection Strings

**Format**: `mongodb://username:password@host:port/database?authSource=database`

**Examples**:
```bash
# Local MongoDB
mongodb://admin:password@localhost:27017/morcars?authSource=admin

# Remote MongoDB
mongodb://user:pass@173.249.25.64:27017/morcars?authSource=morcars

# MongoDB Atlas
mongodb+srv://user:pass@cluster.mongodb.net/morcars
```

### Firewall Configuration

**Default Ports**:
- `22` - SSH
- `80` - HTTP
- `443` - HTTPS
- `27017` - MongoDB (restricted by IP)

**IP Restrictions**: Configure in `ALLOW_ONLY_IPS` variable

### Security Best Practices

1. **Change Default Passwords**: Always use strong, unique passwords
2. **IP Restrictions**: Limit MongoDB access to specific IPs
3. **Regular Backups**: Automated daily backups are configured
4. **Monitoring**: Health checks run every 5 minutes
5. **Log Rotation**: Logs are rotated daily, kept for 30 days

---

## 🚨 Troubleshooting

### Common Issues

#### 1. MongoDB Installation Fails
**Problem**: Ubuntu 24.04 compatibility issues
**Solution**: Script automatically uses Ubuntu 22.04 repository as fallback

#### 2. Connection Refused
**Problem**: Firewall blocking connections
**Solution**: Check UFW status and allowed IPs
```bash
sudo ufw status
sudo ufw allow from YOUR_IP to any port 27017
```

#### 3. Authentication Failed
**Problem**: Wrong credentials or authSource
**Solution**: Verify username, password, and authSource database

#### 4. Migration Script Stops
**Problem**: Network issues or invalid URIs
**Solution**: Test connections manually:
```bash
mongosh "mongodb://user:pass@host:27017/db"
```

### Log Files

**MongoDB Logs**: `/var/log/mongodb/mongod.log`
**Health Monitoring**: `/var/log/mongodb-health.log`
**Backup Logs**: `/var/log/mongodb-backup.log`
**Setup Logs**: Check terminal output during script execution

### Service Management

```bash
# Check MongoDB status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod

# View MongoDB logs
sudo journalctl -u mongod -f

# Check replica set status
mongosh --eval "rs.status()"
```

---

## 📊 Monitoring & Maintenance

### Automated Tasks

**Health Monitoring**: Every 5 minutes
- Checks if MongoDB is running
- Tests database connectivity
- Auto-restarts if needed

**Backups**: Daily at 2 AM
- Full database dumps
- Compressed storage
- 7-day retention policy

**Log Rotation**: Daily
- Compresses old logs
- 30-day retention
- Automatic cleanup

### Manual Maintenance

```bash
# Check disk space
df -h

# Check MongoDB processes
ps aux | grep mongod

# Check network connections
sudo netstat -tlnp | grep 27017

# View backup directory
ls -la /var/backups/mongodb/
```

---

## 🔐 Security Considerations

### Network Security
- MongoDB only accessible from whitelisted IPs
- UFW firewall configured
- Fail2ban protection against brute force

### Authentication
- Admin user with full privileges
- Application users with database-specific permissions
- Keyfile authentication for replica set

### Data Protection
- Automated daily backups
- Log rotation and cleanup
- Secure credential storage

### Compliance
- No sensitive data in logs
- Secure password generation
- Proper file permissions (600 for keyfiles)

---

## 📞 Support

### Getting Help

1. **Check Logs**: Review relevant log files first
2. **Verify Configuration**: Ensure all variables are set correctly
3. **Test Connectivity**: Use mongosh to test connections
4. **Check Services**: Verify all services are running

### Emergency Procedures

**MongoDB Won't Start**:
```bash
sudo systemctl restart mongod
sudo journalctl -u mongod -f
```

**Lost Admin Password**:
1. Stop MongoDB: `sudo systemctl stop mongod`
2. Start without auth: Comment out security section in config
3. Reset password: `mongosh --eval "db.changeUserPassword('admin', 'newpassword')"`
4. Restart with auth: Uncomment security section and restart

**Backup Recovery**:
```bash
# List available backups
ls -la /var/backups/mongodb/

# Restore from backup
mongorestore --uri="mongodb://user:pass@host:27017/db" /path/to/backup/db/
```

---

## 📝 Changelog

### Version 1.0
- Initial infrastructure scripts
- MongoDB 7.0 support
- Ubuntu 24.04 compatibility
- Security hardening
- Automated monitoring and backups

---

*Last updated: $(date)*
*For questions or issues, please refer to the troubleshooting section or contact the development team.*
