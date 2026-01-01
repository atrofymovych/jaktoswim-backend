# Infrastructure Scripts - Quick Reference

## 🚀 One-Line Setup Commands

```bash
# Complete server setup (run as root)
sudo bash infra/vps_setup.bash && sudo bash infra/setup_user.bash

# Switch to application user and setup database
su - daodevdatabase
bash infra/install_database.bash
bash infra/create_database_users.bash
```

## 📋 Script Execution Order

| Step | Script | Purpose | Run As |
|------|--------|---------|--------|
| 1 | `vps_setup.bash` | Server hardening & Docker | root |
| 2 | `setup_user.bash` | Create app user | root |
| 3 | `install_database.bash` | MongoDB setup | daodevdatabase |
| 4 | `create_database_users.bash` | Create DB users | daodevdatabase |
| 5 | `database_migrator.bash` | Migrate data | daodevdatabase |

## ⚙️ Quick Configuration

### MongoDB Installation (`install_database.bash`)
```bash
# Edit these variables:
ALLOW_ONLY_IPS="YOUR_IP,192.168.1.0/24"
MONGODB_PORT=27017
```

### Database Users (`create_database_users.bash`)
```bash
# Edit this array:
USERS_TO_CREATE=(
    "username:password:database"
    "morcarsuser:securepass:morcars"
    "jaktoswimuser:securepass:jaktoswim"
    "zdrowowuser:securepass:zdrowow"
)
```

### Database Migration (`database_migrator.bash`)
```bash
# Edit this array:
MIGRATIONS=(
    "source_uri" "target_uri"
    "mongodb+srv://user:pass@source.net/db" "mongodb://user:pass@target:27017/db"
)
```

## 🔧 Common Commands

### Service Management
```bash
# MongoDB status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod

# View logs
sudo journalctl -u mongod -f
```

### Connection Testing
```bash
# Test MongoDB connection
mongosh "mongodb://user:pass@host:27017/db"

# Check replica set
mongosh --eval "rs.status()"

# List databases
mongosh --eval "show dbs"
```

### Backup & Restore
```bash
# Manual backup
mongodump --uri="mongodb://user:pass@host:27017/db" --out="./backup"

# Manual restore
mongorestore --uri="mongodb://user:pass@host:27017/db" ./backup/db/
```

## 🚨 Quick Troubleshooting

### MongoDB Won't Start
```bash
sudo systemctl restart mongod
sudo journalctl -u mongod -f
```

### Connection Refused
```bash
# Check firewall
sudo ufw status

# Allow your IP
sudo ufw allow from YOUR_IP to any port 27017
```

### Authentication Failed
```bash
# Test with admin user
mongosh -u admin -p PASSWORD --authenticationDatabase admin
```

## 📊 Monitoring

### Check Services
```bash
# MongoDB health
systemctl is-active mongod

# Disk space
df -h

# Memory usage
free -h
```

### View Logs
```bash
# MongoDB logs
tail -f /var/log/mongodb/mongod.log

# Health monitoring
tail -f /var/log/mongodb-health.log

# Backup logs
tail -f /var/log/mongodb-backup.log
```

## 🔐 Security Checklist

- ✅ Firewall configured (UFW)
- ✅ MongoDB authentication enabled
- ✅ IP restrictions in place
- ✅ Fail2ban protection active
- ✅ Automated backups running
- ✅ Log rotation configured
- ✅ Strong passwords used
- ✅ Keyfile authentication enabled

## 📞 Emergency Contacts

### Critical Issues
1. Check MongoDB service: `sudo systemctl status mongod`
2. Review logs: `sudo journalctl -u mongod -f`
3. Test connectivity: `mongosh --eval "db.runCommand('ping')"`
4. Check disk space: `df -h`

### Recovery Procedures
- **Service down**: `sudo systemctl restart mongod`
- **Lost password**: Reset via admin user
- **Data corruption**: Restore from backup
- **Network issues**: Check firewall and IP restrictions

---

*For detailed documentation, see [INFRA_README.md](./INFRA_README.md)*
