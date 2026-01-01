#!/bin/bash

# Configuration
SERVER_IP="80.208.229.45"
SSH_KEY_PATH="./vps_key_final"
DUMP_DIR="./database_dump"
REMOTE_DUMP_DIR="/root/db_dump"

# Check if dump file exists
if [ -z "$(ls -A $DUMP_DIR)" ]; then
   echo "❌ Error: Directory $DUMP_DIR is empty!"
   echo "👉 Please put your MongoDB dump file (archive or json) into $DUMP_DIR"
   exit 1
fi

echo "🚀 Starting Database Restore..."

# 1. Upload dump to server
echo "📦 Uploading dump files to server..."
ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=no root@$SERVER_IP "mkdir -p $REMOTE_DUMP_DIR"
scp -i $SSH_KEY_PATH -r $DUMP_DIR/* root@$SERVER_IP:$REMOTE_DUMP_DIR/

# 2. Restore inside Docker
echo "🔄 Restoring database..."
ssh -i $SSH_KEY_PATH root@$SERVER_IP << 'EOF'
    # Find the dump file (taking the first one found)
    DUMP_FILE=$(ls /root/db_dump | head -n 1)

    if [[ "$DUMP_FILE" == *.gz ]] || [[ "$DUMP_FILE" == *.archive ]]; then
        echo "Detected archive file: $DUMP_FILE"
        # Copy to container
        docker cp /root/db_dump/$DUMP_FILE mongo:/tmp/dump.archive
        # Restore archive
        docker exec mongo mongorestore --archive=/tmp/dump.archive --gzip --drop
    elif [[ -d "/root/db_dump/$DUMP_FILE" ]]; then
        echo "Detected directory: $DUMP_FILE"
        # Copy directory
        docker cp /root/db_dump/$DUMP_FILE mongo:/tmp/dump
        # Restore directory
        docker exec mongo mongorestore /tmp/dump --drop
    else
        echo "Assuming standard file/json: $DUMP_FILE"
        docker cp /root/db_dump/$DUMP_FILE mongo:/tmp/
        # Try generic restore
        docker exec mongo mongorestore /tmp/$DUMP_FILE --drop
    fi

    # Cleanup
    rm -rf /root/db_dump
EOF

echo "✅ Database restore complete!"
