/**
 * CSRF Protection Middleware
 * Provides Cross-Site Request Forgery protection
 */

import crypto from 'crypto';
import session from 'express-session';

// CSRF token storage (in production, use Redis or session store)
const csrfTokens = new Map();

/**
 * Session middleware for CSRF and authentication
 */
export const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
});

/**
 * Generate a CSRF token
 * @param {string} sessionId - Session identifier
 * @returns {string} CSRF token
 */
function generateToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    csrfTokens.set(token, {
        sessionId,
        createdAt: Date.now(),
        expires: Date.now() + 3600000 // 1 hour
    });
    return token;
}

/**
 * Validate a CSRF token
 * @param {string} token - Token to validate
 * @returns {boolean} Is valid
 */
function validateToken(token) {
    const data = csrfTokens.get(token);
    if (!data) return false;
    if (data.expires < Date.now()) {
        csrfTokens.delete(token);
        return false;
    }
    return true;
}

/**
 * CSRF protection middleware
 */
export function csrfProtection(req, res, next) {
    // Skip for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    
    const token = req.headers['x-csrf-token'] || req.body._csrf;
    
    if (!token || !validateToken(token)) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or missing CSRF token'
        });
    }
    
    // Consume the token
    csrfTokens.delete(token);
    next();
}

/**
 * API CSRF protection (less strict, for API endpoints)
 */
export function apiCsrfProtection(req, res, next) {
    // For API endpoints, we check origin/referer instead of token
    const origin = req.headers.origin || req.headers.referer;
    const allowedOrigins = [
        'https://bocail.com',
        'https://www.bocail.com',
        'http://localhost:5173',
        'http://127.0.0.1:5173'
    ];
    
    if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        return res.status(403).json({
            success: false,
            message: 'Cross-origin request blocked'
        });
    }
    
    next();
}

/**
 * CSRF token middleware - adds token to response
 */
export function csrfTokenMiddleware(req, res, next) {
    // Generate session ID if not exists
    const sessionId = req.sessionID || req.headers['x-session-id'] || crypto.randomBytes(16).toString('hex');
    
    // Generate new token
    const token = generateToken(sessionId);
    
    // Add token to response header
    res.setHeader('X-CSRF-Token', token);
    
    // Add method to get token
    res.locals.csrfToken = token;
    
    next();
}

/**
 * CSRF error handler
 */
export function csrfErrorHandler(err, req, res, next) {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            success: false,
            message: 'Invalid CSRF token'
        });
    }
    next(err);
}

/**
 * Setup CSRF routes
 * @param {Express} app - Express app
 */
export function setupCsrfRoutes(app) {
    // Endpoint to get CSRF token
    app.get('/api/csrf-token', (req, res) => {
        const sessionId = req.sessionID || crypto.randomBytes(16).toString('hex');
        const token = generateToken(sessionId);
        res.json({
            success: true,
            csrfToken: token
        });
    });
    
    console.log('[CSRF] CSRF routes initialized');
}

// Clean up expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of csrfTokens.entries()) {
        if (data.expires < now) {
            csrfTokens.delete(token);
        }
    }
}, 300000); // Every 5 minutes

export default {
    sessionMiddleware,
    csrfProtection,
    apiCsrfProtection,
    csrfTokenMiddleware,
    csrfErrorHandler,
    setupCsrfRoutes
};

