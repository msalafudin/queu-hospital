'use strict';

const ThermalPrinter = require('node-thermal-printer').printer;
const PrinterTypes = require('node-thermal-printer').types;
const db = require('../database');

/**
 * Printer configuration.
 * Interface can be configured via environment variable PRINTER_INTERFACE.
 * Examples:
 *   - 'tcp://192.168.1.100:9100' (network printer)
 *   - '/dev/usb/lp0' (Linux USB)
 *   - '\\\\localhost\\printer_name' (Windows shared printer)
 *   - 'printer:auto' (auto-detect)
 */
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || 'tcp://localhost:9100';

let printer = null;

/**
 * Initialize the thermal printer instance.
 * Creates a new printer connection with ESC/POS (Epson) type.
 */
function initializePrinter() {
  printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: PRINTER_INTERFACE,
    characterSet: 'PC850_MULTILINGUAL',
    removeSpecialCharacters: false,
    lineCharacter: '=',
    options: {
      timeout: 5000
    }
  });
}

// Initialize on module load
initializePrinter();

/**
 * Format a timestamp to DD/MM/YYYY HH:mm format.
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted date string
 */
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Print a queue ticket with the specified data.
 *
 * Ticket format:
 * ================================
 *        RSI MUHAMMADIYAH 2
 *           KENDAL
 * ================================
 *
 *          [NOMOR BESAR]
 *            A - 001
 *
 * Tipe    : Pendaftaran
 * Tanggal : 15/01/2025 08:30
 * Antrian di depan Anda: 5
 * ================================
 *    Terima kasih, mohon menunggu
 * ================================
 *
 * @param {Object} ticketData - Ticket information
 * @param {string} ticketData.number - Queue number (e.g. "A-001")
 * @param {Object} ticketData.queueType - Queue type info
 * @param {string} ticketData.queueType.name - Queue type name (e.g. "Pendaftaran")
 * @param {string} ticketData.timestamp - ISO timestamp of ticket creation
 * @param {number} ticketData.waitingAhead - Number of people waiting ahead
 * @returns {Promise<{success: boolean, error?: string}>} Print result
 */
async function printTicket(ticketData) {
  try {
    if (!printer) {
      initializePrinter();
    }

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      return {
        success: false,
        error: 'Printer tidak terhubung. Pastikan printer thermal sudah menyala dan terhubung.'
      };
    }

    printer.clear();

    // Header separator
    printer.drawLine();

    // Hospital name - centered
    printer.alignCenter();
    printer.bold(true);
    printer.println('RSI MUHAMMADIYAH 2');
    printer.println('KENDAL');
    printer.bold(false);

    // Header separator
    printer.drawLine();

    // Empty line
    printer.println('');

    // Queue number - large and centered
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(ticketData.number);
    printer.setTextNormal();
    printer.bold(false);

    // Empty line
    printer.println('');

    // Ticket details - left aligned
    printer.alignLeft();
    printer.println(`Tipe    : ${ticketData.queueType.name}`);
    printer.println(`Tanggal : ${formatDateTime(ticketData.timestamp)}`);
    printer.println(`Antrian di depan Anda: ${ticketData.waitingAhead}`);

    // Footer separator
    printer.drawLine();

    // Footer message - centered
    printer.alignCenter();
    printer.println('Terima kasih, mohon menunggu');

    // Footer separator
    printer.drawLine();

    // Feed and cut
    printer.println('');
    printer.println('');
    printer.cut();

    // Execute print
    await printer.execute();

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Gagal mencetak tiket: ${error.message}`
    };
  }
}

/**
 * Check the printer connection status.
 * @returns {Promise<{connected: boolean, error?: string}>} Printer status
 */
async function checkPrinterStatus() {
  try {
    if (!printer) {
      initializePrinter();
    }

    const isConnected = await printer.isPrinterConnected();
    return { connected: isConnected };
  } catch (error) {
    return {
      connected: false,
      error: `Tidak dapat memeriksa status printer: ${error.message}`
    };
  }
}

/**
 * Reprint a ticket by fetching queue number data from the database.
 * @param {number} queueNumberId - The ID of the queue number to reprint
 * @returns {Promise<{success: boolean, error?: string}>} Print result
 */
async function reprintTicket(queueNumberId) {
  try {
    // Fetch queue number data from database
    const queueNumber = db.prepare(`
      SELECT qn.*, qt.name as queue_type_name, qt.prefix as queue_type_prefix
      FROM queue_numbers qn
      JOIN queue_types qt ON qn.queue_type_id = qt.id
      WHERE qn.id = ?
    `).get(queueNumberId);

    if (!queueNumber) {
      return {
        success: false,
        error: 'Nomor antrian tidak ditemukan.'
      };
    }

    // Calculate waiting ahead at time of reprint
    const waitingAhead = db.prepare(`
      SELECT COUNT(*) as count FROM queue_numbers
      WHERE queue_type_id = ? AND date = ? AND status = 'waiting' AND sequence < ?
    `).get(queueNumber.queue_type_id, queueNumber.date, queueNumber.sequence);

    // Build ticket data from database record
    const ticketData = {
      number: queueNumber.number,
      queueType: {
        name: queueNumber.queue_type_name
      },
      timestamp: queueNumber.created_at,
      waitingAhead: waitingAhead.count
    };

    // Print the ticket
    return await printTicket(ticketData);
  } catch (error) {
    return {
      success: false,
      error: `Gagal mencetak ulang tiket: ${error.message}`
    };
  }
}

module.exports = {
  printTicket,
  checkPrinterStatus,
  reprintTicket,
  initializePrinter
};
