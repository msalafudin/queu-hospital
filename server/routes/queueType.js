'use strict';

const express = require('express');
const router = express.Router();
const queueTypeService = require('../services/queueTypeService');

/**
 * Map service error codes to HTTP status codes.
 * @param {string} code - Error code from service layer
 * @returns {number} HTTP status code
 */
function getHttpStatus(code) {
  switch (code) {
    case 'VALIDATION_ERROR':
    case 'PREFIX_DUPLICATE':
    case 'QUEUE_TYPE_HAS_ACTIVE':
      return 400;
    case 'QUEUE_TYPE_NOT_FOUND':
      return 404;
    case 'CANNOT_DELETE_DEFAULT':
      return 403;
    default:
      return 500;
  }
}

/**
 * Build a consistent error response object.
 * @param {string} code - Machine-readable error code
 * @param {string} message - Human-readable error message
 * @param {Object} [details] - Optional additional context
 * @returns {Object} Error response body
 */
function errorResponse(code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message
    }
  };
  if (details) {
    response.error.details = details;
  }
  return response;
}

/**
 * Build a consistent success response object.
 * @param {*} data - Response data
 * @returns {Object} Success response body
 */
function successResponse(data) {
  return {
    success: true,
    data
  };
}

/**
 * GET /api/queue-types
 * List all queue types (active and inactive).
 */
router.get('/', (req, res) => {
  try {
    const queueTypes = queueTypeService.getAll();
    res.json(successResponse(queueTypes));
  } catch (err) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = getHttpStatus(code);
    res.status(status).json(errorResponse(code, err.message, err.details));
  }
});

/**
 * GET /api/queue-types/active
 * List only active queue types.
 */
router.get('/active', (req, res) => {
  try {
    const queueTypes = queueTypeService.getActive();
    res.json(successResponse(queueTypes));
  } catch (err) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = getHttpStatus(code);
    res.status(status).json(errorResponse(code, err.message, err.details));
  }
});

/**
 * POST /api/queue-types
 * Create a new queue type.
 * Body: { name: string, prefix: string }
 */
router.post('/', (req, res) => {
  try {
    const { name, prefix } = req.body;

    if (!name || !prefix) {
      return res.status(400).json(errorResponse(
        'VALIDATION_ERROR',
        'Field name dan prefix wajib diisi',
        { errors: ['Field name dan prefix wajib diisi'] }
      ));
    }

    const queueType = queueTypeService.create(name, prefix);
    res.status(201).json(successResponse(queueType));
  } catch (err) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = getHttpStatus(code);
    res.status(status).json(errorResponse(code, err.message, err.details));
  }
});

/**
 * PUT /api/queue-types/:id
 * Update an existing queue type.
 * Body: { name: string, prefix: string }
 */
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse(
        'VALIDATION_ERROR',
        'ID tipe antrian tidak valid'
      ));
    }

    const { name, prefix } = req.body;

    if (!name || !prefix) {
      return res.status(400).json(errorResponse(
        'VALIDATION_ERROR',
        'Field name dan prefix wajib diisi',
        { errors: ['Field name dan prefix wajib diisi'] }
      ));
    }

    const queueType = queueTypeService.update(id, name, prefix);
    res.json(successResponse(queueType));
  } catch (err) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = getHttpStatus(code);
    res.status(status).json(errorResponse(code, err.message, err.details));
  }
});

/**
 * PATCH /api/queue-types/:id/activate
 * Activate a queue type.
 */
router.patch('/:id/activate', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse(
        'VALIDATION_ERROR',
        'ID tipe antrian tidak valid'
      ));
    }

    queueTypeService.activate(id);
    res.json(successResponse({ id, isActive: true }));
  } catch (err) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = getHttpStatus(code);
    res.status(status).json(errorResponse(code, err.message, err.details));
  }
});

/**
 * PATCH /api/queue-types/:id/deactivate
 * Deactivate a queue type.
 * Rejects if the queue type has active queues (waiting/serving) on the current day.
 */
router.patch('/:id/deactivate', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(errorResponse(
        'VALIDATION_ERROR',
        'ID tipe antrian tidak valid'
      ));
    }

    queueTypeService.deactivate(id);
    res.json(successResponse({ id, isActive: false }));
  } catch (err) {
    const code = err.code || 'INTERNAL_ERROR';
    const status = getHttpStatus(code);
    res.status(status).json(errorResponse(code, err.message, err.details));
  }
});

module.exports = router;
