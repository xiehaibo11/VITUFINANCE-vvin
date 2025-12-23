/**
 * IP Blacklist Module
 *
 * Contains known malicious IP ranges and suspicious patterns
 * Updated: 2025-12-23
 */

// ==================== Known Malicious IP Ranges ====================
// These are CIDR ranges commonly associated with attacks
// Sources: Spamhaus, AbuseIPDB, Project Honeypot, etc.

const MALICIOUS_IP_RANGES = [
    // Known scanner/bot ranges (example ranges - should be updated regularly)
    // Note: Be careful not to block legitimate users

    // Common VPN exit nodes used for attacks (example - verify before using)
    // '185.220.100.0/24',  // Tor exit nodes (uncomment if needed)
    // '185.220.101.0/24',

    // Data center ranges commonly used for attacks
    // Only add specific ranges after confirming abuse patterns
];

// ==================== User Agent Blacklist ====================
const BLOCKED_USER_AGENTS = [
    // Vulnerability scanners
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'dirbuster',
    'gobuster',
    'wpscan',
    'nessus',
    'acunetix',
    'burpsuite',
    'zaproxy',
    'netsparker',
    'metasploit',
    'hydra',
    'medusa',
    'john',
    'nuclei',
    'ffuf',
    'feroxbuster',
    'wfuzz',
    'dirb',
    'skipfish',
    'arachni',
    'w3af',
    'openvas',
    'qualys',
    'rapid7',
    'tenable',

    // Bad bots
    'ahrefsbot',  // SEO crawler (often aggressive)
    'semrushbot', // SEO crawler
    'dotbot',     // SEO crawler
    'mj12bot',    // Majestic crawler
    'blexbot',
    'petalbot',
    'sogou',
    'yandexbot',
    'baiduspider',
    'bytespider', // TikTok bot (aggressive)

    // Fake browsers
    'python-requests',
    'python-urllib',
    'curl/',
    'wget/',
    'httpie/',
    'postman',
    'insomnia',
    'axios/',
    'node-fetch',
    'got/',

    // Empty or suspicious
    '-',
    'null',
    'undefined',
];

// ==================== Blocked URL Patterns ====================
const BLOCKED_URL_PATTERNS = [
    // WordPress probing
    '/wp-admin',
    '/wp-login',
    '/wp-content',
    '/wp-includes',
    '/xmlrpc.php',
    '/wp-config',

    // PHP probing
    '/phpmyadmin',
    '/adminer',
    '/phpinfo',
    '/info.php',
    '/test.php',
    '/shell.php',
    '/c99.php',
    '/r57.php',
    '/webshell',

    // Config files
    '/.env',
    '/.git',
    '/.svn',
    '/.htaccess',
    '/.htpasswd',
    '/config.php',
    '/database.php',
    '/settings.php',
    '/configuration.php',

    // Backup files
    '.bak',
    '.old',
    '.orig',
    '.backup',
    '.save',
    '.swp',
    '.swo',
    '~',

    // System files
    '/etc/passwd',
    '/etc/shadow',
    '/proc/self',
    '/var/log',

    // Java/Tomcat
    '/manager/html',
    '/jmx-console',
    '/web-console',
    '/invoker',

    // Other CMS
    '/administrator',
    '/admin.php',
    '/login.php',
    '/user/login',
    '/drupal',
    '/joomla',
    '/magento',

    // Directory traversal
    '../',
    '..%2f',
    '..%252f',
    '..\\',
    '..%5c',
];

// ==================== Blocked Referrers ====================
const BLOCKED_REFERRERS = [
    'semalt.com',
    'buttons-for-website.com',
    'darodar.com',
    'ilovevitaly.com',
    'make-money-online.7makemoneyonline.com',
    'trafficmonetize.org',
    'traffic2money.com',
    'success-seo.com',
    'free-social-buttons.com',
];

