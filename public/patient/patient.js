/**
 * Patient Page - Sistem Antrian RSI Muhammadiyah 2 Kendal
 *
 * Handles queue type selection and number taking for patients.
 * Uses the global QueueSocket object from /shared/socket-client.js.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6
 */
(function () {
  'use strict';

  // --- DOM Elements ---
  var queueTypesContainer = document.getElementById('queue-types-container');
  var resultArea = document.getElementById('result-area');
  var resultQueueNumber = document.getElementById('result-queue-number');
  var resultQueueType = document.getElementById('result-queue-type');
  var resultTimestamp = document.getElementById('result-timestamp');
  var messageArea = document.getElementById('message-area');
  var messageText = document.getElementById('message-text');
  var noServiceMessage = document.getElementById('no-service-message');
  var resultCloseBtn = document.getElementById('result-close-btn');

  // --- State ---
  var isProcessing = false;

  // --- Utility Functions ---

  /**
   * Format an ISO timestamp string to "DD/MM/YYYY HH:mm".
   * @param {string} isoString - ISO 8601 timestamp
   * @returns {string} Formatted date string
   */
  function formatTimestamp(isoString) {
    var date = new Date(isoString);
    var day = String(date.getDate()).padStart(2, '0');
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var year = date.getFullYear();
    var hours = String(date.getHours()).padStart(2, '0');
    var minutes = String(date.getMinutes()).padStart(2, '0');
    return day + '/' + month + '/' + year + ' ' + hours + ':' + minutes;
  }

  /**
   * Show an error/warning message to the user.
   * @param {string} text - Message to display
   */
  function showMessage(text) {
    messageText.textContent = text;
    messageArea.style.display = 'block';
  }

  /**
   * Hide the message area.
   */
  function hideMessage() {
    messageArea.style.display = 'none';
    messageText.textContent = '';
  }

  /**
   * Show the result area with queue number details.
   * @param {Object} data - Queue number data from API
   */
  function showResult(data) {
    resultQueueNumber.textContent = data.number;
    resultQueueType.textContent = data.queueType.name;
    resultTimestamp.textContent = formatTimestamp(data.timestamp);

    queueTypesContainer.style.display = 'none';
    noServiceMessage.style.display = 'none';
    resultArea.style.display = 'block';
    hideMessage();
  }

  /**
   * Hide the result area and show queue type buttons again.
   */
  function hideResult() {
    resultArea.style.display = 'none';
    queueTypesContainer.style.display = '';
    fetchActiveQueueTypes();
  }

  /**
   * Enable or disable all queue type buttons.
   * @param {boolean} disabled - Whether buttons should be disabled
   */
  function setButtonsDisabled(disabled) {
    var buttons = queueTypesContainer.querySelectorAll('.queue-type-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = disabled;
    }
  }

  // --- API Functions ---

  /**
   * Fetch active queue types from the server and render buttons.
   */
  function fetchActiveQueueTypes() {
    fetch('/api/queue-types/active')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Gagal memuat data layanan antrian');
        }
        return response.json();
      })
      .then(function (result) {
        if (result.success && result.data) {
          renderQueueTypes(result.data);
        } else {
          showMessage('Gagal memuat data layanan antrian');
        }
      })
      .catch(function (error) {
        showMessage(error.message || 'Gagal terhubung ke server');
      });
  }

  /**
   * Render queue type buttons in the container.
   * @param {Array} queueTypes - Array of active queue type objects
   */
  function renderQueueTypes(queueTypes) {
    // Clear existing buttons
    queueTypesContainer.innerHTML = '';
    hideMessage();

    if (!queueTypes || queueTypes.length === 0) {
      noServiceMessage.style.display = 'block';
      queueTypesContainer.style.display = 'none';
      return;
    }

    noServiceMessage.style.display = 'none';
    queueTypesContainer.style.display = '';

    for (var i = 0; i < queueTypes.length; i++) {
      var type = queueTypes[i];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'queue-type-btn';
      button.setAttribute('data-id', type.id);
      button.textContent = type.name;
      button.addEventListener('click', handleQueueTypeClick);
      queueTypesContainer.appendChild(button);
    }
  }

  /**
   * Handle queue type button click - take a queue number.
   * @param {Event} event - Click event
   */
  function handleQueueTypeClick(event) {
    if (isProcessing) return;

    var button = event.currentTarget;
    var queueTypeId = parseInt(button.getAttribute('data-id'), 10);

    if (!queueTypeId || isNaN(queueTypeId)) return;

    isProcessing = true;
    setButtonsDisabled(true);
    hideMessage();

    fetch('/api/queue/take', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ queueTypeId: queueTypeId })
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        if (result.success && result.data) {
          showResult(result.data);
        } else {
          var errorMsg = (result.error && result.error.message)
            ? result.error.message
            : 'Gagal mengambil nomor antrian';
          showMessage(errorMsg);
          setButtonsDisabled(false);
        }
      })
      .catch(function () {
        showMessage('Gagal terhubung ke server. Silakan coba lagi.');
        setButtonsDisabled(false);
      })
      .finally(function () {
        isProcessing = false;
      });
  }

  // --- Event Listeners ---

  // Close result and go back to type selection
  resultCloseBtn.addEventListener('click', function () {
    hideResult();
  });

  // Listen for queue:updated to refresh available types
  QueueSocket.on('queue:updated', function () {
    // Only refresh if we're showing the type selection (not the result)
    if (resultArea.style.display === 'none' || resultArea.style.display === '') {
      fetchActiveQueueTypes();
    }
  });

  // On reconnect, re-fetch active types
  QueueSocket.onReconnect(function () {
    if (resultArea.style.display === 'none' || resultArea.style.display === '') {
      fetchActiveQueueTypes();
    }
  });

  // --- Initialization ---
  fetchActiveQueueTypes();

})();
