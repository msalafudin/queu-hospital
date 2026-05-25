'use strict';

const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService');
const { getBroadcast } = require('../socket/broadcast');
const printerService = require('../services/printerService');

/**
 * Map known service error messages to HTTP status codes.
 */
const ERROR_STATUS_MAP = {
  QUEUE_TYPE_NOT_FOUND: 404,
  QUEUE_EMPTY: 404,
  NO_ACTIVE_SERVING: 404,
  VALIDATION_ERROR: 400
};

/**
 * Build a standardized success response.
 * @param {*} data - Response payload
 * @returns {Object}
 */
function successResponse(data) {
  return {
    success: true,
    data
  };
}

/**
 * Build a standardized error response.
 * @param {string} code - Machine-readable error code
 * @param {string} message - Human-readable message
 * @param {Object} [details] - Optional additional context
 * @returns {Object}
 */
function errorResponse(code, message, details = {}) {
  return {
    success: false,
    error: {
      code,
      message,
      details
    }
  };
}

/**
 * POST /api/queue/take
 * Take a new queue number for the specified queue type.
 * Body: { queueTypeId }
 */
router.post('/take', async (req, res) => {
  try {
    const { queueTypeId } = req.body;

    // Validate input
    if (queueTypeId === undefined || queueTypeId === null) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'queueTypeId is required', { field: 'queueTypeId' })
      );
    }

    const parsedId = Number(queueTypeId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'queueTypeId must be a positive integer', { field: 'queueTypeId' })
      );
    }

    const result = queueService.takeNumber(parsedId);

    // Emit queue:updated to all clients after successful take
    const broadcast = getBroadcast();
    if (broadcast) {
      const waitingCount = queueService.getWaitingCount(parsedId);
      const state = queueService.getQueueState();
      broadcast.emitQueueUpdated({
        queueTypeId: parsedId,
        waitingCount,
        totalToday: state.totalToday
      });
    }

    // Attempt to print ticket (non-blocking for queue number creation)
    let printer = { status: 'success' };
    try {
      const printerStatus = await printerService.checkPrinterStatus();
      if (!printerStatus.connected) {
        printer = {
          status: 'offline',
          message: 'Printer tidak terhubung. Tiket tidak dapat dicetak.',
          canReprint: true,
          reprintId: result.id
        };
      } else {
        const printResult = await printerService.printTicket({
          number: result.number,
          queueType: result.queueType,
          timestamp: result.timestamp,
          waitingAhead: result.waitingAhead
        });

        if (!printResult.success) {
          printer = {
            status: 'error',
            message: printResult.error || 'Gagal mencetak tiket.',
            canReprint: true,
            reprintId: result.id
          };
        }
      }
    } catch (printError) {
      printer = {
        status: 'error',
        message: `Gagal mencetak tiket: ${printError.message}`,
        canReprint: true,
        reprintId: result.id
      };
    }

    return res.status(201).json(successResponse({ ...result, printer }));
  } catch (error) {
    const code = error.message;
    const status = ERROR_STATUS_MAP[code] || 500;
    const message = getErrorMessage(code);
    return res.status(status).json(errorResponse(code, message));
  }
});

/**
 * POST /api/queue/reprint/:id
 * Reprint a ticket for the specified queue number.
 * Params: id - queue number ID
 */
router.post('/reprint/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const parsedId = Number(id);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'id must be a positive integer', { field: 'id' })
      );
    }

    const printResult = await printerService.reprintTicket(parsedId);

    if (!printResult.success) {
      return res.status(200).json(successResponse({
        printed: false,
        error: printResult.error
      }));
    }

    return res.status(200).json(successResponse({ printed: true }));
  } catch (error) {
    return res.status(500).json(
      errorResponse('PRINTER_ERROR', `Gagal mencetak ulang tiket: ${error.message}`)
    );
  }
});

/**
 * POST /api/queue/call-next
 * Call the next waiting queue number for the given queue type and loket.
 * Body: { queueTypeId, loketId }
 */
