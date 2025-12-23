/**
 * Comprehensive Security Middleware - Unified Security Protection
 * 
 * Features:
 * - Integrates IP protection, SQL injection guard, and attack logging
 * - Advanced DDoS and brute force protection
 * - Request fingerprinting for bot detection
 * - Automatic IP blocking with database persistence
 * - Real-time threat monitoring
 */

import {
    getClientIP,
    trackRequest,
    isBlocked,
    blockIP,
    detectAttackPatterns,
    setDbQuery as setIPProtectionDbQuery,
    initBlockedIPsTable,
    loadBlockedIPsFromDatabase,
    getStatistics as getIPStats,
    getAllBlockedIPs
} from './ipProtection.js';

import {
    scanRequest as scanForSqlInjection,
    sqlInjectionGuardMiddleware
} from './sqlInjectionGuard.js';

import {
    logAttack,
    getBlockDuration,
    initAttackLogsTable,
    initAttackStatsTable,
    setDbQuery as setAttackLoggerDbQuery,
    getAttackSummary,
    AttackSeverity,
    AttackType
} from './attackLogger.js';

import {
    pathTraversalProtectionMiddleware,
    uploadProtectionMiddleware,
    initFileProtectionTable,
    registerCriticalFiles,
    startFileMonitoring,
    setDbQuery as setFileProtectionDbQuery
} from './fileSystemProtection.js';

// Database query function
let dbQuery = null;

// ==================== Configuration ====================

