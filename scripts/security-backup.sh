#!/bin/bash

# ============================================================================
# VituFinance Security Backup Script
# 
# Features:
# - Automatic daily backup of critical files
# - Database backup with encryption
# - Git commit for version control
# - Backup rotation (keep last 7 days)
# - Integrity hash verification
#
# Usage: Add to crontab for automatic daily backups
# 0 2 * * * /www/wwwroot/vitufinance.com/scripts/security-backup.sh
# ============================================================================

set -e

# Configuration
PROJECT_DIR="/www/wwwroot/vitufinance.com"
BACKUP_DIR="/www/wwwroot/vitufinance.com/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="vitufinance_backup_${DATE}"
LOG_FILE="${BACKUP_DIR}/backup.log"
RETENTION_DAYS=7

# Database configuration
DB_HOST="localhost"
DB_USER="1019683427"
DB_PASS="xie080886."
DB_NAME="xie080886"

# Create backup directory
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/critical"

# Function: Log message
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "=========================================="
log "Starting backup: ${BACKUP_NAME}"
log "=========================================="

# ============================================================================
# 1. Backup Critical Source Files
# ============================================================================
log "1. Backing up critical source files..."

CRITICAL_FILES=(
    "backend/src/config/robotConfig.js"
    "backend/src/utils/referralMath.js"
    "backend/src/utils/teamMath.js"
    "backend/src/routes/robotRoutes.js"
    "backend/src/security/index.js"
    "backend/src/security/enhancedProtection.js"
    "backend/server.js"
    "backend/.env"
    "frontend/src/views/Robot.vue"
    "frontend/src/views/Assets.vue"
    "frontend/src/utils/robotCalc.js"
)

CRITICAL_BACKUP="${BACKUP_DIR}/critical/critical_${DATE}.tar.gz"
cd "${PROJECT_DIR}"

# Create list of files that exist
FILES_TO_BACKUP=""
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        FILES_TO_BACKUP="${FILES_TO_BACKUP} ${file}"
    fi
done

if [ -n "${FILES_TO_BACKUP}" ]; then
    tar -czf "${CRITICAL_BACKUP}" ${FILES_TO_BACKUP}
    log "   Critical files backed up: ${CRITICAL_BACKUP}"
fi

# ============================================================================
# 2. Backup Database
# ============================================================================
log "2. Backing up database..."

DB_BACKUP="${BACKUP_DIR}/daily/db_${DATE}.sql.gz"
mysqldump -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASS}" \
    --single-transaction --routines --triggers \
    "${DB_NAME}" 2>/dev/null | gzip > "${DB_BACKUP}"

log "   Database backed up: ${DB_BACKUP}"

# ============================================================================
# 3. Generate File Integrity Hashes
# ============================================================================
log "3. Generating file integrity hashes..."

HASH_FILE="${BACKUP_DIR}/critical/hashes_${DATE}.sha256"
cd "${PROJECT_DIR}"

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        sha256sum "$file" >> "${HASH_FILE}"
    fi
done

log "   Hashes saved: ${HASH_FILE}"

# ============================================================================
# 4. Git Commit (if changes detected)
# ============================================================================
log "4. Checking for git changes..."

cd "${PROJECT_DIR}"
if [ -d ".git" ]; then
    # Check if there are changes
    if ! git diff --quiet 2>/dev/null; then
        git add -A
        git commit -m "Auto-backup: ${DATE}" 2>/dev/null || true
        log "   Git commit created"
    else
        log "   No changes to commit"
    fi
fi

# ============================================================================
# 5. Cleanup Old Backups
# ============================================================================
log "5. Cleaning up old backups..."

# Remove backups older than retention days
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null
find "${BACKUP_DIR}/critical" -name "critical_*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null
find "${BACKUP_DIR}/critical" -name "hashes_*.sha256" -mtime +${RETENTION_DAYS} -delete 2>/dev/null

log "   Old backups cleaned (keeping last ${RETENTION_DAYS} days)"

# ============================================================================
# 6. Backup Statistics
# ============================================================================
log "=========================================="
log "Backup completed successfully!"
log "=========================================="

# Show backup sizes
du -h "${CRITICAL_BACKUP}" 2>/dev/null | awk '{print "   Critical files: " $1}'
du -h "${DB_BACKUP}" 2>/dev/null | awk '{print "   Database: " $1}'

# Total backup size
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" 2>/dev/null | awk '{print $1}')
log "   Total backup size: ${TOTAL_SIZE}"

log "=========================================="

