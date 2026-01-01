#!/bin/bash
# Script to add/update multiple application users to a secured MongoDB instance.
# It uses admin credentials to create users defined in the USERS_TO_CREATE array.

set -e
set -o pipefail

# ##############################################################################
# ##                     USER CONFIGURATION (EDIT THIS)                       ##
# ##############################################################################
#
# Add each new user as a new line in this array.
# Format: "USERNAME:PASSWORD:DATABASE"
#
# IMPORTANT: If your password contains special characters, it is generally safe,
# but avoid using a colon (:) in the password itself.

USERS_TO_CREATE=(
    "test:test:morcars"
    "test:test:zdrowow"
    "test:test:jaktoswim"
)

# ##############################################################################
# ##                        END OF CONFIGURATION                              ##
# ##############################################################################

# --- Logging Functions ---
print_status() { echo -e "\n\e[34m[INFO]\e[0m $1"; }
print_success() { echo -e "\e[32m[SUCCESS]\e[0m $1"; }
print_error() { echo -e "\e[31m[ERROR]\e[0m $1"; }

# --- Get Admin Credentials ---
print_status "Please enter the MongoDB admin credentials to authorize user creation..."
read -p "Enter admin username [default: admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin} # Set default value to 'admin'
read -sp "Enter admin password: " ADMIN_PASSWORD
echo "" # Newline after password input

if [ -z "$ADMIN_PASSWORD" ]; then
    print_error "Admin password cannot be empty."
    exit 1
fi

# --- Verify Admin Connection ---
print_status "Verifying admin connection..."
mongosh --quiet \
    --username "$ADMIN_USER" \
    --password "$ADMIN_PASSWORD" \
    --authenticationDatabase admin \
    --eval "db.runCommand({ping: 1})" > /dev/null

print_success "Admin connection successful."

# --- Process Users ---
print_status "Starting user creation process..."

for user_config in "${USERS_TO_CREATE[@]}"; do
    # Safely parse the "USER:PASSWORD:DB" string
    IFS=':' read -r NEW_USER NEW_PASSWORD NEW_DB <<< "$user_config"

    if [ -z "$NEW_USER" ] || [ -z "$NEW_PASSWORD" ] || [ -z "$NEW_DB" ]; then
        print_error "Invalid configuration line: '$user_config'. Skipping."
        continue
    fi

    print_status "Configuring user '$NEW_USER' for database '$NEW_DB'..."

    # Heredoc to create the multi-line Javascript command
    JS_COMMAND=$(cat <<EOF
    // Switch to the target database context
    db = db.getSiblingDB('${NEW_DB}');

    // Check if the user already exists
    const userExists = db.getUser('${NEW_USER}');

    if (userExists) {
        print('User "${NEW_USER}" already exists. Updating password.');
        db.updateUser(
            '${NEW_USER}',
            {
                pwd: '${NEW_PASSWORD}'
            }
        );
    } else {
        print('User "${NEW_USER}" does not exist. Creating new user.');
        db.createUser({
            user: '${NEW_USER}',
            pwd: '${NEW_PASSWORD}',
            roles: [ { role: 'readWrite', db: '${NEW_DB}' } ]
        });
    }

    // Ensure the database and an initial collection exist
    // MongoDB only creates a DB when the first document is inserted.
    const collectionExists = db.getCollectionNames().includes('init_collection');
    if (!collectionExists) {
        print("Collection 'init_collection' not found, creating it to initialize the database.");
        db.init_collection.insertOne({
            database_created_at: new Date(),
            status: 'initialized by setup script'
        });
    } else {
        print("Collection 'init_collection' already exists.");
    }
EOF
)

    # Execute the command
    mongosh --quiet \
        --username "$ADMIN_USER" \
        --password "$ADMIN_PASSWORD" \
        --authenticationDatabase admin \
        --eval "$JS_COMMAND"

    print_success "Successfully configured user '$NEW_USER' on database '$NEW_DB'."
done

print_success "\n🎉 All users have been processed successfully."
