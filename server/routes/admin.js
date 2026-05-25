'use strict';

const express = require('express');
const router = express.Router();
const resetService = require('../services/resetService');
const db = require('../database');
const { getBroadcast } = require('../socket/broadcast');

/**
 * GET /api/admin/reset-info
 * Get reset confirmation info: current date and total queues count.
 * Used to display confirmation dialog before reset.
 *
 * Requirements: 7.1
 */
router.get('/reset-info', (req, res) => {
  try {
    const info = resetService.getResetInfo();
    return res.json({
      success: true,
      data: info
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Gagal mengambil informasi reset',
        details: {}
      }
    });
  }
});

/**
 * POST /api/admin/reset
 * Perform daily reset. Requires {confirm: true} in body.
 * Saves recap before clearing queue data (all-or-nothing transaction).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.5
 */
router.post('/reset', (req, res) => {
  const { confirm } = req.body;

  if (confirm !== true) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: 'Reset memerlukan konfirmasi. Kirim {confirm: true} untuk melanjutkan.',
        details: {}
      }
    });
  }

  try {
    const recap = resetService.performReset();

    // Emit queue:reset to all clients after successful reset
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast.emitQueueReset({
        date: recap.date,
        resetBy: 'admin'
      });
    }

    return res.json({
      success: true,
      data: recap
    });
  } catch (err) {
    if (err.message === 'RESET_FAILED') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'RESET_FAILED',
          message: 'Gagal melakukan reset antrian. Data antrian tidak berubah.',
          details: {}
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: 'RESET_FAILED',
        message: 'Gagal melakukan reset antrian. Data antrian tidak berubah.',
        details: {}
      }
    });
  }
});

/**
 * GET /api/admin/recaps
 * List all daily recaps, ordered by date descending.
 *
 * Requirements: 7.3, 7.4
 */
router.get('/recaps', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM daily_recaps ORDER BY date DESC
    `).all();

    const recaps = rows.map(row => ({
      id: row.id,
      date: row.date,
      summary: JSON.parse(row.summary),
      createdAt: row.created_at
    }));

    return res.json({
      success: true,
      data: recaps
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Gagal mengambil data rekap harian',
        details: {}
      }
    });
  }
});

module.exports = router;
