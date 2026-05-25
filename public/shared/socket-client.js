/**
 * Socket.IO Client Wrapper - Sistem Antrian RSI Muhammadiyah 2 Kendal
 * 
 * Reconnection Strategy:
 *   Phase 1: 3s interval, max 10 attempts (30s total)
 *   Phase 2: 10s interval, indefinite attempts
 * 
 * On disconnect: shows connection lost indicator, preserves last known data
 * On reconnect: requests full state sync, hides indicator
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6
 */
(function (global) {
  'use strict';

  // --- Connection Indicator UI ---

  var indicatorEl = null;

  function createIndicator() {
    if (indicatorEl) return;
    indicatorEl = document.createElement('div');
    indicatorEl.id = 'connection-lost-indicator';
    indicatorEl.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'z-index: 99999',
      'background: #dc3545',
      'color: #fff',
      'text-align: center',
      'padding: 10px 16px',
      'font-family: sans-serif',
      'font-size: 14px',
      'font-weight: 600',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.2)',
      'display: none'
    ].join(';');
    indicatorEl.textContent = 'Koneksi terputus — data mungkin tidak terkini';
    document.body.appendChild(indicatorEl);
  }

  function showConnectionLost() {
    if (!indicatorEl) createIndicator();
    indicatorEl.style.display = 'block';
  }

  function hideConnectionLost() {
    if (indicatorEl) {
      indicatorEl.style.display = 'none';
    }
  }

  // --- Socket.IO Configuration ---

  var phase1Config = {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 3000,
    timeout: 5000
  };

  // Phase tracking
  var reconnectAttempts = 0;
  var isPhase2 = false;
  var phase2Timer = null;
  var reconnectCallbacks = [];

  // Create socket connection (auto-detect server URL)
  var socket = io(undefined, phase1Config);

  // --- Phase 2 Reconnection Logic ---

  function startPhase2() {
    if (isPhase2) return;
    isPhase2 = true;

    // Disable built-in reconnection (Phase 1 exhausted)
    socket.io.opts.reconnection = false;

    // Start manual reconnection at 10s interval
    attemptPhase2Reconnect();
  }

  function attemptPhase2Reconnect() {
    if (socket.connected) {
      stopPhase2();
      return;
    }

    phase2Timer = setTimeout(function () {
      if (!socket.connected) {
        socket.connect();
        // Schedule next attempt
        attemptPhase2Reconnect();
      }
    }, 10000);
  }

  function stopPhase2() {
    if (phase2Timer) {
      clearTimeout(phase2Timer);
      phase2Timer = null;
    }
    isPhase2 = false;
  }

  function resetReconnectionState() {
    reconnectAttempts = 0;
    stopPhase2();

    // Restore Phase 1 config for future disconnects
    socket.io.opts.reconnection = true;
    socket.io.opts.reconnectionAttempts = phase1Config.reconnectionAttempts;
    socket.io.opts.reconnectionDelay = phase1Config.reconnectionDelay;
    socket.io.opts.reconnectionDelayMax = phase1Config.reconnectionDelayMax;
  }

  // --- Socket Event Handlers ---

  socket.on('connect', function () {
    hideConnectionLost();

    if (reconnectAttempts > 0 || isPhase2) {
      // This is a reconnection — request full state sync
      socket.emit('queue:request-sync');

      // Notify registered reconnect callbacks
      for (var i = 0; i < reconnectCallbacks.length; i++) {
        try {
          reconnectCallbacks[i]();
        } catch (e) {
          console.error('[QueueSocket] Reconnect callback error:', e);
        }
      }
    }

    resetReconnectionState();
  });

  socket.on('disconnect', function (reason) {
    showConnectionLost();
    reconnectAttempts = 0;

    // If server disconnected us, Socket.IO won't auto-reconnect for some reasons
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  socket.io.on('reconnect_attempt', function (attempt) {
    reconnectAttempts = attempt;
  });

  socket.io.on('reconnect_failed', function () {
    // Phase 1 exhausted (10 attempts failed) — switch to Phase 2
    startPhase2();
  });

  socket.on('connect_error', function () {
    // Show indicator on any connection error
    showConnectionLost();
  });

  // --- Initialize indicator when DOM is ready ---

  function initIndicator() {
    if (document.body) {
      createIndicator();
    } else {
      document.addEventListener('DOMContentLoaded', createIndicator);
    }
  }

  initIndicator();

  // --- Public API ---

  global.QueueSocket = {
    /** The raw Socket.IO instance */
    socket: socket,

    /**
     * Register an event listener on the socket
     * @param {string} event - Event name
     * @param {Function} callback - Event handler
     */
    on: function (event, callback) {
      socket.on(event, callback);
    },

    /**
     * Emit an event to the server
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit: function (event, data) {
      socket.emit(event, data);
    },

    /**
     * Register a callback to be called on reconnection
     * @param {Function} callback - Reconnect handler
     */
    onReconnect: function (callback) {
      if (typeof callback === 'function') {
        reconnectCallbacks.push(callback);
      }
    },

    /**
     * Check if the socket is currently connected
     * @returns {boolean}
     */
    isConnected: function () {
      return socket.connected;
    }
  };

})(window);
