/**
 * Admin System API Interface
 * 
 * Authentication: JWT Token (via Authorization Header)
 * Token stored in localStorage, no Cookie used
 * CSRF protection not needed (using JWT + Header auth)
 * 
 * Features:
 * - Automatic error logging
 * - Request performance tracking
 * - Detailed error reporting
 */
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { logApiError, logAuthError } from '../utils/errorLogger'

// Create axios instance
const request = axios.create({
  baseURL: '/api/admin',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor - Add JWT Token and tracking
request.interceptors.request.use(
  (config) => {
    // Get JWT Token from localStorage
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    
    // Add request timestamp for performance tracking
    config.metadata = { startTime: Date.now() }
    
    return config
  },
  error => {
    // Log request configuration errors
    logApiError({
      url: error.config?.url || 'unknown',
      method: error.config?.method?.toUpperCase() || 'UNKNOWN',
      status: 0,
      statusText: 'Request Config Error',
      responseData: null,
      requestData: null
    })
    
    return Promise.reject(error)
  }
)

// Response interceptor - Handle errors with detailed logging
request.interceptors.response.use(
  response => {
    // Calculate request duration
    const duration = response.config.metadata
      ? Date.now() - response.config.metadata.startTime
      : 0
    
    // Log slow requests (> 5 seconds)
    if (duration > 5000) {
      console.warn(`[AdminAPI] Slow request: ${response.config.method?.toUpperCase()} ${response.config.url} took ${duration}ms`)
    }
    
    return response.data
  },
  (error) => {
    const requestUrl = error.config?.url || ''
    const requestMethod = error.config?.method?.toUpperCase() || 'UNKNOWN'
    const status = error.response?.status || 0
    const statusText = error.response?.statusText || 'Unknown Error'
    const responseData = error.response?.data
    const message = responseData?.message || 'Request failed'
    
    // Log the API error
    logApiError({
      url: requestUrl,
      method: requestMethod,
      status,
      statusText,
      responseData,
      requestData: error.config?.data ? JSON.parse(error.config.data) : null
    })
    
    // 401 Unauthorized handling
    if (status === 401) {
      // Login API returns 401 for wrong password, don't redirect
      if (requestUrl.includes('/login')) {
        logAuthError({
          action: 'login',
          errorMessage: 'Invalid credentials',
          statusCode: 401
        })
        return Promise.reject(error)
      }
      
      // Other APIs return 401 for expired token
      logAuthError({
        action: 'token_expired',
        errorMessage: 'Token expired or invalid',
        statusCode: 401
      })
      
      localStorage.removeItem('admin_token')
      ElMessage.error('Session expired, please login again')
      window.location.href = '/admin/login'
      return Promise.reject(error)
    }
    
    // 403 Forbidden
    if (status === 403) {
      logAuthError({
        action: 'access_denied',
        errorMessage: 'Permission denied',
        statusCode: 403
      })
      ElMessage.error('Permission denied')
      return Promise.reject(error)
    }
    
    // 500+ Server errors
    if (status >= 500) {
      ElMessage.error('Server error, please try again later')
      return Promise.reject(error)
    }
    
    // Other errors (don't show for login API)
    if (!requestUrl.includes('/login')) {
      ElMessage.error(message)
    }
    
    return Promise.reject(error)
  }
)

// ==================== Authentication ====================

/**
 * Admin login
 */
export const login = (data) => {
  return request.post('/login', data)
}

/**
 * Get admin info
 */
export const getAdminInfo = () => {
  return request.get('/info')
}

// ==================== Dashboard Stats ====================

/**
 * Get dashboard statistics
 */
export const getDashboardStats = () => {
  return request.get('/dashboard/stats')
}

// ==================== User Management ====================

/**
 * Get user list
 */
export const getUsers = (params) => {
  return request.get('/users', { params })
}

/**
 * Get user details
 */
export const getUserDetail = (walletAddress) => {
  return request.get(`/users/${walletAddress}`)
}

/**
 * Update user balance
 */
export const updateUserBalance = (walletAddress, data) => {
  return request.put(`/users/${walletAddress}/balance`, data)
}

/**
 * Ban user
 */
export const banUser = (walletAddress, data) => {
  return request.post(`/users/${walletAddress}/ban`, data)
}

/**
 * Unban user
 */
export const unbanUser = (walletAddress) => {
  return request.post(`/users/${walletAddress}/unban`)
}

/**
 * Release frozen USDT to available USDT balance.
 * Backend: POST /api/admin/users/:wallet_address/release-frozen
 *
 * @param {string} walletAddress
 * @param {object} data - { amount?: number|string } (optional, default: release all)
 */
export const releaseFrozenUsdt = (walletAddress, data = {}) => {
  return request.post(`/users/${walletAddress}/release-frozen`, data)
}

/**
 * Diagnose user balance
 * Returns detailed balance calculation breakdown
 */
export const diagnoseUserBalance = (walletAddress) => {
  return request.get(`/users/${walletAddress}/diagnose`)
}

/**
 * Get user balance details
 * Returns all balance-affecting transactions
 */
export const getUserBalanceDetails = (walletAddress) => {
  return request.get(`/users/${walletAddress}/balance-details`)
}

// ==================== Deposit Records ====================

/**
 * Get deposit list
 */
export const getDeposits = (params) => {
  return request.get('/deposits', { params })
}

/**
 * Update deposit status
 */
export const updateDepositStatus = (id, status) => {
  return request.put(`/deposits/${id}/status`, { status })
}

// ==================== Withdrawal Records ====================

/**
 * Get withdrawal list
 */
export const getWithdrawals = (params) => {
  return request.get('/withdrawals', { params })
}

/**
 * Process withdrawal request
 */
export const processWithdrawal = (id, data) => {
  return request.put(`/withdrawals/${id}/process`, data)
}

/**
 * Auto transfer withdrawal
 */
export const autoTransferWithdrawal = (id, data) => {
  return request.post(`/withdrawals/${id}/auto-transfer`, data)
}

/**
 * Get platform wallet info
 */
export const getWalletInfo = () => {
  return request.get('/wallet-info')
}

/**
 * Get withdrawal transfer record
 */
export const getWithdrawalTransferRecord = (id) => {
  return request.get(`/withdrawals/${id}/transfer-record`)
}

// ==================== Robot Purchase Records ====================

/**
 * Get robot statistics
 */
export const getRobotStats = () => {
  return request.get('/robots/stats')
}

/**
 * Get robot purchase list
 */
export const getRobotPurchases = (params) => {
  return request.get('/robots', { params })
}

/**
 * Get robot purchase details
 */
export const getRobotDetail = (id) => {
  return request.get(`/robots/${id}`)
}

/**
 * Get all robots for a user
 */
export const getUserRobots = (walletAddress) => {
  return request.get(`/robots/user/${walletAddress}`)
}

/**
 * Get quantify logs
 */
export const getQuantifyLogs = (params) => {
  return request.get('/quantify-logs', { params })
}

/**
 * Get robot earnings summary
 */
export const getRobotEarningsSummary = () => {
  return request.get('/robots/earnings-summary')
}

/**
 * Cancel a single robot (close)
 * @param {number} id - Robot purchase ID
 * @param {object} data - { refund: boolean, reason: string }
 */
export const cancelRobotById = (id, data) => {
  return request.post(`/robots/${id}/cancel`, data)
}

/**
 * Batch cancel robots
 * @param {object} data - { ids: number[], refund: boolean, reason: string }
 */
export const batchCancelRobots = (data) => {
  return request.post('/robots/batch-cancel', data)
}

/**
 * Get cancelled robots list
 */
export const getCancelledRobots = (params) => {
  return request.get('/robots/cancelled', { params })
}

/**
 * Reactivate a cancelled robot
 * @param {number} id - Robot purchase ID
 */
export const reactivateRobot = (id) => {
  return request.post(`/robots/${id}/reactivate`)
}

// ==================== Announcements ====================

/**
 * Get announcement list
 */
export const getAnnouncements = (params) => {
  return request.get('/announcements', { params })
}

/**
 * Create announcement
 */
export const createAnnouncement = (data) => {
  return request.post('/announcements', data)
}

/**
 * Update announcement
 */
export const updateAnnouncement = (id, data) => {
  return request.put(`/announcements/${id}`, data)
}

/**
 * Delete announcement
 */
export const deleteAnnouncement = (id) => {
  return request.delete(`/announcements/${id}`)
}

// ==================== Referrals ====================

/**
 * Get referral list
 */
export const getReferrals = (params) => {
  return request.get('/referrals', { params })
}

// ==================== Documents ====================

/**
 * Get document configuration
 */
export const getDocuments = () => {
  return request.get('/documents')
}

// ==================== Wallet Security ====================

/**
 * Get wallet security password status
 */
export const getWalletSecurityStatus = () => {
  return request.get('/wallet-security/status')
}

/**
 * Initialize wallet security password
 */
export const initWalletSecurityPassword = (password) => {
  return request.post('/wallet-security/init', { password })
}

/**
 * Verify wallet security password
 */
export const verifyWalletSecurityPassword = (password) => {
  return request.post('/wallet-security/verify', { password })
}

/**
 * Change wallet security password
 */
export const changeWalletSecurityPassword = (oldPassword, newPassword) => {
  return request.post('/wallet-security/change', { oldPassword, newPassword })
}

/**
 * Save wallet configuration (requires security password)
 */
export const saveWalletConfig = (securityPassword, settings) => {
  return request.post('/wallet-config', { securityPassword, settings })
}

export default request