router.post('/call-next', (req, res) => {
  try {
    const { queueTypeId, loketId } = req.body;

    // Validate input
    if (queueTypeId === undefined || queueTypeId === null) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'queueTypeId is required', { field: 'queueTypeId' })
      );
    }

    if (loketId === undefined || loketId === null) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'loketId is required', { field: 'loketId' })
      );
    }

    const parsedQueueTypeId = Number(queueTypeId);
    if (!Number.isInteger(parsedQueueTypeId) || parsedQueueTypeId <= 0) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'queueTypeId must be a positive integer', { field: 'queueTypeId' })
      );
    }

    const parsedLoketId = Number(loketId);
    if (!Number.isInteger(parsedLoketId) || parsedLoketId <= 0) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'loketId must be a positive integer', { field: 'loketId' })
      );
    }

    const result = queueService.callNext(parsedQueueTypeId, parsedLoketId);

    if (!result) {
      return res.status(404).json(
        errorResponse('QUEUE_EMPTY', 'Tidak ada antrian menunggu untuk tipe antrian ini', { queueTypeId: parsedQueueTypeId })
      );
    }

    // Emit queue:called to filtered displays and queue:updated to all clients
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast.emitQueueCalled({
        number: result.number,
        queueTypeId: result.queueTypeId,
        queueTypeName: result.queueTypeName,
        loketId: result.loketId,
        loketName: result.loketName,
        timestamp: result.calledAt
      });

      const waitingCount = queueService.getWaitingCount(parsedQueueTypeId);
      const state = queueService.getQueueState();
      broadcast.emitQueueUpdated({
        queueTypeId: parsedQueueTypeId,
        waitingCount,
        totalToday: state.totalToday
      });
    }

    return res.status(200).json(successResponse(result));
  } catch (error) {
    const code = error.message;
    const status = ERROR_STATUS_MAP[code] || 500;
    const message = getErrorMessage(code);
    return res.status(status).json(errorResponse(code, message));
  }
});

/**
 * POST /api/queue/recall
 * Recall the currently serving queue number for a given loket.
 * Body: { loketId }
 */
router.post('/recall', (req, res) => {
  try {
    const { loketId } = req.body;

    // Validate input
    if (loketId === undefined || loketId === null) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'loketId is required', { field: 'loketId' })
      );
    }

    const parsedLoketId = Number(loketId);
    if (!Number.isInteger(parsedLoketId) || parsedLoketId <= 0) {
      return res.status(400).json(
        errorResponse('VALIDATION_ERROR', 'loketId must be a positive integer', { field: 'loketId' })
      );
    }

    const result = queueService.recallCurrent(parsedLoketId);

    if (!result) {
      return res.status(404).json(
        errorResponse('NO_ACTIVE_SERVING', 'Tidak ada antrian yang sedang dilayani pada loket ini', { loketId: parsedLoketId })
      );
    }

    // Emit queue:recalled to filtered displays
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast.emitQueueRecalled({
        number: result.number,
        queueTypeId: result.queueTypeId,
        queueTypeName: result.queueTypeName,
        loketId: result.loketId,
        loketName: result.loketName,
        timestamp: result.calledAt
      });
    }

    return res.status(200).json(successResponse(result));
  } catch (error) {
    const code = error.message;
    const status = ERROR_STATUS_MAP[code] || 500;
    const message = getErrorMessage(code);
    return res.status(status).json(errorResponse(code, message));
  }
});

/**
 * GET /api/queue/state
 * Get the full queue state: all serving queues and waiting counts per type.
 */
router.get('/state', (req, res) => {
  try {
    const state = queueService.getQueueState();
    return res.status(200).json(successResponse(state));
  } catch (error) {
    return res.status(500).json(
      errorResponse('INTERNAL_ERROR', 'Gagal mengambil status antrian')
    );
  }
});

/**
 * GET /api/queue/waiting-count
 * Get waiting counts per queue type.
 */
router.get('/waiting-count', (req, res) => {
  try {
    const state = queueService.getQueueState();
    return res.status(200).json(successResponse(state.waitingCounts));
  } catch (error) {
    return res.status(500).json(
      errorResponse('INTERNAL_ERROR', 'Gagal mengambil jumlah antrian menunggu')
    );
  }
});

/**
 * Map error codes to human-readable messages.
 * @param {string} code
 * @returns {string}
 */
function getErrorMessage(code) {
  const messages = {
    QUEUE_TYPE_NOT_FOUND: 'Tipe antrian tidak ditemukan atau tidak aktif',
    QUEUE_EMPTY: 'Tidak ada antrian menunggu untuk tipe antrian ini',
    NO_ACTIVE_SERVING: 'Tidak ada antrian yang sedang dilayani',
    VALIDATION_ERROR: 'Input tidak valid'
  };
  return messages[code] || 'Terjadi kesalahan internal server';
}

module.exports = router;
