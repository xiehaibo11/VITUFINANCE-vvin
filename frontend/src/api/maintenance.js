/**
 * Maintenance API
 * API for checking system maintenance status
 * 
 * Created: 2025-12-28
 */
import axios from 'axios'

// Create axios instance for maintenance check
const maintenanceApi = axios.create({
  baseURL: '/api/admin',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * Check maintenance status
 * This is a public API that doesn't require authentication
 * @returns {Promise<Object>} Maintenance status data
 */
export const checkMaintenanceStatus = async () => {
  try {
    const response = await maintenanceApi.get('/maintenance/status')
    return response.data
  } catch (error) {
    console.error('[Maintenance] Failed to check status:', error)
    // Return safe default (not in maintenance) if check fails
    return {
      success: true,
      data: {
        is_enabled: false,
        title: '',
        message: '',
        estimated_duration: 120,
        translations: {}
      }
    }
  }
}

export default {
  checkMaintenanceStatus
}

