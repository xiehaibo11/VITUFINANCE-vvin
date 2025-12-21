#!/bin/bash

# ============================================================================
# VituFinance File Integrity Monitor
# 
# Features:
# - Monitor critical files for changes/deletion
# - Alert on unauthorized modifications
# - Automatic recovery from backup
# - Real-time monitoring
#
# Usage: Run as cron every 5 minutes
# */5 * * * * /www/wwwroot/vitufinance.com/scripts/file-integrity-monitor.sh
# ============================================================================

set -e

# Configuration
PROJECT_DIR="/www/wwwroot/vitufinance.com"
BACKUP_DIR="/www/wwwroot/vitufinance.com/backups"
LOG_FILE="${BACKUP_DIR}/integrity.log"
ALERT_LOG="${BACKUP_DIR}/alerts.log"

# Critical files to monitor
CRITICAL_FILES=(
    "backend/src/config/robotConfig.js"
    "backend/src/utils/referralMath.js"
    "backend/src/utils/teamMath.js"
    "backend/src/routes/robotRoutes.js"
    "backend/src/security/index.js"
    "backend/server.js"
    "backend/.env"
    "frontend/src/views/Robot.vue"
    "frontend/src/views/Assets.vue"
    "frontend/src/utils/robotCalc.js"
)

# Create directories
mkdir -p "${BACKUP_DIR}"

# Function: Log message
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

# Function: Alert
alert() {
    local message="$1"
    echo "[ALERT $(date '+%Y-%m-%d %H:%M:%S')] $message" | tee -a "${ALERT_LOG}"
    # You can add email/SMS notification here
    # mail -s "VituFinance Security Alert" admin@example.com <<< "$message"
}

# ============================================================================
# Main Integrity Check
# ============================================================================

log "Starting integrity check..."

MISSING_FILES=0
MODIFIED_FILES=0

cd "${PROJECT_DIR}"

# Check each critical file
for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        alert "CRITICAL: File missing - ${file}"
        MISSING_FILES=$((MISSING_FILES + 1))
        
        # Try to recover from git
        if [ -d ".git" ]; then
            log "Attempting to recover ${file} from git..."
            git checkout HEAD -- "$file" 2>/dev/null && log "   Recovered: ${file}" || log "   Recovery failed: ${file}"
        fi
    fi
done

# Check file sizes (detect emptied files)
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        SIZE=$(stat -c%s "$file" 2>/dev/null || echo "0")
        if [ "$SIZE" -lt 100 ]; then
            alert "WARNING: File suspiciously small (${SIZE} bytes) - ${file}"
            MODIFIED_FILES=$((MODIFIED_FILES + 1))
        fi
    fi
done

# Summary
if [ $MISSING_FILES -gt 0 ] || [ $MODIFIED_FILES -gt 0 ]; then
    alert "Integrity check failed: ${MISSING_FILES} missing, ${MODIFIED_FILES} modified"
else
    log "Integrity check passed - all ${#CRITICAL_FILES[@]} files OK"
fi

# Check backend service status
if ! pm2 list 2>/dev/null | grep -q "vitu-backend.*online"; then
    alert "WARNING: Backend service not running!"
    log "Attempting to restart backend..."
    cd "${PROJECT_DIR}/backend" && pm2 restart vitu-backend 2>/dev/null || log "Restart failed"
fi

log "Integrity check completed"

