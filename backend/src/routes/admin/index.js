/**
 * Admin Routes - Main Entry Point
 * 
 * Module Organization:
 * - authRoutes: Authentication (login, info)
 * - dashboardRoutes: Dashboard statistics
 * - userRoutes: User management
 * - depositRoutes: Deposit records
 * - withdrawalRoutes: Withdrawal records
 * - robotRoutes: Robot management
 * - fakeAccountRoutes: Fake account detection & cleanup
 * - teamDividendRoutes: Team dividend management
 * - maintenanceRoutes: System maintenance
 * 
 * Note: The main adminRoutes.js still contains additional routes
 * that haven't been migrated yet. This index.js provides the new
 * modular structure while maintaining backward compatibility.
 * 
 * Created: 2025-12-18
 * Updated: 2025-12-29
 */
import express from 'express';
import compression from 'compression';
import { authMiddleware } from '../../middleware/security.js';

// Import route modules
import authRoutes from './authRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import userRoutes from './userRoutes.js';
import depositRoutes from './depositRoutes.js';
import withdrawalRoutes from './withdrawalRoutes.js';
import maintenanceRoutes from './maintenanceRoutes.js';
import robotRoutes from './robotRoutes.js';
import fakeAccountRoutes from './fakeAccountRoutes.js';
import teamDividendRoutes from './teamDividendRoutes.js';

const router = express.Router();

// ==================== Middleware ====================

// Response compression
router.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type');
    return /json|text/.test(contentType);
  }
}));

// ==================== Public Routes (No Auth) ====================

// Authentication
router.use('/auth', authRoutes);

// Maintenance status (public)
router.get('/maintenance/status', (req, res, next) => {
  // Forward to maintenance routes for status check
  req.url = '/status';
  maintenanceRoutes(req, res, next);
});

// ==================== Protected Routes (Auth Required) ====================

// Dashboard
router.use('/dashboard', authMiddleware, dashboardRoutes);

// User management
router.use('/users', authMiddleware, userRoutes);

// Deposit records
router.use('/deposits', authMiddleware, depositRoutes);

// Withdrawal records
router.use('/withdrawals', authMiddleware, withdrawalRoutes);

// Maintenance management
router.use('/maintenance', authMiddleware, maintenanceRoutes);

// Robot management
router.use('/robots', authMiddleware, robotRoutes);

// Fake account management
router.use('/fake-accounts', authMiddleware, fakeAccountRoutes);

// Team dividend management
router.use('/team-dividend', authMiddleware, teamDividendRoutes);

// ==================== Health Check ====================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Admin API is running',
    timestamp: new Date().toISOString(),
    modules: [
      'auth', 'dashboard', 'users', 'deposits', 'withdrawals',
      'maintenance', 'robots', 'fake-accounts', 'team-dividend'
    ]
  });
});

export default router;
