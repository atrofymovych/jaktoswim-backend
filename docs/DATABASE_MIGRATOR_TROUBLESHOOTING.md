# Database Migrator Troubleshooting Guide

## 🚨 Common Issue: Script Stops Suddenly

### Problem Description
The `database_migrator.bash` script stops after displaying:
```
[INFO] Starting MongoDB migration process...
======================================================================
[INFO] Running migration 1 of 6...
```

### Root Causes & Solutions

#### 1. **Missing Shebang Line**
**Problem**: Script doesn't have `#!/bin/bash` at the top
**Solution**: Add this line to the very first line of the script:
```bash
#!/bin/bash
```

#### 2. **Missing Backup Directory**
**Problem**: The `./backups/` directory doesn't exist
**Solution**: Create the directory before running the script:
```bash
mkdir -p ./backups
```

#### 3. **Network Connectivity Issues**
**Problem**: Cannot reach source MongoDB Atlas
**Solution**: Test connectivity:
```bash
# Test internet connection
ping -c 1 8.8.8.8

# Test DNS resolution
nslookup jaktoswim.ba9tpb6.mongodb.net

# Test MongoDB connection
mongosh "mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/test"
```

#### 4. **Authentication Failures**
**Problem**: Invalid credentials in source URI
**Solution**: Verify credentials and test connection:
```bash
# Test with verbose output
mongodump --uri="mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/test" --dryRun --verbose
```

#### 5. **MongoDB Tools Not Installed**
**Problem**: `mongodump` or `mongorestore` commands not found
**Solution**: Install MongoDB Database Tools:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mongodb-database-tools

# Or download from MongoDB website
wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2004-x86_64-100.9.4.deb
sudo dpkg -i mongodb-database-tools-ubuntu2004-x86_64-100.9.4.deb
```

## 🔧 Fixed Script Template

Here's a corrected version of your `database_migrator.bash`:

```bash
#!/bin/bash

# MongoDB Migration Script - Fixed Version
set -e  # Exit on error
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Create backup directory
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

print_info "Starting MongoDB migration..."

# Define migrations
MIGRATIONS=(
    "mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/test|mongodb://jaktoswimproductionuser:Mzzbi47WiqYnrcA9Ryu68GgakwEjqvV0dfhVFtD6kpmxydCzNmLPTMFLonjdv20n1FsZUUkvFGBKUuHac1hi@173.249.25.64/jaktoswim?authSource=jaktoswim|test"
    "mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/zdrowow|mongodb://zdrowowproductionuser:tagMznGrBjEDaCobWbxy7vqC3RH8D1urP5euqp1CGxEx70vK26c2DL8rHfZbYh1yJUy6VVvrbfHMTfMxVr0E@173.249.25.64/zdrowow?authSource=zdrowow|zdrowow"
    "mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/morcars|mongodb://morcarsproductionuser:2hQqfmxGmJ2Dr89NGqddAA22uKyUUnPb8GePw469ZtYcwzDeFBK7iobsVch54FDgs5hMbhNdp8C70Tv2tnin@173.249.25.64/morcars?authSource=morcars|morcars"
)

