/**
 * System Maintenance Management Routes
 * 
 * Features:
 * - Get maintenance status (public API for frontend check)
 * - Update maintenance status (admin only)
 * - Update maintenance translations (admin only)
 * 
 * Created: 2025-12-28
 */
import express from 'express';
import pool from '../../config/database.js';

const router = express.Router();

// ==================== Public API (No Auth Required) ====================

/**
 * GET /api/admin/maintenance/status
 * Get current maintenance status
 * This is a public API that frontend can check without authentication
 */
router.get('/status', async (req, res) => {
  try {
    // Get maintenance status
    const [rows] = await pool.query(
      'SELECT is_enabled, title, message, estimated_duration, start_time, end_time FROM system_maintenance WHERE id = 1'
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          is_enabled: false,
          title: '',
          message: '',
          estimated_duration: 120
        }
      });
    }

    const maintenance = rows[0];

    // If maintenance is enabled, get translations
    let translations = {};
    if (maintenance.is_enabled) {
      const [transRows] = await pool.query(
        'SELECT language_code, title, message FROM maintenance_translations WHERE maintenance_id = 1'
      );
      
      transRows.forEach(row => {
        translations[row.language_code] = {
          title: row.title,
          message: row.message
        };
      });
    }

    res.json({
      success: true,
      data: {
        is_enabled: maintenance.is_enabled === 1,
        title: maintenance.title,
        message: maintenance.message,
        estimated_duration: maintenance.estimated_duration,
        start_time: maintenance.start_time,
        end_time: maintenance.end_time,
        translations
      }
    });
  } catch (error) {
    console.error('[Maintenance] Error getting status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get maintenance status'
    });
  }
});

// ==================== Admin API (Auth Required) ====================

/**
 * GET /api/admin/maintenance
 * Get full maintenance configuration (admin only)
 */
router.get('/', async (req, res) => {
  try {
    // Get maintenance status
    const [rows] = await pool.query(
      'SELECT * FROM system_maintenance WHERE id = 1'
    );

    // Get all translations
    const [transRows] = await pool.query(
      'SELECT * FROM maintenance_translations WHERE maintenance_id = 1 ORDER BY language_code'
    );

    const maintenance = rows.length > 0 ? rows[0] : {
      id: 1,
      is_enabled: false,
      title: 'System Maintenance',
      message: 'The system is currently under maintenance.',
      estimated_duration: 120
    };

    res.json({
      success: true,
      data: {
        ...maintenance,
        is_enabled: maintenance.is_enabled === 1,
        translations: transRows
      }
    });
  } catch (error) {
    console.error('[Maintenance] Error getting config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get maintenance configuration'
    });
  }
});

/**
 * PUT /api/admin/maintenance
 * Update maintenance status and settings (admin only)
 */
router.put('/', async (req, res) => {
  try {
    const { is_enabled, title, message, estimated_duration, translations } = req.body;
    const adminUsername = req.admin?.username || 'admin';

    // Calculate end time based on estimated duration
    const startTime = is_enabled ? new Date() : null;
    const endTime = is_enabled && estimated_duration 
      ? new Date(Date.now() + estimated_duration * 60 * 1000) 
      : null;

    // Update main maintenance record
    await pool.query(
      `INSERT INTO system_maintenance (id, is_enabled, title, message, estimated_duration, start_time, end_time, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         is_enabled = VALUES(is_enabled),
         title = VALUES(title),
         message = VALUES(message),
         estimated_duration = VALUES(estimated_duration),
         start_time = VALUES(start_time),
         end_time = VALUES(end_time),
         updated_by = VALUES(updated_by)`,
      [
        is_enabled ? 1 : 0,
        title || 'System Maintenance',
        message || 'The system is currently under maintenance.',
        estimated_duration || 120,
        startTime,
        endTime,
        adminUsername
      ]
    );

    // Update translations if provided
    if (translations && Array.isArray(translations)) {
      for (const trans of translations) {
        if (trans.language_code && trans.title && trans.message) {
          await pool.query(
            `INSERT INTO maintenance_translations (maintenance_id, language_code, title, message)
             VALUES (1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
               title = VALUES(title),
               message = VALUES(message)`,
            [trans.language_code, trans.title, trans.message]
          );
        }
      }
    }

    // Log the operation
    await pool.query(
      `INSERT INTO admin_operation_logs (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.admin?.id || 0,
        adminUsername,
        is_enabled ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
        'system_maintenance',
        JSON.stringify({ is_enabled, title, estimated_duration }),
        req.ip
      ]
    );

    console.log(`[Maintenance] ${is_enabled ? 'Enabled' : 'Disabled'} by ${adminUsername}`);

    res.json({
      success: true,
      message: is_enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled'
    });
  } catch (error) {
    console.error('[Maintenance] Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update maintenance status'
    });
  }
});

/**
 * PUT /api/admin/maintenance/translations
 * Update single translation (admin only)
 */
router.put('/translations', async (req, res) => {
  try {
    const { language_code, title, message } = req.body;

    if (!language_code || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Language code, title and message are required'
      });
    }

    await pool.query(
      `INSERT INTO maintenance_translations (maintenance_id, language_code, title, message)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         title = VALUES(title),
         message = VALUES(message)`,
      [language_code, title, message]
    );

    res.json({
      success: true,
      message: 'Translation updated successfully'
    });
  } catch (error) {
    console.error('[Maintenance] Error updating translation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update translation'
    });
  }
});

/**
 * POST /api/admin/maintenance/toggle
 * Quick toggle maintenance mode (admin only)
 */
router.post('/toggle', async (req, res) => {
  try {
    const adminUsername = req.admin?.username || 'admin';

    // Get current status
    const [rows] = await pool.query(
      'SELECT is_enabled, estimated_duration FROM system_maintenance WHERE id = 1'
    );

    const currentStatus = rows.length > 0 ? rows[0].is_enabled : 0;
    const newStatus = currentStatus === 1 ? 0 : 1;
    const estimatedDuration = rows.length > 0 ? rows[0].estimated_duration : 120;

    // Calculate times
    const startTime = newStatus ? new Date() : null;
    const endTime = newStatus 
      ? new Date(Date.now() + estimatedDuration * 60 * 1000) 
      : null;

    // Update status
    await pool.query(
      `UPDATE system_maintenance 
       SET is_enabled = ?, start_time = ?, end_time = ?, updated_by = ?
       WHERE id = 1`,
      [newStatus, startTime, endTime, adminUsername]
    );

    // Log the operation
    await pool.query(
      `INSERT INTO admin_operation_logs (admin_id, admin_username, operation_type, operation_target, operation_detail, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.admin?.id || 0,
        adminUsername,
        newStatus ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE',
        'system_maintenance',
        JSON.stringify({ toggled: true }),
        req.ip
      ]
    );

    console.log(`[Maintenance] Toggled to ${newStatus ? 'ON' : 'OFF'} by ${adminUsername}`);

    res.json({
      success: true,
      data: {
        is_enabled: newStatus === 1
      },
      message: newStatus ? 'Maintenance mode enabled' : 'Maintenance mode disabled'
    });
  } catch (error) {
    console.error('[Maintenance] Error toggling status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle maintenance status'
    });
  }
});

export default router;

