/**
 * Admin Routes - Shared Utilities
 * 
 * Common imports, middleware, and helper functions
 * shared across all admin route modules
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query as dbQuery } from '../../../db.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { hashPassword, verifyPassword, sanitizeString, secureLog } from '../../security/index.js';
import { loginLimiter, authMiddleware } from '../../middleware/security.js';
import { getErrorStats, resolveError, resolveSimilarErrors } from '../../utils/errorLogger.js';
import { 
    getSecurityStats, 
    getBlockedIPsList, 
    bruteForceProtectionMiddleware,
    clearLoginAttempts,
    blockIP as securityBlockIP
} from '../../security/securityMiddleware.js';
import { getRecentAttacks, getAttackStats } from '../../security/attackLogger.js';
import { unblockIP, addToWhitelist, removeFromWhitelist } from '../../security/ipProtection.js';
import { transferUSDT, getAccountAddress, getAccountBalance } from '../../utils/bscTransferService.js';
import { MIN_ROBOT_PURCHASE } from '../../utils/teamMath.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JWT Secret configuration
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_jwt_secret_not_for_production' : null);
if (!JWT_SECRET) {
  console.error('❌ Error: JWT_SECRET environment variable is required in production');
  process.exit(1);
}

// Admin config file path
const ADMIN_CONFIG_FILE = path.join(__dirname, '../../data/admin_config.json');

// Avatar upload directory
const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
  fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
}

// Avatar upload configuration
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `admin_avatar_${uniqueSuffix}${ext}`);
  }
});

const avatarFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
  }
};

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Image storage factory
const imageStorageFactory = (destDir, prefix) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, destDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`);
    }
  });

// PDF file filter
const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

// Image file filter
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
  }
};

// Document file filter (PDF + Images)
const documentFileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files are allowed'), false);
  }
};

// Get admin users from config
const getAdminUsers = () => {
  try {
    if (!fs.existsSync(ADMIN_CONFIG_FILE)) {
      console.log('[Admin Config] Creating default config');
      const defaultConfig = { 
        admins: [{ 
          username: 'admin', 
          password: '$2b$12$defaultHashedPassword',
          role: 'super_admin',
          createdAt: new Date().toISOString()
        }] 
      };
      fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
      return defaultConfig.admins;
    }
    const configData = fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);
    return config.admins || [];
  } catch (error) {
    console.error('[Admin Config] Error reading:', error.message);
    return [];
  }
};

// Save admin users to config
const saveAdminUsers = (users) => {
  try {
    const config = { admins: users };
    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('[Admin Config] Error saving:', error.message);
    return false;
  }
};

// Export all utilities
export {
  dbQuery,
  jwt,
  multer,
  fs,
  path,
  __dirname,
  JWT_SECRET,
  ADMIN_CONFIG_FILE,
  AVATAR_UPLOAD_DIR,
  avatarUpload,
  avatarStorage,
  avatarFileFilter,
  imageStorageFactory,
  pdfFileFilter,
  imageFileFilter,
  documentFileFilter,
  hashPassword,
  verifyPassword,
  sanitizeString,
  secureLog,
  loginLimiter,
  authMiddleware,
  getErrorStats,
  resolveError,
  resolveSimilarErrors,
  getSecurityStats,
  getBlockedIPsList,
  bruteForceProtectionMiddleware,
  clearLoginAttempts,
  securityBlockIP,
  getRecentAttacks,
  getAttackStats,
  unblockIP,
  addToWhitelist,
  removeFromWhitelist,
  transferUSDT,
  getAccountAddress,
  getAccountBalance,
  MIN_ROBOT_PURCHASE,
  getAdminUsers,
  saveAdminUsers
};