TOTAL=${#MIGRATIONS[@]}
CURRENT=0

for migration in "${MIGRATIONS[@]}"; do
    CURRENT=$((CURRENT + 1))

    # Split the migration string
    IFS='|' read -r SOURCE_URI TARGET_URI SOURCE_DB <<< "$migration"

    echo "=========================================="
    print_info "Migration $CURRENT of $TOTAL: $SOURCE_DB"
    echo "=========================================="

    # Test source connection first
    print_info "Testing source connection..."
    if ! mongodump --uri="$SOURCE_URI" --dryRun >/dev/null 2>&1; then
        print_error "Cannot connect to source. Skipping $SOURCE_DB"
        continue
    fi

    # Dump from source
    print_info "Dumping $SOURCE_DB from source..."
    if mongodump --uri="$SOURCE_URI" --out="$BACKUP_DIR"; then
        print_success "Dump completed for $SOURCE_DB"
    else
        print_error "Dump failed for $SOURCE_DB"
        continue
    fi

    # Restore to target
    print_info "Restoring $SOURCE_DB to target..."
    if mongorestore \
        --uri="$TARGET_URI" \
        --nsFrom="$SOURCE_DB.*" \
        --nsTo="$SOURCE_DB.*" \
        --drop \
        "$BACKUP_DIR/$SOURCE_DB/"; then
        print_success "Restore completed for $SOURCE_DB"
    else
        print_error "Restore failed for $SOURCE_DB"
        continue
    fi

    print_success "Migration $CURRENT completed successfully!"
done

echo "=========================================="
print_success "All migrations completed!"
echo "=========================================="
```

## 🧪 Diagnostic Commands

### Test Individual Components

```bash
# 1. Test MongoDB tools
mongodump --version
mongorestore --version

# 2. Test source connection
mongosh "mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/test"

# 3. Test target connection
mongosh "mongodb://jaktoswimproductionuser:Mzzbi47WiqYnrcA9Ryu68GgakwEjqvV0dfhVFtD6kpmxydCzNmLPTMFLonjdv20n1FsZUUkvFGBKUuHac1hi@173.249.25.64/jaktoswim?authSource=jaktoswim"

# 4. Test single dump
mongodump --uri="mongodb+srv://jaktoswim:8uf2acrtEDzpk39I@jaktoswim.ba9tpb6.mongodb.net/test" --out="./test_backup"

# 5. Test single restore
mongorestore --uri="mongodb://jaktoswimproductionuser:Mzzbi47WiqYnrcA9Ryu68GgakwEjqvV0dfhVFtD6kpmxydCzNmLPTMFLonjdv20n1FsZUUkvFGBKUuHac1hi@173.249.25.64/jaktoswim?authSource=jaktoswim" --nsFrom="test.*" --nsTo="jaktoswim.*" --drop ./test_backup/test/
```

### Debug Mode

Add these lines to your script for debugging:
```bash
# Enable debug mode
set -x  # Print commands as they execute

# Or add verbose logging
mongodump --uri="$SOURCE_URI" --out="$BACKUP_DIR" --verbose
mongorestore --uri="$TARGET_URI" --verbose --nsFrom="$SOURCE_DB.*" --nsTo="$SOURCE_DB.*" --drop "$BACKUP_DIR/$SOURCE_DB/"
```

## 🚀 Quick Fixes

### Fix 1: Add Error Handling
```bash
#!/bin/bash
set +e  # Don't exit on errors
# Your existing commands here
set -e  # Re-enable exit on errors
```

### Fix 2: Create Directory
```bash
#!/bin/bash
mkdir -p ./backups
# Your existing commands here
```

### Fix 3: Test Connections First
```bash
#!/bin/bash
# Test source
if ! mongodump --uri="$SOURCE_URI" --dryRun >/dev/null 2>&1; then
    echo "Source connection failed"
    exit 1
fi

# Test target
if ! mongosh "$TARGET_URI" --eval "db.runCommand('ping')" --quiet >/dev/null 2>&1; then
    echo "Target connection failed"
    exit 1
fi
```

## 📋 Pre-Migration Checklist

- [ ] MongoDB tools installed (`mongodump`, `mongorestore`)
- [ ] Network connectivity to source MongoDB
- [ ] Network connectivity to target MongoDB
- [ ] Valid credentials for both source and target
- [ ] Sufficient disk space for backups
- [ ] Backup directory exists (`./backups/`)
- [ ] Script has proper shebang line (`#!/bin/bash`)
- [ ] Script has execute permissions (`chmod +x script.bash`)

## 🔍 Error Messages & Solutions

| Error Message | Cause | Solution |
|---------------|-------|----------|
| `command not found: mongodump` | MongoDB tools not installed | Install MongoDB Database Tools |
| `connection refused` | Network/firewall issue | Check network connectivity and firewall |
| `authentication failed` | Wrong credentials | Verify username/password |
| `no such file or directory` | Missing backup directory | Create `./backups/` directory |
| `permission denied` | Script not executable | Run `chmod +x script.bash` |

---

*For more detailed infrastructure documentation, see [INFRA_README.md](./INFRA_README.md)*
