/**
 * SQL Injection Protection Module
 * 
 * Provides comprehensive SQL injection prevention:
 * - Input validation and sanitization
 * - Dangerous pattern detection
 * - Wallet address validation
 * - Request parameter sanitization middleware
 */

// ==================== Dangerous SQL Patterns ====================

// Common SQL injection patterns to detect
const SQL_INJECTION_PATTERNS = [
    // SQL keywords with spaces or special chars
    /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|EXEC|UNION|FETCH|DECLARE|CAST)\s/i,
    // Comment patterns - be more specific to avoid matching HTML entities like &#x2F;
    // Note: # is used in HTML entities (&#...) so we need to match it only at line end or with whitespace
    /(--\s|#\s|#$|\/\*|\*\/)/,
    // OR/AND based injection
    /(\s|^)(OR|AND)\s+[\d\w'"]+=[\d\w'"]/i,
    // Typical injection attempts
    /['"](\s*)(OR|AND)(\s*)['"]?(\s*)[=<>]/i,
    // UNION SELECT
    /UNION(\s+ALL)?\s+SELECT/i,
    // Stacked queries
    /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP)/i,
    // NOTE: Removed hex pattern /0x[0-9a-fA-F]+/ because it blocks valid Ethereum addresses
    // System commands
    /(xp_|sp_|exec\s*\(|execute\s*\()/i,
    // Information schema access
    /information_schema/i,
    // Sleep/benchmark attacks
    /(SLEEP|BENCHMARK|WAITFOR)\s*\(/i,
    // Load file attacks
    /LOAD_FILE|INTO\s+(OUT|DUMP)FILE/i,
    // Char function abuse
    /CHAR\s*\(\s*\d+/i
];

// Whitelist of allowed characters for different input types
const INPUT_PATTERNS = {
    // Ethereum wallet address: 0x followed by 40 hex chars
    walletAddress: /^0x[a-fA-F0-9]{40}$/,
    // Transaction hash: 0x followed by 64 hex chars
    txHash: /^0x[a-fA-F0-9]{64}$/,
    // Numeric ID: positive integers only
    numericId: /^\d+$/,
    // Safe string: alphanumeric, underscore, dash, space
    safeString: /^[a-zA-Z0-9_\-\s]+$/,
    // Email format
    email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    // Date format: YYYY-MM-DD
    date: /^\d{4}-\d{2}-\d{2}$/,
    // Amount: decimal number
    amount: /^\d+(\.\d+)?$/
};

// ==================== Validation Functions ====================

/**
 * Check if string contains SQL injection patterns
 * @param {string} input - Input string to check
 * @returns {object} - { safe: boolean, detectedPattern: string|null }
 */
function detectSqlInjection(input) {
    if (typeof input !== 'string') {
        return { safe: true, detectedPattern: null };
    }
    
    // Skip detection for valid Ethereum wallet addresses (0x + 40 hex chars)
    if (INPUT_PATTERNS.walletAddress.test(input)) {
        return { safe: true, detectedPattern: null };
    }
    
    // Skip detection for valid transaction hashes (0x + 64 hex chars)
    if (INPUT_PATTERNS.txHash.test(input)) {
        return { safe: true, detectedPattern: null };
    }
    
    for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(input)) {
            return { 
                safe: false, 
                detectedPattern: pattern.toString(),
                input: input.substring(0, 100) // Log first 100 chars
            };
        }
    }
    
    return { safe: true, detectedPattern: null };
}

/**
 * Validate wallet address format
 * @param {string} address - Wallet address to validate
 * @returns {boolean} - True if valid
 */
function isValidWalletAddress(address) {
    if (!address || typeof address !== 'string') {
        return false;
    }
    return INPUT_PATTERNS.walletAddress.test(address);
}

/**
 * Validate transaction hash format
 * @param {string} hash - Transaction hash to validate
 * @returns {boolean} - True if valid
 */
function isValidTxHash(hash) {
    if (!hash || typeof hash !== 'string') {
        return false;
    }
    return INPUT_PATTERNS.txHash.test(hash);
}

/**
 * Validate numeric ID
 * @param {string|number} id - ID to validate
 * @returns {boolean} - True if valid positive integer
 */
function isValidNumericId(id) {
    if (id === undefined || id === null) {
        return false;
    }
    return INPUT_PATTERNS.numericId.test(String(id));
}

/**
 * Sanitize string input by escaping special characters
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    // Escape single quotes (for display, not SQL - use parameterized queries!)
    sanitized = sanitized.replace(/'/g, "''");
    
    // Remove potential script tags
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
    
    // Limit length to prevent buffer overflow attacks
    if (sanitized.length > 10000) {
        sanitized = sanitized.substring(0, 10000);
    }
    
    return sanitized;
}

/**
 * Validate pagination parameters
 * @param {string|number} page - Page number
 * @param {string|number} pageSize - Page size
 * @returns {object} - { page: number, pageSize: number, offset: number }
 */
function validatePagination(page, pageSize) {
    const validPage = Math.max(1, parseInt(page) || 1);
    const validPageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const offset = (validPage - 1) * validPageSize;
    
    return { page: validPage, pageSize: validPageSize, offset };
}

// ==================== Express Middleware ====================

/**
 * SQL Injection Protection Middleware
 * Checks all request parameters for SQL injection patterns
 */
function sqlInjectionMiddleware(req, res, next) {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.ip || 'unknown';
    
    // Check query parameters
    for (const [key, value] of Object.entries(req.query || {})) {
        if (typeof value === 'string') {
            const result = detectSqlInjection(value);
            if (!result.safe) {
                console.warn(`[SQLProtection] SQL Injection detected in query param "${key}" from IP ${clientIP}:`, result.input);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request parameters'
                });
            }
        }
    }
    
    // Check body parameters
    for (const [key, value] of Object.entries(req.body || {})) {
        if (typeof value === 'string') {
            const result = detectSqlInjection(value);
            if (!result.safe) {
                console.warn(`[SQLProtection] SQL Injection detected in body param "${key}" from IP ${clientIP}:`, result.input);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request parameters'
                });
            }
        }
    }
    
    // Check URL parameters
    for (const [key, value] of Object.entries(req.params || {})) {
        if (typeof value === 'string') {
            const result = detectSqlInjection(value);
            if (!result.safe) {
                console.warn(`[SQLProtection] SQL Injection detected in URL param "${key}" from IP ${clientIP}:`, result.input);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid request parameters'
                });
            }
        }
    }
    
    next();
}

/**
 * Wallet Address Validation Middleware
 * Validates wallet_address parameter in requests
 */
function walletValidationMiddleware(req, res, next) {
    const walletAddress = req.query.wallet_address || req.body.wallet_address || req.params.wallet_address;
    
    if (walletAddress && !isValidWalletAddress(walletAddress)) {
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
        console.warn(`[SQLProtection] Invalid wallet address format from IP ${clientIP}: ${String(walletAddress).substring(0, 50)}`);
        return res.status(400).json({
            success: false,
            message: 'Invalid wallet address format'
        });
    }
    
    next();
}

// ==================== Exports ====================

export {
    detectSqlInjection,
    isValidWalletAddress,
    isValidTxHash,
    isValidNumericId,
    sanitizeString,
    validatePagination,
    sqlInjectionMiddleware,
    walletValidationMiddleware,
    SQL_INJECTION_PATTERNS,
    INPUT_PATTERNS
};

export default {
    detectSqlInjection,
    isValidWalletAddress,
    isValidTxHash,
    isValidNumericId,
    sanitizeString,
    validatePagination,
    sqlInjectionMiddleware,
    walletValidationMiddleware
};

