'use strict';

/**
 * Shared broadcast reference holder.
 * This module stores a reference to the Socket.IO broadcast functions
 * initialized in server/index.js, allowing route modules to access
 * them without circular dependencies.
 *
 * Requirements: 6.1, 3.2
 */

let _broadcast = null;

/**
 * Set the broadcast functions reference.
 * Called once from server/index.js after Socket.IO initialization.
 * @param {Object} broadcast - Object containing emit functions
 * @param {Function} broadcast.emitQueueUpdated
 * @param {Function} broadcast.emitQueueCalled
 * @param {Function} broadcast.emitQueueRecalled
 * @param {Function} broadcast.emitQueueReset
 */
function setBroadcast(broadcast) {
  _broadcast = broadcast;
}

/**
 * Get the broadcast functions reference.
 * @returns {Object|null} The broadcast functions or null if not yet initialized
 */
function getBroadcast() {
  return _broadcast;
}

module.exports = { setBroadcast, getBroadcast };
