'use strict';

/**
 * Socket.IO event handler for the hospital queue system.
 * Manages display client registration with loket filters and
 * provides broadcast functions for queue events.
 *
 * Requirements: 6.1, 6.2, 3.2, 3.10, 3.11
 */

// Map of socket.id -> { loketIds: number[] }
// Stores display client filters for targeted event emission
const displayClients = new Map();

/**
 * Initialize Socket.IO connection handler and return broadcast functions.
 * @param {import('socket.io').Server} io - Socket.IO server instance
 * @returns {Object} Broadcast functions for queue events
 */
function initializeSocket(io) {
  io.on('connection', (socket) => {
    // Handle display client registration with loket filter
    socket.on('display:register', (data) => {
      const loketIds = Array.isArray(data?.loketIds) ? data.loketIds : [];
      displayClients.set(socket.id, { loketIds });
    });

    // Clean up on disconnect
    socket.on('disconnect', () => {
      displayClients.delete(socket.id);
    });
  });

  /**
   * Broadcast queue:updated to all connected clients.
   * @param {{ queueTypeId: number, waitingCount: number, totalToday: number }} payload
   */
  function emitQueueUpdated(payload) {
    io.emit('queue:updated', payload);
  }

  /**
   * Emit queue:called to display clients whose filter includes the loketId
   * (or whose filter is empty, meaning show all).
   * @param {{ number: string, queueTypeId: number, queueTypeName: string, loketId: number, loketName: string, timestamp: string }} payload
   */
  function emitQueueCalled(payload) {
    const { loketId } = payload;

    for (const [socketId, client] of displayClients.entries()) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        // Socket no longer connected, clean up
        displayClients.delete(socketId);
        continue;
      }

      // Emit if filter is empty (show all) or filter includes this loketId
      if (client.loketIds.length === 0 || client.loketIds.includes(loketId)) {
        socket.emit('queue:called', payload);
      }
    }
  }

  /**
   * Emit queue:recalled to display clients whose filter includes the loketId
   * (or whose filter is empty, meaning show all).
   * @param {{ number: string, queueTypeId: number, queueTypeName: string, loketId: number, loketName: string, timestamp: string }} payload
   */
  function emitQueueRecalled(payload) {
    const { loketId } = payload;

    for (const [socketId, client] of displayClients.entries()) {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        // Socket no longer connected, clean up
        displayClients.delete(socketId);
        continue;
      }

      // Emit if filter is empty (show all) or filter includes this loketId
      if (client.loketIds.length === 0 || client.loketIds.includes(loketId)) {
        socket.emit('queue:recalled', payload);
      }
    }
  }

  /**
   * Broadcast queue:reset to all connected clients.
   * @param {{ date: string, resetBy: string }} payload
   */
  function emitQueueReset(payload) {
    io.emit('queue:reset', payload);
  }

  return {
    emitQueueUpdated,
    emitQueueCalled,
    emitQueueRecalled,
    emitQueueReset
  };
}

module.exports = { initializeSocket, displayClients };
