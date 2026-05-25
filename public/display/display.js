/**
 * SoundEngine - Audio announcement engine for queue display
 *
 * Manages sequential playback of audio announcements using Web Audio API.
 * Audio files are preloaded on page load for instant playback.
 *
 * Flow:
 * 1. Receive queue:called event with {number, loketName}
 * 2. Parse queue number into digit array
 * 3. Build audio sequence: [bell, nomor-antrian, ...digits, silakan-menuju, loket-N]
 * 4. Play sequence 2x with pause between repeats
 * 5. If next announcement queued, play after 1 second gap
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5
 */
class SoundEngine {
  constructor(basePath = '/audio') {
    this.basePath = basePath;
    this.queue = [];
    this._isPlaying = false;
    this.audioCache = new Map();
    this.audioContext = null;
  }

  /**
   * Initialize AudioContext (must be called after user interaction on some browsers).
   */
  _ensureContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.error('[SoundEngine] Failed to create AudioContext:', e);
      }
    }
    // Resume if suspended (browser autoplay policy)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Preload all known audio files into the audioCache as AudioBuffers.
   * Should be called on page load.
   * @returns {Promise<void>}
   */
  async preload() {
    this._ensureContext();

    var files = [
      'bell.mp3',
      'nomor-antrian.mp3',
      'silakan-menuju.mp3',
      '0.mp3', '1.mp3', '2.mp3', '3.mp3', '4.mp3',
      '5.mp3', '6.mp3', '7.mp3', '8.mp3', '9.mp3',
      'loket-1.mp3', 'loket-2.mp3', 'loket-3.mp3',
      'loket-4.mp3', 'loket-5.mp3'
    ];

    var loadPromises = files.map(async (file) => {
      try {
        var url = this.basePath + '/' + file;
        var response = await fetch(url);
        if (!response.ok) {
          console.warn('[SoundEngine] Failed to fetch audio file:', file, response.status);
          return;
        }
        var arrayBuffer = await response.arrayBuffer();
        var audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.audioCache.set(file, audioBuffer);
      } catch (e) {
        console.warn('[SoundEngine] Failed to preload audio file:', file, e);
      }
    });

    await Promise.all(loadPromises);
    console.log('[SoundEngine] Preloaded', this.audioCache.size, 'audio files');
  }

  /**
   * Build the audio file sequence for a queue announcement.
   *
   * @param {string} queueNumber - e.g. "A-003"
   * @param {string} loketName - e.g. "Loket 1"
   * @returns {string[]} Array of audio filenames
   *
   * Example: "A-003" at "Loket 1" →
   *   ['bell.mp3', 'nomor-antrian.mp3', '0.mp3', '0.mp3', '3.mp3', 'silakan-menuju.mp3', 'loket-1.mp3']
   */
  buildAudioSequence(queueNumber, loketName) {
    var parts = ['bell.mp3', 'nomor-antrian.mp3'];

    // Parse digits from number part (after prefix-)
    var numberPart = queueNumber.split('-')[1] || '000';
    for (var i = 0; i < numberPart.length; i++) {
      parts.push(numberPart[i] + '.mp3');
    }

    parts.push('silakan-menuju.mp3');

    // Normalize loket name to filename: "Loket 1" → "loket-1.mp3"
    var loketFile = loketName.toLowerCase().replace(/\s+/g, '-') + '.mp3';
    parts.push(loketFile);

    return parts;
  }

  /**
   * Announce a queue number at a loket. Enqueues the announcement
   * to be played 2 times with pause between repeats.
   *
   * @param {string} queueNumber - e.g. "A-003"
   * @param {string} loketName - e.g. "Loket 1"
   */
  announce(queueNumber, loketName) {
    var sequence = this.buildAudioSequence(queueNumber, loketName);
    this.enqueue({ sequence: sequence, repeats: 2 });
  }

  /**
   * Add an announcement to the FIFO queue and start processing if idle.
   *
   * @param {Object} announcement - { sequence: string[], repeats: number }
   */
  enqueue(announcement) {
    this.queue.push(announcement);
    if (!this._isPlaying) {
      this._processQueue();
    }
  }

  /**
   * Check if the sound engine is currently playing.
   * @returns {boolean}
   */
  isPlaying() {
    return this._isPlaying;
  }

  /**
   * Process the announcement queue sequentially.
   * Takes the first item, plays it (with repeats), waits 1s, then processes next.
   * @private
   */
  async _processQueue() {
    if (this.queue.length === 0) {
      this._isPlaying = false;
      return;
    }

    this._isPlaying = true;
    var announcement = this.queue.shift();

    try {
      for (var r = 0; r < announcement.repeats; r++) {
        await this._playSequence(announcement.sequence);

        // Pause between repeats (except after the last repeat)
        if (r < announcement.repeats - 1) {
          await this._delay(1500);
        }
      }
    } catch (e) {
      console.error('[SoundEngine] Error playing announcement:', e);
    }

    // Wait 1 second gap between announcements
    if (this.queue.length > 0) {
      await this._delay(1000);
    }

    // Process next in queue
    this._processQueue();
  }

  /**
   * Play a sequence of audio files in order using Web Audio API.
   *
   * @param {string[]} files - Array of audio filenames to play in order
   * @returns {Promise<void>}
   * @private
   */
  async _playSequence(files) {
    var ctx = this._ensureContext();
    if (!ctx) {
      console.error('[SoundEngine] No AudioContext available');
      return;
    }

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var buffer = this.audioCache.get(file);

      if (!buffer) {
        console.warn('[SoundEngine] Audio not cached, skipping:', file);
        continue;
      }

      try {
        await this._playBuffer(buffer);
      } catch (e) {
        console.warn('[SoundEngine] Error playing file:', file, e);
        // Continue to next file on error
      }
    }
  }

  /**
   * Play a single AudioBuffer and return a Promise that resolves when done.
   *
   * @param {AudioBuffer} buffer
   * @returns {Promise<void>}
   * @private
   */
  _playBuffer(buffer) {
    return new Promise((resolve, reject) => {
      try {
        var source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.onended = resolve;
        source.start(0);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Utility: delay for a given number of milliseconds.
   *
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  _delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
}

// Create global SoundEngine instance
window.soundEngine = new SoundEngine();

// Preload audio files when page loads
document.addEventListener('DOMContentLoaded', function () {
  // Attempt preload immediately
  window.soundEngine.preload();

  // Also ensure AudioContext is resumed on first user interaction (browser policy)
  document.addEventListener('click', function resumeAudio() {
    window.soundEngine._ensureContext();
    document.removeEventListener('click', resumeAudio);
  }, { once: true });
});

/**
 * Display Page Logic - Sistem Antrian RSI Muhammadiyah 2 Kendal
 *
 * Handles:
 * - URL parameter parsing for loket filter (?loket=1,2)
 * - Dynamic card rendering for each loket
 * - Real-time updates via Socket.IO (queue:called, queue:updated, queue:reset)
 * - Highlight animation on newly called numbers
 * - Connection lost/reconnect handling
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11
 */
(function () {
  'use strict';

  // --- State ---
  var loketIds = [];
  var displayGrid = null;
  var highlightTimers = {};

  // --- URL Parameter Parsing ---

  /**
   * Parse URL parameter ?loket=1,2 to get array of loket IDs.
   * Empty array means show all lokets.
   * @returns {number[]}
   */
  function parseDisplayFilter() {
    var params = new URLSearchParams(window.location.search);
    var loketParam = params.get('loket');

    if (!loketParam || loketParam.trim() === '') {
      return []; // Show all
    }

    return loketParam
      .split(',')
      .map(function (id) { return parseInt(id.trim(), 10); })
      .filter(function (id) { return !isNaN(id) && id > 0; });
  }

  /**
   * Determine if an event should be processed based on the display filter.
   * @param {number} loketId - The loket ID from the event
   * @returns {boolean}
   */
  function shouldProcessEvent(loketId) {
    if (loketIds.length === 0) return true; // No filter = process all
    return loketIds.indexOf(loketId) !== -1;
  }

  // --- Card Rendering ---

  /**
   * Create a loket card element (empty state).
   * @param {number} id - Loket ID
   * @param {string} name - Loket name
   * @returns {HTMLElement}
   */
  function createEmptyCard(id, name) {
    var card = document.createElement('div');
    card.className = 'loket-card loket-card--empty';
    card.setAttribute('data-loket-id', id);

    card.innerHTML =
      '<div class="loket-card__header">' +
        '<span class="loket-card__name">' + escapeHtml(name) + '</span>' +
      '</div>' +
      '<div class="loket-card__body">' +
        '<p class="loket-card__number loket-card__number--empty">---</p>' +
        '<p class="loket-card__type loket-card__type--empty">Belum ada antrian</p>' +
      '</div>';

    return card;
  }

  /**
   * Create a loket card element with active queue number.
   * @param {number} id - Loket ID
   * @param {string} name - Loket name
   * @param {string} number - Queue number (e.g. "A-001")
   * @param {string} typeName - Queue type name (e.g. "Pendaftaran")
   * @returns {HTMLElement}
   */
  function createActiveCard(id, name, number, typeName) {
    var card = document.createElement('div');
    card.className = 'loket-card';
    card.setAttribute('data-loket-id', id);

    card.innerHTML =
      '<div class="loket-card__header">' +
        '<span class="loket-card__name">' + escapeHtml(name) + '</span>' +
      '</div>' +
      '<div class="loket-card__body">' +
        '<p class="loket-card__number">' + escapeHtml(number) + '</p>' +
        '<p class="loket-card__type">' + escapeHtml(typeName) + '</p>' +
      '</div>';

    return card;
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  /**
   * Find an existing card by loket ID.
   * @param {number} loketId
   * @returns {HTMLElement|null}
   */
  function findCard(loketId) {
    return displayGrid.querySelector('[data-loket-id="' + loketId + '"]');
  }

  /**
   * Render the full display state from the API response.
   * @param {Object} state - Queue state from GET /api/queue/state
   */
  function renderState(state) {
    displayGrid.innerHTML = '';

    var serving = state.serving || [];

    // Filter serving entries by loketIds
    var filteredServing = serving.filter(function (item) {
      return shouldProcessEvent(item.loketId);
    });

    // Build a map of loketId → serving info (take the most recent per loket)
    var loketMap = {};
    for (var i = 0; i < filteredServing.length; i++) {
      var item = filteredServing[i];
      // Only keep the first (most recent, since sorted by called_at DESC)
      if (!loketMap[item.loketId]) {
        loketMap[item.loketId] = item;
      }
    }

    // If we have a filter, render cards for each filtered loket
    // If no filter, render cards for all lokets that have serving entries
    if (loketIds.length > 0) {
      // Render cards for each loket in the filter
      for (var j = 0; j < loketIds.length; j++) {
        var id = loketIds[j];
        var servingItem = loketMap[id];
        var card;

        if (servingItem) {
          card = createActiveCard(id, servingItem.loketName, servingItem.number, servingItem.queueTypeName);
        } else {
          card = createEmptyCard(id, 'Loket ' + id);
        }

        displayGrid.appendChild(card);
      }
    } else {
      // No filter: show all lokets that have serving entries
      // Also show lokets from the serving array even if empty
      var renderedIds = {};

      // Render active lokets first
      for (var loketId in loketMap) {
        if (loketMap.hasOwnProperty(loketId)) {
          var s = loketMap[loketId];
          var activeCard = createActiveCard(s.loketId, s.loketName, s.number, s.queueTypeName);
          displayGrid.appendChild(activeCard);
          renderedIds[s.loketId] = true;
        }
      }

      // If no serving entries at all, show a message or empty state
      if (Object.keys(loketMap).length === 0) {
        // Show empty state - we don't know all lokets without filter
        // Render a single empty placeholder
        var emptyCard = createEmptyCard(0, 'Semua Loket');
        displayGrid.appendChild(emptyCard);
      }
    }
  }

  // --- Highlight Logic ---

  /**
   * Add highlight class to a card and remove it after 5 seconds.
   * @param {HTMLElement} card
   * @param {number} loketId
   */
  function highlightCard(card, loketId) {
    // Clear any existing highlight timer for this loket
    if (highlightTimers[loketId]) {
      clearTimeout(highlightTimers[loketId]);
    }

    card.classList.add('loket-card--highlight');

    highlightTimers[loketId] = setTimeout(function () {
      card.classList.remove('loket-card--highlight');
      delete highlightTimers[loketId];
    }, 5000);
  }

  // --- API Fetch ---

  /**
   * Fetch the current queue state from the server and render it.
   */
  function fetchAndRenderState() {
    fetch('/api/queue/state')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to fetch queue state');
        }
        return response.json();
      })
      .then(function (result) {
        if (result.success && result.data) {
          renderState(result.data);
        }
      })
      .catch(function (error) {
        console.error('[Display] Error fetching queue state:', error);
      });
  }

  // --- Socket Event Handlers ---

  /**
   * Handle queue:called event.
   * Update the display card for the called loket with highlight.
   * @param {Object} data - { number, queueTypeId, queueTypeName, loketId, loketName, timestamp }
   */
  function handleQueueCalled(data) {
    if (!shouldProcessEvent(data.loketId)) return;

    var card = findCard(data.loketId);

    if (card) {
      // Update existing card
      card.className = 'loket-card';
      card.innerHTML =
        '<div class="loket-card__header">' +
          '<span class="loket-card__name">' + escapeHtml(data.loketName) + '</span>' +
        '</div>' +
        '<div class="loket-card__body">' +
          '<p class="loket-card__number">' + escapeHtml(data.number) + '</p>' +
          '<p class="loket-card__type">' + escapeHtml(data.queueTypeName) + '</p>' +
        '</div>';
    } else {
      // Create new card for this loket
      card = createActiveCard(data.loketId, data.loketName, data.number, data.queueTypeName);
      displayGrid.appendChild(card);
    }

    // Add highlight animation
    highlightCard(card, data.loketId);

    // Trigger sound announcement (wrapped in try-catch so audio failures don't disrupt visual display)
    try {
      if (window.soundEngine) {
        window.soundEngine.announce(data.number, data.loketName);
      }
    } catch (e) {
      console.error('[Display] Sound announcement failed, continuing with visual display:', e);
    }
  }

  /**
   * Handle queue:recalled event (same visual behavior as queue:called).
   * @param {Object} data - { number, queueTypeId, queueTypeName, loketId, loketName, timestamp }
   */
  function handleQueueRecalled(data) {
    // Same visual behavior as called
    handleQueueCalled(data);
  }

  /**
   * Handle queue:updated event.
   * Refresh the display state to reflect updated waiting counts.
   * @param {Object} data - { queueTypeId, waitingCount, totalToday }
   */
  function handleQueueUpdated(data) {
    // Refresh the full state to keep display in sync
    fetchAndRenderState();
  }

  /**
   * Handle queue:reset event.
   * Clear all display cards to empty state.
   */
  function handleQueueReset() {
    // Clear all highlight timers
    for (var id in highlightTimers) {
      if (highlightTimers.hasOwnProperty(id)) {
        clearTimeout(highlightTimers[id]);
      }
    }
    highlightTimers = {};

    // Clear the grid and show empty state
    displayGrid.innerHTML = '';

    if (loketIds.length > 0) {
      // Render empty cards for each filtered loket
      for (var i = 0; i < loketIds.length; i++) {
        var card = createEmptyCard(loketIds[i], 'Loket ' + loketIds[i]);
        displayGrid.appendChild(card);
      }
    } else {
      // No filter: show generic empty state
      var emptyCard = createEmptyCard(0, 'Semua Loket');
      displayGrid.appendChild(emptyCard);
    }
  }

  // --- Reconnection Handler ---

  /**
   * Re-register with server and re-fetch state on reconnection.
   */
  function handleReconnect() {
    // Re-register display with server
    QueueSocket.emit('display:register', { loketIds: loketIds });

    // Re-fetch and render current state
    fetchAndRenderState();
  }

  // --- Initialization ---

  function init() {
    displayGrid = document.getElementById('display-grid');

    if (!displayGrid) {
      console.error('[Display] #display-grid element not found');
      return;
    }

    // 1. Parse URL filter
    loketIds = parseDisplayFilter();

    // 2. Register with server
    QueueSocket.emit('display:register', { loketIds: loketIds });

    // 3. Fetch initial state
    fetchAndRenderState();

    // 4. Register socket event listeners
    QueueSocket.on('queue:called', handleQueueCalled);
    QueueSocket.on('queue:recalled', handleQueueRecalled);
    QueueSocket.on('queue:updated', handleQueueUpdated);
    QueueSocket.on('queue:reset', handleQueueReset);

    // 5. Register reconnection handler
    QueueSocket.onReconnect(handleReconnect);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
