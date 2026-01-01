#!/bin/bash

# Default output directory
OUTPUT_DIR="./database_dump"
mkdir -p "$OUTPUT_DIR"

# Timestamp for unique filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="$OUTPUT_DIR/crm_backup_$TIMESTAMP.archive"

# Ask for connection string if not provided as argument
if [ -z "$1" ]; then
    echo "🔗 Enter your Source MongoDB Connection String (URI):"
    echo "   Format: mongodb+srv://user:pass@cluster.mongodb.net/dbname"
    read -r MONGO_URI
else
    MONGO_URI=$1
fi

if [ -z "$MONGO_URI" ]; then
    echo "❌ Error: Connection string is required."
    exit 1
fi

echo "🚀 Starting dump from: $MONGO_URI"
echo "📂 Saving to: $OUTPUT_FILE"

# Run mongodump using Docker (no local install needed)
# Using MSYS_NO_PATHCONV=1 to prevent Git Bash path conversion issues on Windows
export MSYS_NO_PATHCONV=1

docker run --rm \
  -v "$(pwd)/database_dump:/backup" \
  mongo:6.0 \
  mongodump \
  --uri="$MONGO_URI" \
  --archive="/backup/crm_backup_$TIMESTAMP.archive" \
  --gzip

if [ $? -eq 0 ]; then
    echo "✅ Dump completed successfully!"
    echo "👉 File: $OUTPUT_FILE"
else
    echo "❌ Dump failed. Check your connection string and permissions."
fi
