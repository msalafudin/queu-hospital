'use strict';

/**
 * Admin Management Module
 * Handles Queue Type CRUD operations and Reset functionality.
 * Loaded alongside admin.js to avoid conflicts with concurrent task development.
 */

(function () {
  // ============================================================
  // DOM References
  // ============================================================
  const queueTypeForm = document.getElementById('queue-type-form');
  const queueTypeIdInput = document.getElementById('queue-type-id');
  const queueTypeNameInput = document.getElementById('queue-type-name');
  const queueTypePrefixInput = document.getElementById('queue-type-prefix');
  const btnSaveType = document.getElementById('btn-save-type');
  const btnCancelType = document.getElementById('btn-cancel-type');
  const queueTypeList = document.getElementById('queue-type-list');

  const btnReset = document.getElementById('btn-reset');
  const resetDialog = document.getElementById('reset-dialog');
  const resetDateEl = document.getElementById('reset-date');
  const resetTotalEl = document.getElementById('reset-total');
  const btnConfirmReset = document.getElementById('btn-confirm-reset');
  const btnCancelReset = document.getElementById('btn-cancel-reset');

  // ============================================================
  // Queue Type Management
  // ============================================================

  /**
   * Load all queue types from the server and render the list.
   */
  async function loadQueueTypes() {
    try {
      const response = await fetch('/api/queue-types');
      const result = await response.json();
      if (result.success) {
        renderQueueTypeList(result.data);
      } else {
        showQueueTypeError('Gagal memuat daftar tipe antrian.');
      }
    } catch (err) {
      showQueueTypeError('Gagal terhubung ke server.');
    }
  }

  /**
   * Render the queue type list in the DOM.
   * @param {Array} queueTypes - Array of queue type objects
   */
  function renderQueueTypeList(queueTypes) {
    if (!queueTypeList) return;

    if (!queueTypes || queueTypes.length === 0) {
      queueTypeList.innerHTML = '<p class="empty-state">Belum ada tipe antrian.</p>';
      return;
    }

    const html = queueTypes.map(function (qt) {
      const statusClass = qt.isActive ? 'status-active' : 'status-inactive';
      const statusText = qt.isActive ? 'Aktif' : 'Nonaktif';
      const defaultBadge = qt.isDefault ? '<span class="badge badge-default">Default</span>' : '';

      const toggleBtn = qt.isActive
        ? '<button class="btn btn-sm btn-warning btn-deactivate" data-id="' + qt.id + '">Nonaktifkan</button>'
        : '<button class="btn btn-sm btn-success btn-activate" data-id="' + qt.id + '">Aktifkan</button>';

      return '<div class="queue-type-item" data-id="' + qt.id + '">' +
        '<div class="queue-type-info">' +
        '<strong>' + escapeHtml(qt.name) + '</strong> ' +
        '<span class="queue-type-prefix">[' + escapeHtml(qt.prefix) + ']</span> ' +
        defaultBadge +
        '<span class="badge ' + statusClass + '">' + statusText + '</span>' +
        '</div>' +
        '<div class="queue-type-actions">' +
        '<button class="btn btn-sm btn-secondary btn-edit" data-id="' + qt.id + '" data-name="' + escapeAttr(qt.name) + '" data-prefix="' + escapeAttr(qt.prefix) + '">Edit</button>' +
        toggleBtn +
        '</div>' +
        '</div>';
    }).join('');

    queueTypeList.innerHTML = html;

    // Attach event listeners
    queueTypeList.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', handleEditClick);
    });
    queueTypeList.querySelectorAll('.btn-activate').forEach(function (btn) {
      btn.addEventListener('click', handleActivateClick);
    });
    queueTypeList.querySelectorAll('.btn-deactivate').forEach(function (btn) {
      btn.addEventListener('click', handleDeactivateClick);
    });
  }

  /**
   * Handle form submission for creating or updating a queue type.
   * @param {Event} e - Submit event
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    clearFormErrors();

    const id = queueTypeIdInput.value.trim();
    const name = queueTypeNameInput.value.trim();
    const prefix = queueTypePrefixInput.value.trim().toUpperCase();

    // Client-side validation
    const errors = validateQueueTypeInput(name, prefix);
    if (errors.length > 0) {
      showFormErrors(errors);
      return;
    }

    try {
      let response;
      if (id) {
        // Update existing
        response = await fetch('/api/queue-types/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, prefix: prefix })
        });
      } else {
        // Create new
        response = await fetch('/api/queue-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, prefix: prefix })
        });
      }

      const result = await response.json();

      if (result.success) {
        resetForm();
        loadQueueTypes();
        // Refresh waiting counts if available in admin.js
        if (typeof window.refreshWaitingCounts === 'function') {
          window.refreshWaitingCounts();
        }
      } else {
        // Show server-side validation errors
        const errorMsg = result.error ? result.error.message : 'Gagal menyimpan tipe antrian.';
        showFormErrors([errorMsg]);
      }
    } catch (err) {
      showFormErrors(['Gagal terhubung ke server.']);
    }
  }

  /**
   * Handle edit button click - populate form with existing data.
   * @param {Event} e - Click event
   */
  function handleEditClick(e) {
    const btn = e.currentTarget;
    const id = btn.getAttribute('data-id');
    const name = btn.getAttribute('data-name');
    const prefix = btn.getAttribute('data-prefix');

    queueTypeIdInput.value = id;
    queueTypeNameInput.value = name;
    queueTypePrefixInput.value = prefix;
    btnSaveType.textContent = 'Perbarui';
    btnCancelType.style.display = 'inline-block';

    // Scroll to form
    queueTypeForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Handle activate button click.
   * @param {Event} e - Click event
   */
  async function handleActivateClick(e) {
    const id = e.currentTarget.getAttribute('data-id');
    try {
      const response = await fetch('/api/queue-types/' + id + '/activate', {
        method: 'PATCH'
      });
      const result = await response.json();

      if (result.success) {
        loadQueueTypes();
      } else {
        const errorMsg = result.error ? result.error.message : 'Gagal mengaktifkan tipe antrian.';
        showQueueTypeError(errorMsg);
      }
    } catch (err) {
      showQueueTypeError('Gagal terhubung ke server.');
    }
  }

  /**
   * Handle deactivate button click.
   * @param {Event} e - Click event
   */
  async function handleDeactivateClick(e) {
    const id = e.currentTarget.getAttribute('data-id');
    try {
      const response = await fetch('/api/queue-types/' + id + '/deactivate', {
        method: 'PATCH'
      });
      const result = await response.json();

      if (result.success) {
        loadQueueTypes();
      } else {
        const errorMsg = result.error ? result.error.message : 'Gagal menonaktifkan tipe antrian.';
        showQueueTypeError(errorMsg);
      }
    } catch (err) {
      showQueueTypeError('Gagal terhubung ke server.');
    }
  }

  /**
   * Validate queue type input on the client side.
   * @param {string} name - Queue type name
   * @param {string} prefix - Queue type prefix
   * @returns {string[]} Array of error messages
   */
  function validateQueueTypeInput(name, prefix) {
    var errors = [];

    if (!name || name.length === 0) {
      errors.push('Nama tipe antrian wajib diisi.');
    } else if (name.length > 50) {
      errors.push('Nama tipe antrian maksimal 50 karakter.');
    }

    if (!prefix || prefix.length === 0) {
      errors.push('Kode prefix wajib diisi.');
    } else if (prefix.length > 3) {
      errors.push('Kode prefix maksimal 3 karakter.');
    } else if (!/^[A-Z]+$/.test(prefix)) {
      errors.push('Kode prefix harus berupa huruf kapital (A-Z).');
    }

    return errors;
  }

  /**
   * Reset the queue type form to its initial state.
   */
  function resetForm() {
    queueTypeIdInput.value = '';
    queueTypeNameInput.value = '';
    queueTypePrefixInput.value = '';
    btnSaveType.textContent = 'Simpan';
    btnCancelType.style.display = 'none';
    clearFormErrors();
  }

  /**
   * Show validation errors below the form.
   * @param {string[]} errors - Array of error messages
   */
  function showFormErrors(errors) {
    clearFormErrors();
    var errorDiv = document.createElement('div');
    errorDiv.className = 'form-errors';
    errorDiv.id = 'queue-type-form-errors';
    errorDiv.innerHTML = errors.map(function (msg) {
      return '<p class="error-message">' + escapeHtml(msg) + '</p>';
    }).join('');
    queueTypeForm.appendChild(errorDiv);
  }

  /**
   * Clear form validation errors.
   */
  function clearFormErrors() {
    var existing = document.getElementById('queue-type-form-errors');
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Show a general error message in the queue type list area.
   * @param {string} message - Error message
   */
  function showQueueTypeError(message) {
    // Show a temporary error notification
    var notification = document.createElement('div');
    notification.className = 'notification notification-error';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(function () {
      notification.classList.add('notification-fade');
      setTimeout(function () {
        notification.remove();
      }, 300);
    }, 4000);
  }

  /**
   * Show a success notification.
   * @param {string} message - Success message
   */
  function showSuccessNotification(message) {
    var notification = document.createElement('div');
    notification.className = 'notification notification-success';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(function () {
      notification.classList.add('notification-fade');
      setTimeout(function () {
        notification.remove();
      }, 300);
    }, 4000);
  }

  // ============================================================
  // Reset Functionality
  // ============================================================

  /**
   * Handle "Reset Antrian" button click.
   * Fetches reset info and shows the confirmation dialog.
   */
  async function handleResetClick() {
    try {
      const response = await fetch('/api/admin/reset-info');
      const result = await response.json();

      if (result.success) {
        resetDateEl.textContent = result.data.date;
        resetTotalEl.textContent = result.data.totalQueues;
        resetDialog.style.display = 'flex';
      } else {
        showQueueTypeError('Gagal mengambil informasi reset.');
      }
    } catch (err) {
      showQueueTypeError('Gagal terhubung ke server.');
    }
  }

  /**
   * Handle reset confirmation.
   * Sends POST /api/admin/reset with {confirm: true}.
   */
  async function handleConfirmReset() {
    try {
      btnConfirmReset.disabled = true;
      btnConfirmReset.textContent = 'Memproses...';

      const response = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });

      const result = await response.json();

      if (result.success) {
        resetDialog.style.display = 'none';
        const totalReset = result.data.totalQueues || result.data.summary
          ? Object.values(result.data.summary || {}).reduce(function (sum, item) {
            return sum + (item.total || 0);
          }, 0)
          : 0;
        showSuccessNotification('Reset berhasil! ' + totalReset + ' antrian telah direset.');

        // Refresh data
        loadQueueTypes();
        if (typeof window.refreshWaitingCounts === 'function') {
          window.refreshWaitingCounts();
        }
        if (typeof window.refreshQueueState === 'function') {
          window.refreshQueueState();
        }
      } else {
        resetDialog.style.display = 'none';
        const errorMsg = result.error ? result.error.message : 'Gagal melakukan reset antrian.';
        showQueueTypeError(errorMsg);
      }
    } catch (err) {
      resetDialog.style.display = 'none';
      showQueueTypeError('Gagal melakukan reset. Data antrian tidak berubah.');
    } finally {
      btnConfirmReset.disabled = false;
      btnConfirmReset.textContent = 'Ya, Reset Antrian';
    }
  }

  /**
   * Handle cancel reset - hide the dialog.
   */
  function handleCancelReset() {
    resetDialog.style.display = 'none';
  }

  // ============================================================
  // Utility Functions
  // ============================================================

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str - Input string
   * @returns {string} Escaped string
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape string for use in HTML attributes.
   * @param {string} str - Input string
   * @returns {string} Escaped string
   */
  function escapeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ============================================================
  // Event Binding
  // ============================================================

  if (queueTypeForm) {
    queueTypeForm.addEventListener('submit', handleFormSubmit);
  }

  if (btnCancelType) {
    btnCancelType.addEventListener('click', function () {
      resetForm();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', handleResetClick);
  }

  if (btnConfirmReset) {
    btnConfirmReset.addEventListener('click', handleConfirmReset);
  }

  if (btnCancelReset) {
    btnCancelReset.addEventListener('click', handleCancelReset);
  }

  // Force uppercase on prefix input
  if (queueTypePrefixInput) {
    queueTypePrefixInput.addEventListener('input', function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
  }

  // ============================================================
  // Initialization
  // ============================================================

  // Load queue types on page load
  loadQueueTypes();

  // Expose loadQueueTypes for external refresh (e.g., after socket events)
  window.refreshQueueTypes = loadQueueTypes;
})();
