#!/bin/bash
# =============================================================================
# Database Backup Script for VituFinance
# Automatically backup MySQL database and push to Git repository
# =============================================================================

# Set script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups/database"
ENV_FILE="$PROJECT_DIR/backend/.env"
LOG_FILE="$PROJECT_DIR/backups/backup.log"

# Date format for backup files
DATE=$(date +%Y-%m-%d)
DATETIME=$(date +%Y-%m-%d_%H-%M-%S)

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to read env variable from .env file
get_env_var() {
    local var_name=$1
    local value=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    echo "$value"
}

# Start backup process
log_message "========== Starting database backup =========="

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    log_message "ERROR: .env file not found at $ENV_FILE"
    exit 1
fi

# Read database configuration from .env
DB_HOST=$(get_env_var "DB_HOST")
DB_PORT=$(get_env_var "DB_PORT")
DB_USER=$(get_env_var "DB_USER")
DB_PASSWORD=$(get_env_var "DB_PASSWORD")
DB_NAME=$(get_env_var "DB_NAME")

# Set defaults if not specified
DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}

# Validate required variables
if [ -z "$DB_NAME" ]; then
    log_message "ERROR: DB_NAME not found in .env file"
    exit 1
fi

log_message "Database: $DB_NAME @ $DB_HOST:$DB_PORT"

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Backup filename
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${DATE}.sql"
BACKUP_FILE_GZ="$BACKUP_FILE.gz"

# Remove old backup for today if exists (to update daily backup)
rm -f "$BACKUP_FILE" "$BACKUP_FILE_GZ" 2>/dev/null

# Perform MySQL dump
log_message "Creating database backup..."
if [ -n "$DB_PASSWORD" ]; then
    mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" \
        --single-transaction \
        --routines \
        --triggers \
        --add-drop-table \
        "$DB_NAME" > "$BACKUP_FILE" 2>> "$LOG_FILE"
else
    mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
        --single-transaction \
        --routines \
        --triggers \
        --add-drop-table \
        "$DB_NAME" > "$BACKUP_FILE" 2>> "$LOG_FILE"
fi

# Check if backup was successful
if [ $? -ne 0 ] || [ ! -s "$BACKUP_FILE" ]; then
    log_message "ERROR: Database backup failed!"
    rm -f "$BACKUP_FILE" 2>/dev/null
    exit 1
fi

# Get backup file size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_message "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Compress backup file
log_message "Compressing backup..."
gzip -f "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    COMPRESSED_SIZE=$(du -h "$BACKUP_FILE_GZ" | cut -f1)
    log_message "Backup compressed: $BACKUP_FILE_GZ ($COMPRESSED_SIZE)"
else
    log_message "WARNING: Compression failed, keeping uncompressed backup"
    BACKUP_FILE_GZ="$BACKUP_FILE"
fi

# Keep only last 7 days of backups (to prevent repository from growing too large)
log_message "Cleaning old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +7 -delete 2>/dev/null
find "$BACKUP_DIR" -name "*.sql" -type f -mtime +7 -delete 2>/dev/null

# Count remaining backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
log_message "Total backups retained: $BACKUP_COUNT"

# Push to Git
log_message "Pushing backup to Git repository..."
cd "$PROJECT_DIR"

# Add backup files to git
git add backups/database/*.sql.gz backups/backup.log 2>> "$LOG_FILE"

# Check if there are changes to commit
if git diff --cached --quiet; then
    log_message "No changes to commit"
else
    # Commit with date
    git commit -m "Auto backup: Database backup $DATE" >> "$LOG_FILE" 2>&1
    
    # Push to remote
    git push origin main >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log_message "Successfully pushed backup to Git repository"
    else
        log_message "ERROR: Failed to push to Git repository"
        exit 1
    fi
fi

log_message "========== Backup completed successfully =========="
log_message ""

exit 0

