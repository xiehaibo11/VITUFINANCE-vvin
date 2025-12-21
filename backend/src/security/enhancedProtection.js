/**
 * Enhanced Security Protection Module
 * 
 * Advanced security features:
 * - Automatic malicious IP blocking
 * - Request pattern analysis
 * - File integrity monitoring
 * - Database query sanitization
 * - Real-time threat detection
 * 
 * Created: 2024-12-21
 */

// ==================== Configuration ====================

const SECURITY_CONFIG = {
    // Attack detection thresholds
    SQL_INJECTION_THRESHOLD: 5,      // Block after 5 SQL injection attempts
    RATE_LIMIT_THRESHOLD: 100,       // Block after 100 rate limit violations
    BRUTE_FORCE_THRESHOLD: 10,       // Block after 10 failed login attempts
    
    // Auto-block durations (milliseconds)
    TEMP_BLOCK_DURATION: 30 * 60 * 1000,        // 30 minutes
    MEDIUM_BLOCK_DURATION: 24 * 60 * 60 * 1000,  // 24 hours
    PERMANENT_BLOCK_DURATION: 0,                  // Permanent (0 = never expires)
    
    // Dangerous patterns to detect
    DANGEROUS_PATTERNS: [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,                    // SQL injection chars
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i, // SQL injection patterns
        /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i, // SQL OR pattern
        /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,       // XSS script tags
        /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i, // XSS img tags
        /union[\s\S]*select/i,                                // SQL UNION
        /exec(\s|\+)+(s|x)p\w+/i,                             // SQL exec
        /INFORMATION_SCHEMA|SCHEMATA|TABLES|COLUMNS/i,        // SQL schema access
        /DROP\s+TABLE|DROP\s+DATABASE/i,                      // SQL DROP
        /INSERT\s+INTO|UPDATE\s+.*SET|DELETE\s+FROM/i,        // SQL modification
        /\.\.\//g,                                             // Path traversal
        /\/etc\/passwd|\/etc\/shadow/i,                        // Linux system files
        /cmd\.exe|powershell|bash\s+-/i,                       // Command execution
        /eval\s*\(|exec\s*\(|system\s*\(/i,                    // Code execution
    ],
    
    // Whitelist IPs (never block)
    WHITELIST_IPS: [
        '127.0.0.1',
        '::1',
        '::ffff:127.0.0.1',
        'localhost'
    ],
    
    // Protected files and directories
    PROTECTED_PATHS: [
        '/etc/',
        '/root/',
        '/var/',
        '/www/server/',
        '../',
        '..\\',
        '.env',
        '.git/',
        'node_modules/',
        'package.json'
    ]
};

// ==================== In-Memory Tracking ====================

// Track attack attempts per IP: { ip: { type: count } }
const attackAttempts = new Map();

// Track blocked IPs in memory for fast lookup
const blockedIPsCache = new Set();

// Database query function reference
let dbQuery = null;

// ==================== Initialization ====================

/**
 * Initialize the enhanced protection module
 * @param {Function} queryFn - Database query function
 */
export async function initEnhancedProtection(queryFn) {
    dbQuery = queryFn;
    
    // Load blocked IPs from database into cache
    await loadBlockedIPsToCache();
    
    // Set up periodic cache refresh
    setInterval(loadBlockedIPsToCache, 5 * 60 * 1000); // Refresh every 5 minutes
    
    console.log('[EnhancedProtection] Initialized with', blockedIPsCache.size, 'blocked IPs');
}

/**
 * Load blocked IPs from database into memory cache
 */
async function loadBlockedIPsToCache() {
    if (!dbQuery) return;
    
    try {
        const results = await dbQuery(
            `SELECT ip_address FROM blocked_ips 
             WHERE is_permanent = 1 
                OR (duration_ms > 0 AND blocked_at > DATE_SUB(NOW(), INTERVAL duration_ms/1000 SECOND))`
        );
        
        blockedIPsCache.clear();
        for (const row of results) {
            blockedIPsCache.add(row.ip_address);
        }
    } catch (error) {
        console.error('[EnhancedProtection] Failed to load blocked IPs:', error.message);
    }
}

// ==================== Core Protection Functions ====================

/**
 * Check if an IP is blocked (fast in-memory check)
 * @param {string} ip - IP address to check
 * @returns {boolean} - True if blocked
 */
export function isIPBlocked(ip) {
    // Check whitelist first
    if (SECURITY_CONFIG.WHITELIST_IPS.includes(ip)) {
        return false;
    }
    
    return blockedIPsCache.has(ip);
}

/**
 * Block an IP address
 * @param {string} ip - IP address to block
 * @param {string} reason - Reason for blocking
 * @param {boolean} permanent - Whether to permanently block
 * @param {number} duration - Block duration in ms (0 for permanent)
 */
export async function blockIP(ip, reason, permanent = false, duration = SECURITY_CONFIG.MEDIUM_BLOCK_DURATION) {
    // Don't block whitelisted IPs
    if (SECURITY_CONFIG.WHITELIST_IPS.includes(ip)) {
        return false;
    }
    
    // Add to memory cache immediately
    blockedIPsCache.add(ip);
    
    // Save to database
    if (dbQuery) {
        try {
            await dbQuery(
                `INSERT INTO blocked_ips (ip_address, blocked_at, duration_ms, reason, is_permanent)
                 VALUES (?, NOW(), ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                    blocked_at = NOW(),
                    duration_ms = VALUES(duration_ms),
                    reason = VALUES(reason),
                    is_permanent = VALUES(is_permanent)`,
                [ip, permanent ? 0 : duration, reason, permanent ? 1 : 0]
            );
            
            console.log(`[EnhancedProtection] IP blocked: ${ip} - ${reason} (permanent: ${permanent})`);
            return true;
        } catch (error) {
            console.error('[EnhancedProtection] Failed to block IP:', error.message);
        }
    }
    
    return false;
}

/**
 * Record an attack attempt and auto-block if threshold exceeded
 * @param {string} ip - Attacker IP
 * @param {string} attackType - Type of attack
 * @param {object} details - Attack details
 */
export async function recordAttack(ip, attackType, details = {}) {
    // Skip whitelisted IPs
    if (SECURITY_CONFIG.WHITELIST_IPS.includes(ip)) {
        return;
    }
    
    // Track attack attempts
    if (!attackAttempts.has(ip)) {
        attackAttempts.set(ip, {});
    }
    const ipAttempts = attackAttempts.get(ip);
    ipAttempts[attackType] = (ipAttempts[attackType] || 0) + 1;
    
    // Check thresholds and auto-block
    const threshold = getThresholdForAttackType(attackType);
    if (ipAttempts[attackType] >= threshold) {
        const permanent = ipAttempts[attackType] >= threshold * 3; // Permanent after 3x threshold
        await blockIP(ip, `Auto-blocked: ${attackType} (${ipAttempts[attackType]} attempts)`, permanent);
    }
    
    // Log attack to database
    if (dbQuery) {
        try {
            await dbQuery(
                `INSERT INTO attack_logs (ip_address, attack_type, severity, request_method, request_path, attack_details, blocked)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    ip,
                    attackType,
                    ipAttempts[attackType] >= threshold ? 'high' : 'medium',
                    details.method || 'GET',
                    details.path || '/',
                    JSON.stringify(details),
                    isIPBlocked(ip) ? 1 : 0
                ]
            );
        } catch (error) {
            console.error('[EnhancedProtection] Failed to log attack:', error.message);
        }
    }
}

/**
 * Get blocking threshold for attack type
 */
function getThresholdForAttackType(attackType) {
    switch (attackType) {
        case 'sql_injection': return SECURITY_CONFIG.SQL_INJECTION_THRESHOLD;
        case 'rate_limit': return SECURITY_CONFIG.RATE_LIMIT_THRESHOLD;
        case 'brute_force': return SECURITY_CONFIG.BRUTE_FORCE_THRESHOLD;
        default: return 10;
    }
}

// ==================== Request Validation ====================

/**
 * Check request for dangerous patterns
 * @param {object} req - Express request object
 * @returns {object} - { safe: boolean, pattern: string|null }
 */
export function validateRequest(req) {
    const fullUrl = req.originalUrl || req.url || '';
    const body = JSON.stringify(req.body || {});
    const params = JSON.stringify(req.params || {});
    const query = JSON.stringify(req.query || {});
    
    const checkString = fullUrl + body + params + query;
    
    for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
        if (pattern.test(checkString)) {
            return { safe: false, pattern: pattern.toString() };
        }
    }
    
    // Check for path traversal in URL
    for (const protectedPath of SECURITY_CONFIG.PROTECTED_PATHS) {
        if (checkString.toLowerCase().includes(protectedPath.toLowerCase())) {
            return { safe: false, pattern: `Protected path access: ${protectedPath}` };
        }
    }
    
    return { safe: true, pattern: null };
}

/**
 * Sanitize SQL parameters (additional layer)
 * @param {string} value - Value to sanitize
 * @returns {string} - Sanitized value
 */
export function sanitizeSQLParam(value) {
    if (typeof value !== 'string') return value;
    
    // Remove or escape dangerous characters
    return value
        .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
        .replace(/['"\\;]/g, char => '\\' + char) // Escape quotes and backslash
        .replace(/--/g, '') // Remove SQL comments
        .replace(/\/\*/g, '') // Remove C-style comments start
        .replace(/\*\//g, ''); // Remove C-style comments end
}

// ==================== Middleware ====================

/**
 * Express middleware for enhanced protection
 */
export function enhancedProtectionMiddleware(req, res, next) {
    const ip = getClientIP(req);
    
    // Check if IP is blocked
    if (isIPBlocked(ip)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied',
            code: 'IP_BLOCKED'
        });
    }
    
    // Validate request
    const validation = validateRequest(req);
    if (!validation.safe) {
        recordAttack(ip, 'sql_injection', {
            method: req.method,
            path: req.path,
            pattern: validation.pattern
        });
        
        return res.status(400).json({
            success: false,
            message: 'Invalid request',
            code: 'INVALID_REQUEST'
        });
    }
    
    next();
}

/**
 * Get client IP from request
 */
function getClientIP(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.ip || req.connection?.remoteAddress || 'unknown';
}

// ==================== Export ====================

export {
    SECURITY_CONFIG,
    blockedIPsCache,
    attackAttempts
};

export default {
    initEnhancedProtection,
    isIPBlocked,
    blockIP,
    recordAttack,
    validateRequest,
    sanitizeSQLParam,
    enhancedProtectionMiddleware,
    SECURITY_CONFIG
};

