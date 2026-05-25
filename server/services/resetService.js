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
 * Get reset information: current date and total active queues count.
 * Used to display confirmation dialog before reset.
 *
 * @returns {{date: string, totalQueues: number}}
 */
function getResetInfo() {
  const today = getToday();

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM queue_numbers WHERE date = ?
  `).get(today);

  return {
    date: today,
    totalQueues: result.count
  };
}

/**
 * Perform daily reset within a single transaction (all-or-nothing).
 * 1. Build per-type summary with total/served/unserved counts
 * 2. Save recap to daily_recaps table
 * 3. Delete all queue_numbers for current day
 * 4. Delete all daily_counters for current day
 *
 * If any step fails, the entire transaction is rolled back.
 *
 * @returns {Object} DailyRecap with id, date, summary, createdAt
 * @throws {Error} If reset fails (transaction is rolled back)
 */
function performReset() {
  const resetTransaction = db.transaction(() => {
    const today = getToday();

    // Build per-type summary
    const queueTypes = db.prepare(`SELECT * FROM queue_types`).all();
    const summary = {};

    for (const qt of queueTypes) {
      const total = db.prepare(`
        SELECT COUNT(*) as count FROM queue_numbers
        WHERE queue_type_id = ? AND date = ?
      `).get(qt.id, today);

      const served = db.prepare(`
        SELECT COUNT(*) as count FROM queue_numbers
        WHERE queue_type_id = ? AND date = ? AND status IN ('serving', 'done')
      `).get(qt.id, today);

      const unserved = db.prepare(`
        SELECT COUNT(*) as count FROM queue_numbers
        WHERE queue_type_id = ? AND date = ? AND status IN ('waiting', 'skipped')
      `).get(qt.id, today);

      // Only include types that had queues today
      if (total.count > 0) {
        summary[qt.id] = {
          name: qt.name,
          total: total.count,
          served: served.count,
          unserved: unserved.count
        };
      }
    }

    // Save recap to daily_recaps
    const summaryJson = JSON.stringify(summary);
    const insertResult = db.prepare(`
      INSERT INTO daily_recaps (date, summary) VALUES (?, ?)
    `).run(today, summaryJson);

    if (!insertResult.changes) {
      throw new Error('RESET_FAILED');
    }

    // Delete all queue_numbers for current day
    db.prepare(`DELETE FROM queue_numbers WHERE date = ?`).run(today);

    // Delete all daily_counters for current day
    db.prepare(`DELETE FROM daily_counters WHERE date = ?`).run(today);

    // Retrieve the saved recap
    const recap = db.prepare(`SELECT * FROM daily_recaps WHERE id = ?`).get(insertResult.lastInsertRowid);

    return {
      id: recap.id,
      date: recap.date,
      summary: JSON.parse(recap.summary),
      createdAt: recap.created_at
    };
  });

  return resetTransaction();
}

module.exports = {
  getToday,
  getResetInfo,
  performReset
};
