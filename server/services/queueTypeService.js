'use strict';

const db = require('../database');

/**
 * Queue Type Service
 * 
 * Handles CRUD operations and validation for queue types (Tipe Antrian).
 * Manages the lifecycle of queue types including creation, updates,
 * activation/deactivation with business rule enforcement.
 */

/**
 * Get today's date in YYYY-MM-DD format (local time).
 * @returns {string}
 */
function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Map a database row to a QueueType object.
 * @param {Object} row - Database row
 * @returns {Object} QueueType object
 */
function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    isActive: row.is_active === 1,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Get all queue types (active and inactive).
 * @returns {Object[]} Array of QueueType objects
 */
function getAll() {
  const rows = db.prepare('SELECT * FROM queue_types ORDER BY id ASC').all();
  return rows.map(mapRow);
}

/**
 * Get only active queue types.
 * @returns {Object[]} Array of active QueueType objects
 */
function getActive() {
  const rows = db.prepare('SELECT * FROM queue_types WHERE is_active = 1 ORDER BY id ASC').all();
  return rows.map(mapRow);
}

/**
 * Validate queue type input (name and prefix).
 * @param {string} name - Queue type name (1-50 chars)
 * @param {string} prefix - Queue type prefix (1-3 uppercase alpha chars, unique)
 * @param {number|null} excludeId - ID to exclude from uniqueness check (for updates)
 * @returns {Object} ValidationResult { valid: boolean, errors: string[] }
 */
function validate(name, prefix, excludeId = null) {
  const errors = [];

  // Validate name: must be 1-50 characters
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Nama tipe antrian tidak boleh kosong');
  } else if (name.trim().length > 50) {
    errors.push('Nama tipe antrian maksimal 50 karakter');
  }

  // Validate prefix: must be 1-3 uppercase alpha characters
  if (!prefix || typeof prefix !== 'string' || prefix.length === 0) {
    errors.push('Kode prefix tidak boleh kosong');
  } else if (prefix.length > 3) {
    errors.push('Kode prefix maksimal 3 karakter');
  } else if (!/^[A-Z]+$/.test(prefix)) {
    errors.push('Kode prefix harus berupa huruf kapital (A-Z)');
  } else {
    // Check prefix uniqueness
    let query = 'SELECT id FROM queue_types WHERE prefix = ?';
    const params = [prefix];

    if (excludeId !== null && excludeId !== undefined) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const existing = db.prepare(query).get(...params);
    if (existing) {
      errors.push('Kode prefix sudah digunakan oleh tipe antrian lain');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create a new queue type.
 * @param {string} name - Queue type name
 * @param {string} prefix - Queue type prefix (1-3 uppercase alpha, unique)
 * @returns {Object} Created QueueType object
 * @throws {Error} If validation fails
 */
function create(name, prefix) {
  const trimmedName = name ? name.trim() : '';
  const upperPrefix = prefix ? prefix.toUpperCase().trim() : '';

  const validation = validate(trimmedName, upperPrefix);
  if (!validation.valid) {
    const error = new Error(validation.errors[0]);
    error.code = validation.errors[0].includes('prefix sudah digunakan')
      ? 'PREFIX_DUPLICATE'
      : 'VALIDATION_ERROR';
    error.details = { errors: validation.errors };
    throw error;
  }

  const result = db.prepare(`
    INSERT INTO queue_types (name, prefix, is_active, is_default)
    VALUES (?, ?, 1, 0)
  `).run(trimmedName, upperPrefix);

  const row = db.prepare('SELECT * FROM queue_types WHERE id = ?').get(result.lastInsertRowid);
  return mapRow(row);
}

/**
 * Update an existing queue type.
 * @param {number} id - Queue type ID
 * @param {string} name - New name
 * @param {string} prefix - New prefix
 * @returns {Object} Updated QueueType object
 * @throws {Error} If queue type not found or validation fails
 */
function update(id, name, prefix) {
  const existing = db.prepare('SELECT * FROM queue_types WHERE id = ?').get(id);
  if (!existing) {
    const error = new Error('Tipe antrian tidak ditemukan');
    error.code = 'QUEUE_TYPE_NOT_FOUND';
    throw error;
  }

  const trimmedName = name ? name.trim() : '';
  const upperPrefix = prefix ? prefix.toUpperCase().trim() : '';

  const validation = validate(trimmedName, upperPrefix, id);
  if (!validation.valid) {
    const error = new Error(validation.errors[0]);
    error.code = validation.errors[0].includes('prefix sudah digunakan')
      ? 'PREFIX_DUPLICATE'
      : 'VALIDATION_ERROR';
    error.details = { errors: validation.errors };
    throw error;
  }

  db.prepare(`
    UPDATE queue_types
    SET name = ?, prefix = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(trimmedName, upperPrefix, id);

  const row = db.prepare('SELECT * FROM queue_types WHERE id = ?').get(id);
  return mapRow(row);
}

/**
 * Deactivate a queue type.
 * Rejects deactivation if the queue type has active queues (waiting/serving) on the current day.
 * @param {number} id - Queue type ID
 * @throws {Error} If queue type not found or has active queues
 */
function deactivate(id) {
  const existing = db.prepare('SELECT * FROM queue_types WHERE id = ?').get(id);
  if (!existing) {
    const error = new Error('Tipe antrian tidak ditemukan');
    error.code = 'QUEUE_TYPE_NOT_FOUND';
    throw error;
  }

  // Check for active queues (waiting or serving) on current day
  const today = getToday();
  const activeCount = db.prepare(`
    SELECT COUNT(*) as count FROM queue_numbers
    WHERE queue_type_id = ? AND date = ? AND status IN ('waiting', 'serving')
  `).get(id, today);

  if (activeCount.count > 0) {
    const error = new Error(
      `Tidak dapat menonaktifkan tipe antrian yang masih memiliki ${activeCount.count} antrian aktif`
    );
    error.code = 'QUEUE_TYPE_HAS_ACTIVE';
    error.details = { activeCount: activeCount.count, queueTypeId: id };
    throw error;
  }

  db.prepare(`
    UPDATE queue_types
    SET is_active = 0, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(id);
}

/**
 * Activate a queue type.
 * @param {number} id - Queue type ID
 * @throws {Error} If queue type not found
 */
function activate(id) {
  const existing = db.prepare('SELECT * FROM queue_types WHERE id = ?').get(id);
  if (!existing) {
    const error = new Error('Tipe antrian tidak ditemukan');
    error.code = 'QUEUE_TYPE_NOT_FOUND';
    throw error;
  }

  db.prepare(`
    UPDATE queue_types
    SET is_active = 1, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(id);
}

module.exports = {
  getAll,
  getActive,
  create,
  update,
  deactivate,
  activate,
  validate
};