const CONFIG = {
    // Request patterns for bot detection
    BOT_PATTERNS: {
        // Suspicious user agents
        AGENTS: [
            /sqlmap/i, /nikto/i, /nmap/i, /masscan/i,
            /dirbuster/i, /gobuster/i, /wpscan/i,
            /nessus/i, /acunetix/i, /burpsuite/i,
            /zaproxy/i, /netsparker/i, /metasploit/i,
            /hydra/i, /medusa/i, /john/i
        ],
        // Suspicious paths often probed by bots
        // Note: /api/admin is our legitimate admin API, so it's excluded
        PATHS: [
            /\.env$/i, /\.git\//i, /\.svn\//i,
            /wp-admin/i, /wp-login/i, /wp-content/i,
            /phpmyadmin/i, /adminer\.php/i, /phpinfo\.php/i,
            /shell\.php/i, /c99\.php/i, /r57\.php/i,
            /\.bak$/i, /\.old$/i, /\.orig$/i,
            /test\.php/i, /info\.php/i
        ]
    },
    
    // Trusted proxies (for correct IP detection)
    TRUSTED_PROXIES: [
        '127.0.0.1',
        '::1',
        'localhost'
    ],
    
    // Paths to exclude from security checks (be careful!)
    EXCLUDED_PATHS: [
        '/health',
        '/api/health',
        '/favicon.ico'
    ],
    
    // XSS attack patterns (comprehensive)
    XSS_PATTERNS: [
        // Script tags
        /<script[^>]*>/gi,
        /<\/script>/gi,
        /<script[\s\S]*?>/gi,

        // JavaScript protocol
        /javascript\s*:/gi,
        /&#0*106;&#0*97;&#0*118;&#0*97;&#0*115;&#0*99;&#0*114;&#0*105;&#0*112;&#0*116;/gi, // javascript: encoded

        // Event handlers
        /on(abort|blur|change|click|dblclick|error|focus|keydown|keypress|keyup|load|mousedown|mousemove|mouseout|mouseover|mouseup|reset|resize|scroll|select|submit|unload)\s*=/gi,
        /on(animationend|animationiteration|animationstart|beforeunload|canplay|canplaythrough|contextmenu|copy|cut|drag|dragend|dragenter|dragleave|dragover|dragstart|drop|durationchange|ended|error|focus|focusin|focusout|fullscreenchange|fullscreenerror|hashchange|input|invalid|keydown|keypress|keyup|load|loadeddata|loadedmetadata|loadstart|message|mouseenter|mouseleave|offline|online|open|pagehide|pageshow|paste|pause|play|playing|popstate|progress|ratechange|resize|scroll|search|seeked|seeking|select|show|stalled|storage|submit|suspend|timeupdate|toggle|touchcancel|touchend|touchmove|touchstart|transitionend|unload|volumechange|waiting|wheel)\s*=/gi,

        // Expression/behavior (IE)
        /expression\s*\(/gi,
        /behavior\s*:/gi,
        /binding\s*:/gi,

        // VBScript
        /vbscript\s*:/gi,

        // Data URIs with dangerous types
        /data:\s*text\/html/gi,
        /data:\s*application\/x-javascript/gi,
        /data:\s*text\/javascript/gi,

        // SVG XSS vectors
        /<svg[^>]*onload/gi,
        /<svg[^>]*onerror/gi,
        /<animate[^>]*onbegin/gi,
        /<set[^>]*onbegin/gi,

        // Object/embed/iframe injection
        /<object[^>]*>/gi,
        /<embed[^>]*>/gi,
        /<iframe[^>]*>/gi,
        /<frame[^>]*>/gi,

        // Form hijacking
        /<form[^>]*action\s*=/gi,
        /<input[^>]*formaction\s*=/gi,
        /<button[^>]*formaction\s*=/gi,

        // Base tag hijacking
        /<base[^>]*href\s*=/gi,

        // Meta refresh
        /<meta[^>]*http-equiv\s*=\s*["']?refresh/gi,

        // Link injection
        /<link[^>]*href\s*=\s*["']?javascript/gi,

        // Style injection (CSS expressions)
        /style\s*=\s*["'][^"']*expression\s*\(/gi,
        /style\s*=\s*["'][^"']*url\s*\(\s*["']?javascript/gi,

        // Template literals (modern XSS)
        /\$\{[^}]*\}/g,

        // Angular/Vue template injection
        /\{\{.*?\}\}/g,
        /\[\[.*?\]\]/g,

        // HTML entities that could be XSS
        /&#x0*6a;&#x0*61;&#x0*76;&#x0*61;&#x0*73;&#x0*63;&#x0*72;&#x0*69;&#x0*70;&#x0*74;/gi, // javascript hex encoded
    ]
};

// ==================== Initialization ====================

/**
 * Initialize all security modules
 * @param {Function} queryFn - Database query function
 * @param {string} projectRoot - Project root path for file monitoring
 */
export async function initSecurityModules(queryFn, projectRoot = null) {
    dbQuery = queryFn;
    
    // Set database query for all modules
    setIPProtectionDbQuery(queryFn);
    setAttackLoggerDbQuery(queryFn);
    setFileProtectionDbQuery(queryFn);
    
    console.log('[Security] Initializing security modules...');
    
    try {
        // Initialize database tables
        await Promise.all([
            initBlockedIPsTable(),
            initAttackLogsTable(),
            initAttackStatsTable(),
            initFileProtectionTable()
        ]);
        
        // Load blocked IPs from database
        await loadBlockedIPsFromDatabase();
        
        // Register critical files for monitoring
        if (projectRoot) {
            await registerCriticalFiles(projectRoot);
            startFileMonitoring();
        }
        
        console.log('[Security] All security modules initialized successfully');
    } catch (error) {
        console.error('[Security] Error initializing security modules:', error.message);
    }
}

// ==================== Main Security Middleware ====================

/**
 * Comprehensive security middleware
 * Apply this as early as possible in the middleware chain
 */
export function comprehensiveSecurityMiddleware(req, res, next) {
    const ip = getClientIP(req);
    const path = req.originalUrl || req.url || '';
    const method = req.method;
    const userAgent = req.headers['user-agent'] || '';
    
    // Skip excluded paths
    if (CONFIG.EXCLUDED_PATHS.some(p => path.startsWith(p))) {
        return next();
    }
    
    // 1. Check if IP is blocked
    if (isBlocked(ip)) {
        console.log(`[Security] Blocked IP attempted access: ${ip} -> ${path}`);
        return res.status(403).json({
            success: false,
            message: '您的IP已被封禁',
            error: 'Your IP has been blocked due to suspicious activity'
        });
    }
    
    // 2. Track request rate
    const rateResult = trackRequest(ip);
    if (!rateResult.allowed) {
        logAttack({
            ip,
            attackType: AttackType.RATE_LIMIT,
            severity: AttackSeverity.MEDIUM,
            method,
            path,
            userAgent,
            details: rateResult.reason
        });
        
        return res.status(429).json({
            success: false,
            message: '请求过于频繁，请稍后再试',
            error: 'Rate limit exceeded'
        });
    }
    
    // 3. Check for attack patterns
    const attackResult = detectAttackPatterns(req);
    if (attackResult.isAttack) {
        const severity = attackResult.patterns.length >= 3 ? 
            AttackSeverity.HIGH : AttackSeverity.MEDIUM;
        
        logAttack({
            ip,
            attackType: AttackType.OTHER,
            severity,
            method,
            path,
            body: req.body,
            headers: req.headers,
            userAgent,
            details: 'Attack patterns detected in request',
            patterns: attackResult.patterns
        }).then(result => {
            if (result.shouldBlock) {
                const duration = getBlockDuration(ip);
                blockIP(ip, duration, 'Multiple attack patterns detected');
            }
        });
        
        if (severity === AttackSeverity.HIGH) {
            return res.status(403).json({
                success: false,
                message: '检测到恶意请求',
                error: 'Malicious request detected'
            });
        }
    }
    
    // 4. Check for SQL injection
    const sqlResult = scanForSqlInjection(req);
    if (sqlResult.hasInjection) {
        const severity = sqlResult.highestRisk === 'critical' ? 
            AttackSeverity.CRITICAL : 
            sqlResult.highestRisk === 'high' ? 
                AttackSeverity.HIGH : AttackSeverity.MEDIUM;
        
        logAttack({
            ip,
            attackType: AttackType.SQL_INJECTION,
            severity,
            method,
            path,
            body: req.body,
            userAgent,
            details: `SQL injection detected: ${sqlResult.highestRisk} risk`,
            patterns: sqlResult.details.map(d => d.patterns).flat()
        }).then(result => {
            if (result.shouldBlock) {
                blockIP(ip, getBlockDuration(ip), 'SQL injection attempt', true);
            }
        });
        
        return res.status(403).json({
            success: false,
            message: '检测到SQL注入攻击',
            error: 'SQL injection attack detected'
        });
    }
    
    // 5. Check for XSS patterns
    const xssResult = checkXSS(req);
    if (xssResult.hasXSS) {
        logAttack({
            ip,
            attackType: AttackType.XSS,
            severity: AttackSeverity.HIGH,
            method,
            path,
            body: req.body,
            userAgent,
            details: 'XSS patterns detected',
            patterns: xssResult.patterns
        }).then(result => {
            if (result.shouldBlock) {
                blockIP(ip, getBlockDuration(ip), 'XSS attack attempt');
            }
        });
        
        return res.status(403).json({
            success: false,
            message: '检测到XSS攻击',
            error: 'XSS attack detected'
        });
    }
    
    // 6. Check for bot/scanner activity
    const botResult = checkBot(req);
    if (botResult.isBot) {
        logAttack({
            ip,
            attackType: AttackType.BOT_DETECTION,
            severity: AttackSeverity.MEDIUM,
            method,
            path,
            userAgent,
            details: botResult.reason
        });
        
        // Block aggressive bots
        if (botResult.severity === 'aggressive') {
            blockIP(ip, 60 * 60 * 1000, 'Aggressive bot activity', false);
            
            return res.status(403).json({
                success: false,
                message: '机器人访问已被禁止',
                error: 'Bot access denied'
            });
        }
    }
    
    next();
}

// ==================== XSS Detection ====================

/**
 * Check request for XSS patterns
 * @param {object} req - Express request
 * @returns {object} - { hasXSS: boolean, patterns: string[] }
 */
function checkXSS(req) {
    const patterns = [];
    
    // Check URL
    const url = req.originalUrl || req.url || '';
    for (const pattern of CONFIG.XSS_PATTERNS) {
        if (pattern.test(url)) {
            patterns.push(`URL: ${pattern.toString()}`);
        }
    }
    
    // Check body
    if (req.body) {
        const bodyStr = JSON.stringify(req.body);
        for (const pattern of CONFIG.XSS_PATTERNS) {
            if (pattern.test(bodyStr)) {
                patterns.push(`Body: ${pattern.toString()}`);
            }
        }
    }
    
    // Check query params
    if (req.query) {
        const queryStr = JSON.stringify(req.query);
        for (const pattern of CONFIG.XSS_PATTERNS) {
            if (pattern.test(queryStr)) {
                patterns.push(`Query: ${pattern.toString()}`);
            }
        }
    }
    
    return {
        hasXSS: patterns.length > 0,
        patterns
    };
}

// ==================== Bot Detection ====================

/**
 * Check if request appears to be from a bot/scanner
 * @param {object} req - Express request
 * @returns {object} - { isBot: boolean, reason: string, severity: string }
 */
function checkBot(req) {
    const userAgent = req.headers['user-agent'] || '';
    const path = req.originalUrl || req.url || '';
    
    // Check suspicious user agents
    for (const pattern of CONFIG.BOT_PATTERNS.AGENTS) {
        if (pattern.test(userAgent)) {
            return {
                isBot: true,
                reason: `Suspicious user agent: ${userAgent.substring(0, 100)}`,
                severity: 'aggressive'
            };
        }
    }
    
    // Check for missing user agent
    if (!userAgent || userAgent.length < 10) {
        return {
            isBot: true,
            reason: 'Missing or too short user agent',
            severity: 'suspicious'
        };
    }
    
    // Check suspicious paths
    for (const pattern of CONFIG.BOT_PATTERNS.PATHS) {
        if (pattern.test(path)) {
            return {
                isBot: true,
                reason: `Suspicious path access: ${path}`,
                severity: 'aggressive'
            };
        }
    }
    
    return { isBot: false, reason: '', severity: '' };
}

// ==================== Security Headers Middleware ====================

/**
 * Add additional security headers beyond what helmet provides
 */
export function additionalSecurityHeadersMiddleware(req, res, next) {
    // Prevent browsers from MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Enable XSS filter in browsers
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Restrict referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy (restrict features)
    res.setHeader('Permissions-Policy', 
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    
    // Cache control for sensitive endpoints
    if (req.path.includes('/api/admin') || req.path.includes('/api/user')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    next();
}

// ==================== Brute Force Protection ====================

// Track login attempts per IP
const loginAttempts = new Map();

/**
 * Brute force protection middleware for login endpoints
 */
export function bruteForceProtectionMiddleware(req, res, next) {
    const ip = getClientIP(req);
    const now = Date.now();
    
    // Get or create attempt record
    let attempts = loginAttempts.get(ip) || { count: 0, timestamps: [], blockedUntil: 0 };
    
    // Check if currently blocked
    if (attempts.blockedUntil > now) {
        const remainingSeconds = Math.ceil((attempts.blockedUntil - now) / 1000);
        
        return res.status(429).json({
            success: false,
            message: `登录尝试过多，请 ${remainingSeconds} 秒后再试`,
            error: 'Too many login attempts',
            retryAfter: remainingSeconds
        });
    }
    
    // Clean old timestamps (keep last 15 minutes)
    const cutoff = now - 15 * 60 * 1000;
    attempts.timestamps = attempts.timestamps.filter(ts => ts > cutoff);
    
    // Add current attempt
    attempts.timestamps.push(now);
    attempts.count = attempts.timestamps.length;
    
    // Check thresholds
    // 5 attempts in 1 minute = block 1 minute
    // 10 attempts in 5 minutes = block 5 minutes
    // 20 attempts in 15 minutes = block 30 minutes
    const lastMinute = attempts.timestamps.filter(ts => ts > now - 60000).length;
    const last5Minutes = attempts.timestamps.filter(ts => ts > now - 5 * 60000).length;
    const last15Minutes = attempts.timestamps.length;
    
    if (last15Minutes >= 20) {
        attempts.blockedUntil = now + 30 * 60 * 1000;
        logAttack({
            ip,
            attackType: AttackType.BRUTE_FORCE,
            severity: AttackSeverity.HIGH,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent'],
            details: `Brute force: ${last15Minutes} attempts in 15 minutes`
        });
    } else if (last5Minutes >= 10) {
        attempts.blockedUntil = now + 5 * 60 * 1000;
        logAttack({
            ip,
            attackType: AttackType.BRUTE_FORCE,
            severity: AttackSeverity.MEDIUM,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent'],
            details: `Brute force: ${last5Minutes} attempts in 5 minutes`
        });
    } else if (lastMinute >= 5) {
        attempts.blockedUntil = now + 60 * 1000;
    }
    
    loginAttempts.set(ip, attempts);
    
    // Clean up old entries periodically
    if (loginAttempts.size > 10000) {
        for (const [key, val] of loginAttempts.entries()) {
            if (val.timestamps.length === 0 || val.timestamps[val.timestamps.length - 1] < cutoff) {
                loginAttempts.delete(key);
            }
        }
    }
    
    if (attempts.blockedUntil > now) {
        const remainingSeconds = Math.ceil((attempts.blockedUntil - now) / 1000);
        return res.status(429).json({
            success: false,
            message: `登录尝试过多，请 ${remainingSeconds} 秒后再试`,
            error: 'Too many login attempts',
            retryAfter: remainingSeconds
        });
    }
    
    next();
}

/**
 * Clear login attempts for an IP (call after successful login)
 * @param {string} ip - IP address
 */
export function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
}

// ==================== Statistics & Monitoring ====================

/**
 * Get comprehensive security statistics
 * @returns {object} - Security statistics
 */
export function getSecurityStats() {
    const ipStats = getIPStats();
    const attackSummary = getAttackSummary();
    
    return {
        ipProtection: ipStats,
        attacks: attackSummary,
        bruteForce: {
            trackedIPs: loginAttempts.size,
            currentlyBlocked: Array.from(loginAttempts.values())
                .filter(a => a.blockedUntil > Date.now()).length
        }
    };
}

/**
 * Get blocked IPs list
 * @returns {Array} - List of blocked IPs
 */
export function getBlockedIPsList() {
    return getAllBlockedIPs();
}

// ==================== Export All ====================

export {
    // From ipProtection.js
    getClientIP,
    blockIP,
    isBlocked,
    
    // From sqlInjectionGuard.js
    sqlInjectionGuardMiddleware,
    
    // From fileSystemProtection.js
    pathTraversalProtectionMiddleware,
    uploadProtectionMiddleware
};

export default {
    initSecurityModules,
    comprehensiveSecurityMiddleware,
    additionalSecurityHeadersMiddleware,
    bruteForceProtectionMiddleware,
    clearLoginAttempts,
    pathTraversalProtectionMiddleware,
    uploadProtectionMiddleware,
    getSecurityStats,
    getBlockedIPsList,
    blockIP,
    getClientIP
};

