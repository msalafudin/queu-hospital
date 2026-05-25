/**
 * Admin Panel JavaScript - Sistem Antrian RSI Muhammadiyah 2 Kendal
 *
 * Core functionality:
 * - Loket and queue type selection
 * - Call next queue number
 * - Recall current serving number
 * - Real-time waiting count updates via Socket.IO
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
(function () {
  'use strict';

  // --- Default Loket Data (matches database seed) ---
  var DEFAULT_LOKETS = [
    { id: 1, name: 'Loket 1', queueTypeId: 1 },
    { id: 2, name: 'Loket 2', queueTypeId: 1 },
    { id: 3, name: 'Loket 3', queueTypeId: 2 },
    { id: 4, name: 'Loket 4', queueTypeId: 3 },
    { id: 5, name: 'Loket 5', queueTypeId: 4 }
  ];

  // --- State ---
  var state = {
    lokets: DEFAULT_LOKETS,
    queueTypes: [],
    selectedLoketId: null,
    selectedQueueTypeId: null,
    currentServing: null, // Currently serving for selected loket
    waitingCounts: {}     // { typeId: { queueTypeName, prefix, count } }
  };

  // --- DOM Elements ---
  var loketDropdown = null;
  var typeDropdown = null;
  var btnCallNext = null;
  var btnRecall = null;
  var servingNumber = null;
  var servingLoket = null;
  var waitingList = null;

  // --- Initialization ---

  document.addEventListener('DOMContentLoaded', function () {
    // Cache DOM elements
    loketDropdown = document.getElementById('loket-dropdown');
    typeDropdown = document.getElementById('type-dropdown');
    btnCallNext = document.getElementById('btn-call-next');
    btnRecall = document.getElementById('btn-recall');
    servingNumber = document.getElementById('serving-number');
    servingLoket = document.getElementById('serving-loket');
    waitingList = document.getElementById('waiting-list');

    // Bind event listeners
    loketDropdown.addEventListener('change', onLoketChange);
    typeDropdown.addEventListener('change', onTypeChange);
    btnCallNext.addEventListener('click', onCallNext);
    btnRecall.addEventListener('click', onRecall);

    // Setup Socket.IO listeners
    setupSocketListeners();

    // Fetch initial data
    fetchInitialData();
  });

  /**
   * Fetch queue types and queue state on page load.
   */
  function fetchInitialData() {
    Promise.all([
      fetch('/api/queue-types').then(function (r) { return r.json(); }),
      fetch('/api/queue/state').then(function (r) { return r.json(); })
    ]).then(function (results) {
      var typesResponse = results[0];
      var stateResponse = results[1];

      // Populate queue types
      if (typesResponse.success && typesResponse.data) {
        state.queueTypes = typesResponse.data;
      } else if (Array.isArray(typesResponse)) {
        state.queueTypes = typesResponse;
      }

      // Populate waiting counts from state
      if (stateResponse.success && stateResponse.data) {
        state.waitingCounts = stateResponse.data.waitingCounts || {};

        // Update serving info if a loket is already selected
        if (state.selectedLoketId && stateResponse.data.serving) {
          var servingForLoket = stateResponse.data.serving.find(function (s) {
            return s.loketId === state.selectedLoketId;
          });
          if (servingForLoket) {
            state.currentServing = servingForLoket;
          }
        }
      }

      // Populate dropdowns
      populateLoketDropdown();
      populateTypeDropdown();

      // Render waiting counts
      renderWaitingCounts();

      // Update serving display
      updateServingDisplay();
      updateButtonStates();
    }).catch(function (err) {
      console.error('[Admin] Failed to fetch initial data:', err);
    });
  }

  // --- Dropdown Population ---

  /**
   * Populate the loket dropdown with available lokets.
   */
  function populateLoketDropdown() {
    // Clear existing options except the placeholder
    loketDropdown.innerHTML = '<option value="">-- Pilih Loket --</option>';

    state.lokets.forEach(function (loket) {
      var option = document.createElement('option');
      option.value = loket.id;
      option.textContent = loket.name;
      loketDropdown.appendChild(option);
    });
  }

  /**
   * Populate the queue type dropdown.
   * If a loket is selected, filter to show only the queue type associated with that loket.
   * Otherwise show all active queue types.
   */
  function populateTypeDropdown() {
    typeDropdown.innerHTML = '<option value="">-- Pilih Tipe Antrian --</option>';

    var typesToShow = state.queueTypes.filter(function (qt) {
      return qt.is_active === 1 || qt.isActive === true;
    });

    // If a loket is selected, filter to show the associated queue type
    if (state.selectedLoketId) {
      var selectedLoket = state.lokets.find(function (l) {
        return l.id === state.selectedLoketId;
      });
      if (selectedLoket && selectedLoket.queueTypeId) {
        typesToShow = typesToShow.filter(function (qt) {
          return qt.id === selectedLoket.queueTypeId;
        });
      }
    }

    typesToShow.forEach(function (qt) {
      var option = document.createElement('option');
      option.value = qt.id;
      option.textContent = qt.name + ' (' + qt.prefix + ')';
      typeDropdown.appendChild(option);
    });

    // Auto-select if only one type available
    if (typesToShow.length === 1) {
      typeDropdown.value = typesToShow[0].id;
      state.selectedQueueTypeId = typesToShow[0].id;
    } else {
      state.selectedQueueTypeId = null;
    }
  }

  // --- Event Handlers ---

  /**
   * Handle loket dropdown change.
   * Filters queue type dropdown to the type associated with the selected loket.
   */
  function onLoketChange() {
    var value = loketDropdown.value;
    state.selectedLoketId = value ? parseInt(value, 10) : null;

    // Re-populate type dropdown filtered by loket
    populateTypeDropdown();

    // Update serving display for the selected loket
    refreshServingForLoket();

    updateButtonStates();
  }

  /**
   * Handle queue type dropdown change.
   */
  function onTypeChange() {
    var value = typeDropdown.value;
    state.selectedQueueTypeId = value ? parseInt(value, 10) : null;
    updateButtonStates();
  }

  /**
   * Handle "Panggil Berikutnya" button click.
   * POST /api/queue/call-next with { queueTypeId, loketId }
   */
  function onCallNext() {
    if (!state.selectedQueueTypeId || !state.selectedLoketId) return;

    btnCallNext.disabled = true;
    btnCallNext.textContent = 'Memanggil...';

    fetch('/api/queue/call-next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queueTypeId: state.selectedQueueTypeId,
        loketId: state.selectedLoketId
      })
    })
      .then(function (response) { return response.json(); })
      .then(function (result) {
        if (result.success && result.data) {
          // Update serving display
          state.currentServing = result.data;
          updateServingDisplay();
        } else if (result.error) {
          // Queue empty or other error
          if (result.error.code === 'QUEUE_EMPTY') {
            showEmptyMessage();
          } else {
            alert('Error: ' + result.error.message);
          }
        }
      })
      .catch(function (err) {
        console.error('[Admin] Call next failed:', err);
        alert('Gagal memanggil antrian. Periksa koneksi server.');
      })
      .finally(function () {
        btnCallNext.disabled = false;
        btnCallNext.textContent = 'Panggil Berikutnya';
        updateButtonStates();
      });
  }

  /**
   * Handle "Panggil Ulang" button click.
   * POST /api/queue/recall with { loketId }
   */
  function onRecall() {
    if (!state.selectedLoketId) return;

    btnRecall.disabled = true;
    btnRecall.textContent = 'Memanggil Ulang...';

    fetch('/api/queue/recall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loketId: state.selectedLoketId
      })
    })
      .then(function (response) { return response.json(); })
      .then(function (result) {
        if (result.success && result.data) {
          // Recall successful - update display
          state.currentServing = result.data;
          updateServingDisplay();
        } else if (result.error) {
          if (result.error.code === 'NO_ACTIVE_SERVING') {
            state.currentServing = null;
            updateServingDisplay();
            updateButtonStates();
          } else {
            alert('Error: ' + result.error.message);
          }
        }
      })
      .catch(function (err) {
        console.error('[Admin] Recall failed:', err);
        alert('Gagal memanggil ulang. Periksa koneksi server.');
      })
      .finally(function () {
        btnRecall.textContent = 'Panggil Ulang';
        updateButtonStates();
      });
  }

  // --- UI Updates ---

  /**
   * Update the serving display with current serving info.
   */
  function updateServingDisplay() {
    if (state.currentServing) {
      servingNumber.textContent = state.currentServing.number;
      servingLoket.textContent = state.currentServing.loketName || '-';
    } else {
      servingNumber.textContent = '---';
      servingLoket.textContent = '-';
    }
  }

  /**
   * Show a temporary message indicating the queue is empty.
   */
  function showEmptyMessage() {
    servingNumber.textContent = '---';
    servingLoket.textContent = 'Antrian kosong';

    // Reset after 3 seconds
    setTimeout(function () {
      if (servingLoket.textContent === 'Antrian kosong') {
        updateServingDisplay();
      }
    }, 3000);
  }

  /**
   * Update button enabled/disabled states based on current selections.
   */
  function updateButtonStates() {
    // btn-call-next: enabled only when both loket and type are selected
    var canCallNext = state.selectedLoketId && state.selectedQueueTypeId;
    btnCallNext.disabled = !canCallNext;

    // btn-recall: enabled only when there's an active serving for selected loket
    var canRecall = state.selectedLoketId && state.currentServing !== null;
    btnRecall.disabled = !canRecall;
  }

  /**
   * Render waiting counts in the waiting list container.
   * Each item is color-coded by count level.
   */
  function renderWaitingCounts() {
    if (!waitingList) return;

    var counts = state.waitingCounts;
    var keys = Object.keys(counts);

    if (keys.length === 0) {
      waitingList.innerHTML = '<p class="empty-state">Tidak ada data antrian</p>';
      return;
    }

    var html = '';
    keys.forEach(function (typeId) {
      var item = counts[typeId];
      var count = item.count || 0;
      var colorClass = getCountColorClass(count);

      html += '<div class="waiting-item ' + colorClass + '">';
      html += '<span class="waiting-type-name">' + escapeHtml(item.queueTypeName || item.prefix || 'Tipe ' + typeId) + '</span>';
      html += '<span class="waiting-count">' + count + '</span>';
      html += '</div>';
    });

    waitingList.innerHTML = html;
  }

  /**
   * Get CSS color class based on waiting count level.
   * @param {number} count
   * @returns {string}
   */
  function getCountColorClass(count) {
    if (count === 0) return 'count-empty';
    if (count <= 5) return 'count-low';
    if (count <= 15) return 'count-medium';
    return 'count-high';
  }

  /**
   * Refresh the serving info for the currently selected loket.
   */
  function refreshServingForLoket() {
    if (!state.selectedLoketId) {
      state.currentServing = null;
      updateServingDisplay();
      return;
    }

    // Fetch fresh state to get current serving for this loket
    fetch('/api/queue/state')
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (result.success && result.data && result.data.serving) {
          var servingForLoket = result.data.serving.find(function (s) {
            return s.loketId === state.selectedLoketId;
          });
          state.currentServing = servingForLoket || null;
        } else {
          state.currentServing = null;
        }
        updateServingDisplay();
        updateButtonStates();
      })
      .catch(function (err) {
        console.error('[Admin] Failed to refresh serving:', err);
      });
  }

  // --- Socket.IO Event Handlers ---

  /**
   * Setup Socket.IO event listeners for real-time updates.
   */
  function setupSocketListeners() {
    if (typeof QueueSocket === 'undefined') {
      console.warn('[Admin] QueueSocket not available');
      return;
    }

    // queue:updated - refresh waiting counts
    QueueSocket.on('queue:updated', function (data) {
      if (data && data.queueTypeId !== undefined) {
        // Update the specific queue type count
        if (state.waitingCounts[data.queueTypeId]) {
          state.waitingCounts[data.queueTypeId].count = data.waitingCount;
        } else {
          state.waitingCounts[data.queueTypeId] = {
            queueTypeId: data.queueTypeId,
            queueTypeName: '',
            prefix: '',
            count: data.waitingCount
          };
        }
        renderWaitingCounts();
      }
    });

    // queue:called - if it's our loket, update serving display
    QueueSocket.on('queue:called', function (data) {
      if (data && data.loketId === state.selectedLoketId) {
        state.currentServing = {
          number: data.number,
          queueTypeId: data.queueTypeId,
          queueTypeName: data.queueTypeName,
          loketId: data.loketId,
          loketName: data.loketName,
          calledAt: data.timestamp
        };
        updateServingDisplay();
        updateButtonStates();
      }
    });

    // queue:recalled - if it's our loket, update serving display
    QueueSocket.on('queue:recalled', function (data) {
      if (data && data.loketId === state.selectedLoketId) {
        state.currentServing = {
          number: data.number,
          queueTypeId: data.queueTypeId,
          queueTypeName: data.queueTypeName,
          loketId: data.loketId,
          loketName: data.loketName,
          calledAt: data.timestamp
        };
        updateServingDisplay();
        updateButtonStates();
      }
    });

    // queue:reset - clear all state
    QueueSocket.on('queue:reset', function () {
      state.currentServing = null;
      state.waitingCounts = {};
      updateServingDisplay();
      renderWaitingCounts();
      updateButtonStates();
    });

    // On reconnect, refresh all data
    QueueSocket.onReconnect(function () {
      fetchInitialData();
    });
  }

  // --- Utility Functions ---

  /**
   * Escape HTML to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ============================================
  // Queue Type Management (Task 8.3)
  // ============================================
  // TODO: Implement queue type CRUD functionality
  // - Form submission for create/update queue types
  // - List rendering with edit/activate/deactivate actions
  // - Validation feedback

  // ============================================
  // Reset Functionality (Task 8.4)
  // ============================================
  // TODO: Implement reset dialog and confirmation
  // - btn-reset click handler
  // - Fetch reset info and populate dialog
  // - Confirm/cancel reset actions

})();
