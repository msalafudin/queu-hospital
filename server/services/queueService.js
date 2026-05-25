'use strict';

const db = require('../database');

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
 * Get the count of waiting queue numbers for a specific queue type on the current day.
 * @param {number} queueTypeId
 * @returns {number}
 */
function getWaitingCount(queueTypeId) {
  const today = getToday();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM queue_numbers
    WHERE queue_type_id = ? AND date = ? AND status = 'waiting'
  `).get(queueTypeId, today);
  return result.count;
}

/**
 * Take a new queue number for the specified queue type.
 * Uses an atomic counter with transaction to guarantee unique sequential numbers.
 *
 * @param {number} queueTypeId - The ID of the queue type to take a number for
 * @returns {Object} Queue number info including number, type, timestamp, and waiting count
 * @throws {Error} If queue type is not found or not active
 */
function takeNumber(queueTypeId) {
  const takeNumberTransaction = db.transaction(() => {
    const today = getToday();

    // Verify queue type exists and is active
    const queueType = db.prepare(`
      SELECT * FROM queue_types WHERE id = ? AND is_active = 1
    `).get(queueTypeId);

    if (!queueType) {
      throw new Error('QUEUE_TYPE_NOT_FOUND');
    }

    // Atomic increment counter using INSERT ON CONFLICT DO UPDATE
    db.prepare(`
      INSERT INTO daily_counters (queue_type_id, date, last_number)
      VALUES (?, ?, 1)
      ON CONFLICT(queue_type_id, date)
      DO UPDATE SET last_number = last_number + 1
    `).run(queueTypeId, today);

    // Get the new counter value
    const counter = db.prepare(`
      SELECT last_number FROM daily_counters
      WHERE queue_type_id = ? AND date = ?
    `).get(queueTypeId, today);

    // Generate queue number format: PREFIX-NNN (3-digit zero-padded)
    const number = `${queueType.prefix}-${String(counter.last_number).padStart(3, '0')}`;

    // Insert into queue_numbers with status 'waiting'
    const result = db.prepare(`
      INSERT INTO queue_numbers (number, sequence, queue_type_id, date)
      VALUES (?, ?, ?, ?)
    `).run(number, counter.last_number, queueTypeId, today);

    // Count how many are waiting ahead (excluding the one just inserted)
    const waitingAhead = db.prepare(`
      SELECT COUNT(*) as count FROM queue_numbers
      WHERE queue_type_id = ? AND date = ? AND status = 'waiting' AND id < ?
    `).get(queueTypeId, today, result.lastInsertRowid);

    return {
      id: result.lastInsertRowid,
      number,
      sequence: counter.last_number,
      queueType: {
        id: queueType.id,
        name: queueType.name,
        prefix: queueType.prefix
      },
      timestamp: new Date().toISOString(),
      waitingAhead: waitingAhead.count
    };
  });

  return takeNumberTransaction();
}

/**
 * Call the next waiting queue number for the given queue type and assign it to a loket.
 * Updates status to 'serving', sets loket_id and called_at.
 *
 * @param {number} queueTypeId - The queue type to call from
 * @param {number} loketId - The loket that is calling
 * @returns {Object|null} The called queue number data, or null if no waiting queue
 */
function callNext(queueTypeId, loketId) {
  const callNextTransaction = db.transaction(() => {
    const today = getToday();

    // Find the earliest waiting queue number for this type today
    const nextQueue = db.prepare(`
      SELECT * FROM queue_numbers
      WHERE queue_type_id = ? AND date = ? AND status = 'waiting'
      ORDER BY sequence ASC
      LIMIT 1
    `).get(queueTypeId, today);

    if (!nextQueue) {
      return null;
    }

    // Update status to 'serving', set loket_id and called_at
    const calledAt = new Date().toISOString();
    db.prepare(`
      UPDATE queue_numbers
      SET status = 'serving', loket_id = ?, called_at = ?
      WHERE id = ?
    `).run(loketId, calledAt, nextQueue.id);

    // Get loket name
    const loket = db.prepare(`SELECT * FROM lokets WHERE id = ?`).get(loketId);

    // Get queue type name
    const queueType = db.prepare(`SELECT * FROM queue_types WHERE id = ?`).get(queueTypeId);

    return {
      id: nextQueue.id,
      number: nextQueue.number,
      sequence: nextQueue.sequence,
      queueTypeId: queueType.id,
      queueTypeName: queueType.name,
      loketId: loket ? loket.id : loketId,
      loketName: loket ? loket.name : `Loket ${loketId}`,
      calledAt
    };
  });

  return callNextTransaction();
}

/**
 * Recall the currently serving queue number for a given loket.
 * Returns the data for re-announcement without changing any state.
 *
 * @param {number} loketId - The loket to recall for
 * @returns {Object|null} The currently serving queue data, or null if none
 */
function recallCurrent(loketId) {
  const today = getToday();

  // Find the currently serving queue number for this loket today
  const currentQueue = db.prepare(`
    SELECT qn.*, qt.name as queue_type_name, qt.prefix as queue_type_prefix,
           l.name as loket_name
    FROM queue_numbers qn
    JOIN queue_types qt ON qn.queue_type_id = qt.id
    LEFT JOIN lokets l ON qn.loket_id = l.id
    WHERE qn.loket_id = ? AND qn.date = ? AND qn.status = 'serving'
    ORDER BY qn.called_at DESC
    LIMIT 1
  `).get(loketId, today);

  if (!currentQueue) {
    return null;
  }

  return {
    id: currentQueue.id,
    number: currentQueue.number,
    sequence: currentQueue.sequence,
    queueTypeId: currentQueue.queue_type_id,
    queueTypeName: currentQueue.queue_type_name,
    loketId: currentQueue.loket_id,
    loketName: currentQueue.loket_name || `Loket ${loketId}`,
    calledAt: currentQueue.called_at
  };
}

/**
 * Get currently serving queue numbers.
 * If loketId is provided, returns only the serving queue for that loket.
 * If no loketId, returns all currently serving queues.
 *
 * @param {number} [loketId] - Optional loket ID to filter by
 * @returns {Array} Array of currently serving queue numbers
 */
function getCurrentServing(loketId) {
  const today = getToday();

  let query = `
    SELECT qn.*, qt.name as queue_type_name, qt.prefix as queue_type_prefix,
           l.name as loket_name
    FROM queue_numbers qn
    JOIN queue_types qt ON qn.queue_type_id = qt.id
    LEFT JOIN lokets l ON qn.loket_id = l.id
    WHERE qn.date = ? AND qn.status = 'serving'
  `;
  const params = [today];

  if (loketId !== undefined && loketId !== null) {
    query += ` AND qn.loket_id = ?`;
    params.push(loketId);
  }

  query += ` ORDER BY qn.called_at DESC`;

  const rows = db.prepare(query).all(...params);

  return rows.map(row => ({
    id: row.id,
    number: row.number,
    sequence: row.sequence,
    queueTypeId: row.queue_type_id,
    queueTypeName: row.queue_type_name,
    loketId: row.loket_id,
    loketName: row.loket_name || `Loket ${row.loket_id}`,
    calledAt: row.called_at
  }));
}

/**
 * Get the comprehensive queue state: all serving queues and waiting counts per type.
 *
 * @returns {Object} QueueState with serving queues and waiting counts
 */
function getQueueState() {
  const today = getToday();

  // Get all currently serving queues
  const serving = getCurrentServing();

  // Get waiting counts per queue type
  const queueTypes = db.prepare(`SELECT * FROM queue_types WHERE is_active = 1`).all();
  const waitingCounts = {};
  for (const qt of queueTypes) {
    waitingCounts[qt.id] = {
      queueTypeId: qt.id,
      queueTypeName: qt.name,
      prefix: qt.prefix,
      count: getWaitingCount(qt.id)
    };
  }

  // Get total counts for today
  const totalToday = db.prepare(`
    SELECT COUNT(*) as count FROM queue_numbers WHERE date = ?
  `).get(today);

  return {
    serving,
    waitingCounts,
    totalToday: totalToday.count
  };
}

module.exports = {
  getToday,
  getWaitingCount,
  takeNumber,
  callNext,
  recallCurrent,
  getCurrentServing,
  getQueueState
};