// ==================== Suspicious Request Patterns ====================
const SUSPICIOUS_PATTERNS = {
    // SQL injection indicators
    SQL_INJECTION: [
        /union[\s\/\*]+select/i,
        /select[\s\/\*]+.*[\s\/\*]+from/i,
        /insert[\s\/\*]+into/i,
        /update[\s\/\*]+.*[\s\/\*]+set/i,
        /delete[\s\/\*]+from/i,
        /drop[\s\/\*]+(table|database)/i,
        /'\s*or\s+'1'\s*=\s*'1/i,
        /'\s*or\s+1\s*=\s*1/i,
        /information_schema/i,
        /sleep\s*\(\s*\d/i,
        /benchmark\s*\(/i,
        /waitfor\s+delay/i,
    ],

    // XSS indicators
    XSS: [
        /<script[^>]*>/i,
        /javascript\s*:/i,
        /on(load|error|click|mouseover)\s*=/i,
        /expression\s*\(/i,
        /<iframe[^>]*>/i,
        /<object[^>]*>/i,
    ],

    // Command injection indicators
    COMMAND_INJECTION: [
        /;\s*(cat|ls|id|whoami|uname|pwd)/i,
        /\|\s*(cat|ls|id|whoami|uname|pwd)/i,
        /`(cat|ls|id|whoami|uname|pwd)`/i,
        /\$\((cat|ls|id|whoami|uname|pwd)\)/i,
        /system\s*\(/i,
        /exec\s*\(/i,
        /passthru\s*\(/i,
        /shell_exec\s*\(/i,
    ],

    // Path traversal indicators
    PATH_TRAVERSAL: [
        /\.\.\//,
        /\.\.%2f/i,
        /\.\.%252f/i,
        /\.\.%5c/i,
        /\.\.\\\\?/,
    ],
};

// ==================== Utility Functions ====================

/**
 * Check if IP is in a CIDR range
 * @param {string} ip - IP address to check
 * @param {string} cidr - CIDR range (e.g., '192.168.1.0/24')
 * @returns {boolean}
 */
function isIPInCIDR(ip, cidr) {
    const [range, bits = '32'] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
    const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);

    return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if IP is in any malicious range
 * @param {string} ip - IP address to check
 * @returns {boolean}
 */
function isIPBlacklisted(ip) {
    // Skip IPv6 for now
    if (ip.includes(':')) return false;

    for (const cidr of MALICIOUS_IP_RANGES) {
        if (isIPInCIDR(ip, cidr)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if user agent is blocked
 * @param {string} userAgent - User agent string
 * @returns {boolean}
 */
function isUserAgentBlocked(userAgent) {
    if (!userAgent) return true; // Block empty user agents

    const ua = userAgent.toLowerCase();

    // Block if too short
    if (ua.length < 10) return true;

    // Check against blocked list
    for (const blocked of BLOCKED_USER_AGENTS) {
        if (ua.includes(blocked.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Check if URL contains blocked patterns
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isURLBlocked(url) {
    if (!url) return false;

    const lowerUrl = url.toLowerCase();

    for (const pattern of BLOCKED_URL_PATTERNS) {
        if (lowerUrl.includes(pattern.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Check if referrer is blocked
 * @param {string} referrer - Referrer URL
 * @returns {boolean}
 */
function isReferrerBlocked(referrer) {
    if (!referrer) return false;

    const lowerRef = referrer.toLowerCase();

    for (const blocked of BLOCKED_REFERRERS) {
        if (lowerRef.includes(blocked.toLowerCase())) {
            return true;
        }
    }

    return false;
}

/**
 * Check request for suspicious patterns
 * @param {string} content - Content to check (URL, body, params)
 * @returns {object} - { suspicious: boolean, type: string, pattern: string }
 */
function checkSuspiciousPatterns(content) {
    if (!content) return { suspicious: false };

    for (const [type, patterns] of Object.entries(SUSPICIOUS_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                return {
                    suspicious: true,
                    type,
                    pattern: pattern.toString()
                };
            }
        }
    }

    return { suspicious: false };
}

/**
 * Comprehensive request check
 * @param {object} req - Express request object
 * @returns {object} - { blocked: boolean, reason: string }
 */
function checkRequest(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.ip ||
               'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const url = req.originalUrl || req.url || '';
    const referrer = req.headers['referer'] || '';
    const body = req.body ? JSON.stringify(req.body) : '';

    // Check IP blacklist
    if (isIPBlacklisted(ip)) {
        return { blocked: true, reason: 'IP in blacklist' };
    }

    // Check user agent
    if (isUserAgentBlocked(userAgent)) {
        return { blocked: true, reason: `Blocked user agent: ${userAgent.substring(0, 50)}` };
    }

    // Check URL patterns
    if (isURLBlocked(url)) {
        return { blocked: true, reason: `Blocked URL pattern: ${url.substring(0, 100)}` };
    }

    // Check referrer
    if (isReferrerBlocked(referrer)) {
        return { blocked: true, reason: 'Blocked referrer' };
    }

    // Check for suspicious patterns in URL
    const urlCheck = checkSuspiciousPatterns(url);
    if (urlCheck.suspicious) {
        return { blocked: true, reason: `${urlCheck.type} attempt in URL` };
    }

    // Check for suspicious patterns in body
    if (body) {
        const bodyCheck = checkSuspiciousPatterns(body);
        if (bodyCheck.suspicious) {
            return { blocked: true, reason: `${bodyCheck.type} attempt in body` };
        }
    }

    return { blocked: false };
}

/**
 * Middleware for IP blacklist checking
 */
function ipBlacklistMiddleware(req, res, next) {
    const result = checkRequest(req);

    if (result.blocked) {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.ip || 'unknown';

        console.log(`[IPBlacklist] Blocked request from ${ip}: ${result.reason}`);

        return res.status(403).json({
            success: false,
            message: 'Access denied',
            error: 'Your request has been blocked'
        });
    }

    next();
}

// ==================== Exports ====================

export {
    MALICIOUS_IP_RANGES,
    BLOCKED_USER_AGENTS,
    BLOCKED_URL_PATTERNS,
    BLOCKED_REFERRERS,
    SUSPICIOUS_PATTERNS,
    isIPInCIDR,
    isIPBlacklisted,
    isUserAgentBlocked,
    isURLBlocked,
    isReferrerBlocked,
    checkSuspiciousPatterns,
    checkRequest,
    ipBlacklistMiddleware
};

export default {
    checkRequest,
    ipBlacklistMiddleware,
    isIPBlacklisted,
    isUserAgentBlocked,
    isURLBlocked
};
