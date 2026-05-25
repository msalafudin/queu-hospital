# Implementation Plan: Hospital Queue System

## Overview

Implementasi Sistem Antrian Rumah Sakit menggunakan Node.js + Express backend, SQLite database (better-sqlite3), Socket.IO untuk real-time communication, Vanilla JavaScript frontend, ESC/POS thermal printer via node-thermal-printer, dan Web Audio API untuk sound announcements. Tasks disusun berdasarkan dependency: setup proyek → database → services → API → socket → frontend → integrasi.

## Tasks

- [x] 1. Setup project structure and dependencies
  - [x] 1.1 Initialize Node.js project and install dependencies
    - Initialize `package.json` with project metadata
    - Install dependencies: `express`, `better-sqlite3`, `socket.io`, `node-thermal-printer`, `cors`
    - Install dev dependencies: `jest`, `fast-check`, `supertest`, `socket.io-client`, `nodemon`
    - Configure `npm scripts`: start, dev, test, test:integration, test:all
    - Create directory structure: `server/`, `server/routes/`, `server/services/`, `server/socket/`, `server/migrations/`, `public/patient/`, `public/admin/`, `public/display/`, `public/shared/`, `public/audio/`
    - _Requirements: 6.4_

  - [x] 1.2 Create database schema and migration
    - Create `server/migrations/001_initial.sql` with all tables: `queue_types`, `lokets`, `queue_numbers`, `daily_counters`, `daily_recaps`
    - Include CHECK constraints, indexes, and foreign keys as defined in design
    - Insert default data: 4 queue types (Pendaftaran/A, Kasir/B, Farmasi/C, Fast Track/D) and 5 lokets
    - _Requirements: 5.6, 1.1_

  - [x] 1.3 Implement database connection module
    - Create `server/database.js` with better-sqlite3 connection setup
    - Enable WAL mode for concurrent read performance
    - Implement migration runner that executes SQL files from `server/migrations/`
    - Export db instance for use by services
    - _Requirements: 6.4_

- [x] 2. Implement backend services (business logic)
  - [x] 2.1 Implement Queue Type Service
    - Create `server/services/queueTypeService.js`
    - Implement `getAll()`, `getActive()`, `create(name, prefix)`, `update(id, name, prefix)`, `deactivate(id)`, `activate(id)`
    - Implement `validate(name, prefix, excludeId?)` with rules: name 1-50 chars, prefix 1-3 uppercase alpha, prefix unique
    - Reject deactivation if queue type has active queues (status waiting/serving) on current day
    - Prevent deletion of default queue types
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x]* 2.2 Write property tests for Queue Type validation
    - **Property 10: Validasi Tipe Antrian**
    - **Validates: Requirements 5.1, 5.5, 5.7**

  - [x]* 2.3 Write property test for deactivation rejection
    - **Property 11: Penolakan Penonaktifan Tipe dengan Antrian Aktif**
    - **Validates: Requirements 5.4**

  - [x] 2.4 Implement Queue Service - takeNumber
    - Create `server/services/queueService.js`
    - Implement `takeNumber(queueTypeId)` with atomic counter using transaction (INSERT ON CONFLICT DO UPDATE)
    - Generate queue number format `PREFIX-NNN` (3-digit zero-padded)
    - Insert into `queue_numbers` with status 'waiting'
    - Return queue number, type info, timestamp, and waiting count ahead
    - _Requirements: 1.1, 1.4, 1.7_

  - [x]* 2.5 Write property tests for queue number format
    - **Property 1: Format Nomor Antrian**
    - **Validates: Requirements 1.1**

  - [x]* 2.6 Write property test for FIFO ordering
    - **Property 3: Urutan FIFO pada Daftar Tunggu**
    - **Validates: Requirements 1.4, 2.1**

  - [x]* 2.7 Write property test for concurrent uniqueness
    - **Property 4: Keunikan Nomor Antrian pada Akses Bersamaan**
    - **Validates: Requirements 1.7**

  - [x] 2.8 Implement Queue Service - callNext and recallCurrent
    - Implement `callNext(queueTypeId, loketId)`: get earliest waiting queue for type, update status to 'serving', set loket_id and called_at
    - Implement `recallCurrent(loketId)`: get currently serving queue for loket, return data for re-announcement
    - Implement `getWaitingCount(queueTypeId)`, `getCurrentServing(loketId?)`, `getQueueState()`
    - Return null/error when no queue waiting or no active serving
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

  - [x]* 2.9 Write property test for waiting count consistency
    - **Property 5: Konsistensi Jumlah Antrian Menunggu**
    - **Validates: Requirements 2.4**

  - [x] 2.10 Implement Reset Service
    - Create `server/services/resetService.js`
    - Implement `getResetInfo()`: return current date and total active queues count
    - Implement `performReset()`: within a single transaction, save recap (date, per-type summary with total/served/unserved), then delete all queue_numbers and daily_counters for current day
    - If recap save fails, rollback entire transaction (all-or-nothing)
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x]* 2.11 Write property test for reset recap accuracy
    - **Property 13: Reset Menghasilkan Rekap yang Akurat**
    - **Validates: Requirements 7.2, 7.3**

  - [x]* 2.12 Write property test for reset atomicity
    - **Property 14: Atomicity Reset (All-or-Nothing)**
    - **Validates: Requirements 7.5**

- [x] 3. Checkpoint - Ensure all backend service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement REST API routes
  - [x] 4.1 Implement Queue Type API routes
    - Create `server/routes/queueType.js`
    - `GET /api/queue-types` - list all queue types
    - `GET /api/queue-types/active` - list active queue types only
    - `POST /api/queue-types` - create new queue type (validate name, prefix)
    - `PUT /api/queue-types/:id` - update queue type
    - `PATCH /api/queue-types/:id/activate` - activate queue type
    - `PATCH /api/queue-types/:id/deactivate` - deactivate queue type (reject if active queues)
    - Return consistent error response format with error codes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [x] 4.2 Implement Queue API routes
    - Create `server/routes/queue.js`
    - `POST /api/queue/take` - take queue number (body: {queueTypeId})
    - `POST /api/queue/call-next` - call next queue (body: {queueTypeId, loketId})
    - `POST /api/queue/recall` - recall current queue (body: {loketId})
    - `GET /api/queue/state` - get full queue state
    - `GET /api/queue/waiting-count` - get waiting counts per type
    - Handle errors: queue empty, no active serving, invalid input
    - _Requirements: 1.1, 1.2, 1.6, 2.1, 2.2, 2.6, 2.7_

  - [x] 4.3 Implement Admin API routes
    - Create `server/routes/admin.js`
    - `GET /api/admin/reset-info` - get reset confirmation info (date, total queues)
    - `POST /api/admin/reset` - perform reset (body: {confirm: true})
    - `GET /api/admin/recaps` - list daily recaps
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.4 Implement Express server entry point
    - Create `server/index.js`
    - Initialize Express app with JSON body parser and CORS
    - Serve static files from `public/` directory
    - Mount all API routes
    - Initialize database connection and run migrations on startup
    - Initialize Socket.IO server (attached to HTTP server)
    - Start server on configurable port (default 3000)
    - _Requirements: 6.4_

  - [x]* 4.5 Write unit tests for API routes
    - Test queue take endpoint with valid/invalid input
    - Test call-next on empty queue returns appropriate error
    - Test queue type CRUD with validation errors
    - Test reset endpoint with confirmation flow
    - _Requirements: 1.6, 2.2, 5.5, 7.5_

- [x] 5. Implement Socket.IO real-time communication
  - [x] 5.1 Implement Socket.IO server handler
    - Create `server/socket/handler.js`
    - Handle `display:register` event: store client's loket filter (loketIds array)
    - Implement broadcast functions: `emitQueueUpdated`, `emitQueueCalled`, `emitQueueRecalled`, `emitQueueReset`
    - For `queue:called` and `queue:recalled`: emit only to display clients whose filter includes the loket
    - For `queue:updated` and `queue:reset`: broadcast to all connected clients
    - _Requirements: 6.1, 6.2, 3.2, 3.10, 3.11_

  - [x] 5.2 Integrate Socket.IO emissions into API routes
    - After successful `takeNumber`: emit `queue:updated` to all clients
    - After successful `callNext`: emit `queue:called` to filtered displays, `queue:updated` to all
    - After successful `recall`: emit `queue:recalled` to filtered displays
    - After successful `reset`: emit `queue:reset` to all clients
    - _Requirements: 6.1, 3.2_

  - [x] 5.3 Implement shared Socket.IO client wrapper
    - Create `public/shared/socket-client.js`
    - Configure reconnection: Phase 1 (3s interval, 10 attempts), Phase 2 (10s interval, indefinite)
    - On disconnect: show connection lost indicator, preserve last known data
    - On reconnect: request full state sync from server, hide indicator
    - Export reusable connection instance and event helpers
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_

- [x] 6. Checkpoint - Ensure backend API and Socket.IO tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Halaman Pasien (Patient Page)
  - [x] 7.1 Create Patient page HTML and CSS
    - Create `public/patient/index.html` with layout for queue type buttons and result display
    - Create `public/patient/patient.css` with responsive styling for kiosk touch interface
    - Display queue type buttons dynamically based on active types
    - Show result area: queue number (large), type name, timestamp
    - Show error/warning messages area
    - Show "no service available" message when no active queue types
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 7.2 Implement Patient page JavaScript logic
    - Create `public/patient/patient.js`
    - On load: fetch active queue types from `GET /api/queue-types/active`, render buttons
    - On button click: `POST /api/queue/take` with selected queueTypeId
    - Display result: queue number, type, timestamp
    - Handle errors: show error message, don't save incomplete data
    - Listen to Socket.IO `queue:updated` to refresh available types
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

- [x] 8. Implement Halaman Admin (Admin Page)
  - [x] 8.1 Create Admin page HTML and CSS
    - Create `public/admin/index.html` with layout for loket/type selection, call controls, and management panel
    - Create `public/admin/admin.css` with professional admin interface styling
    - Include: loket selector, queue type selector, "Panggil Berikutnya" button, "Panggil Ulang" button
    - Display: currently serving number, loket name, waiting counts per type
    - Include: "Reset Antrian" button, queue type management section (CRUD form)
    - _Requirements: 2.3, 2.4, 2.5, 7.4_

  - [x] 8.2 Implement Admin page JavaScript logic
    - Create `public/admin/admin.js`
    - On load: fetch queue types, lokets, and current state
    - Loket/type selection: filter controls to selected type for selected loket
    - "Panggil Berikutnya": `POST /api/queue/call-next`, update display, show empty message if no waiting
    - "Panggil Ulang": `POST /api/queue/recall`, disable button if no active serving
    - Real-time updates via Socket.IO: update waiting counts on `queue:updated`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 8.3 Implement Queue Type management UI in Admin page
    - Add CRUD form for queue types: name input (max 50 chars), prefix input (1-3 uppercase)
    - Create: `POST /api/queue-types` with validation feedback
    - Update: `PUT /api/queue-types/:id` with validation feedback
    - Activate/Deactivate: `PATCH /api/queue-types/:id/activate|deactivate`
    - Show error messages for: duplicate prefix, active queues preventing deactivation
    - Mark default types as non-deletable in UI
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 8.4 Implement Reset functionality in Admin page
    - "Reset Antrian" button: fetch `GET /api/admin/reset-info` to show confirmation dialog
    - Confirmation dialog: show date, total queue count, require explicit confirm
    - On confirm: `POST /api/admin/reset`, show success message with reset count
    - Handle reset failure: show error message, data unchanged
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [x] 9. Implement Halaman Display (Display Page)
  - [x] 9.1 Create Display page HTML and CSS
    - Create `public/display/index.html` with large-format display layout
    - Create `public/display/display.css` with high-visibility styling (large fonts, high contrast)
    - Layout: grid/cards showing each loket with currently serving number and queue type
    - Include: highlight animation for newly called numbers (5 second duration)
    - Include: connection status indicator (visible when disconnected)
    - Include: "no queue" placeholder for types with no active serving
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_

  - [x] 9.2 Implement Display page JavaScript logic
    - Create `public/display/display.js`
    - On load: parse URL parameter `?loket=1,2` for display filter
    - Register with server via `display:register` event with loketIds
    - Fetch initial state from `GET /api/queue/state`, filter by loket
    - On `queue:called`: update display for called loket, add highlight (remove after 5s)
    - On `queue:updated`: refresh waiting counts
    - On `queue:reset`: clear all displays
    - Show connection lost indicator on disconnect, hide on reconnect
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11_

  - [x]* 9.3 Write property test for Display Filter logic
    - **Property 6: Display Filter Menampilkan Hanya Loket yang Sesuai**
    - **Validates: Requirements 3.7, 3.8, 3.9**

- [x] 10. Implement Sound Engine
  - [x] 10.1 Implement Sound Engine class
    - Implement `SoundEngine` class in `public/display/display.js`
    - `buildAudioSequence(queueNumber, loketName)`: construct array of audio file paths [bell, nomor-antrian, digit1, digit2, digit3, silakan-menuju, loket-N]
    - `announce(queueNumber, loketName)`: play sequence 2 times with pause between repeats
    - `enqueue(announcement)`: add to FIFO queue, process sequentially with 1s gap between announcements
    - Use Web Audio API (AudioContext) for playback and concatenation
    - Preload audio files on page load for instant playback
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 10.2 Integrate Sound Engine with Display events
    - On `queue:called` event (only if loket matches display filter): trigger `announce()`
    - On `queue:recalled` event (only if loket matches display filter): trigger `announce()` with same format
    - If audio playback fails: log error, continue with visual display (no UI disruption)
    - _Requirements: 4.1, 4.4, 4.6, 3.10_

  - [x]* 10.3 Write property test for audio sequence construction
    - **Property 8: Konstruksi Sequence Audio**
    - **Validates: Requirements 4.1**

  - [x]* 10.4 Write property test for sound routing
    - **Property 7: Sound Routing Berdasarkan Display Filter**
    - **Validates: Requirements 3.10**

  - [x]* 10.5 Write property test for sound FIFO queue
    - **Property 9: Antrian Sound FIFO**
    - **Validates: Requirements 4.5**

- [x] 11. Implement Printer Service
  - [x] 11.1 Implement server-side printer service
    - Create `server/services/printerService.js`
    - Configure `node-thermal-printer` with ESC/POS type
    - Implement `printTicket(ticketData)`: format and print ticket with header (RSI Muhammadiyah 2 Kendal), large queue number, type, datetime, waiting count
    - Implement `checkPrinterStatus()`: return connection status
    - Implement `reprintTicket(queueNumberId)`: fetch ticket data and reprint
    - _Requirements: 8.1, 8.2, 8.3, 8.7_

  - [x] 11.2 Integrate printer into queue take flow
    - After successful `takeNumber` in queue route: call `printTicket()` 
    - If printer offline: still save queue number, return success with printer warning
    - If print fails: return success with error message and reprint option
    - Add `POST /api/queue/reprint/:id` endpoint for reprint functionality
    - _Requirements: 8.1, 8.4, 8.5, 8.6_

  - [ ]* 11.3 Write property test for ticket content completeness
    - **Property 15: Kelengkapan Informasi Tiket**
    - **Validates: Requirements 8.2**

- [x] 12. Checkpoint - Ensure all frontend and integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create audio placeholder files and shared styles
  - [x] 13.1 Create audio placeholder files and shared CSS
    - Create placeholder MP3 files in `public/audio/`: bell.mp3, nomor-antrian.mp3, silakan-menuju.mp3, 0.mp3-9.mp3, loket-1.mp3 through loket-5.mp3
    - Create `public/shared/common.css` with shared styles (reset, typography, colors, responsive utilities)
    - Create `README.md` with project setup instructions, audio file requirements, and deployment guide
    - _Requirements: 4.3_

- [x] 14. Final integration and wiring
  - [x] 14.1 Wire all components together and verify end-to-end flow
    - Verify server starts correctly with all routes, socket, and database initialized
    - Verify patient page loads, shows active queue types, takes number, triggers print
    - Verify admin page loads, selects loket/type, calls next, recalls, manages types, resets
    - Verify display page loads with filter, shows called numbers, plays sound, highlights
    - Verify Socket.IO broadcasts update all connected clients in real-time
    - Verify reconnection strategy works (disconnect → reconnect → state sync)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 14.2 Write integration tests for end-to-end flows
    - Test: take number → call next → display receives update
    - Test: multiple displays with different filters receive correct events
    - Test: reset clears all data and notifies all clients
    - Test: reconnection syncs latest state
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 14.3 Write property test for active type filtering on patient page
    - **Property 2: Hanya Tipe Antrian Aktif yang Ditampilkan**
    - **Validates: Requirements 1.3, 5.3**

  - [ ]* 14.4 Write property test for queue type modification preserving existing queues
    - **Property 12: Modifikasi Tipe Antrian Mempertahankan Antrian Existing**
    - **Validates: Requirements 5.2**

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Audio placeholder files should be replaced with actual recordings (human voice or TTS) before production use
- Printer integration requires physical thermal printer connected to the kiosk machine for full testing
- The system runs entirely on local network without internet dependency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.4"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.5", "2.6", "2.7", "2.8"] },
    { "id": 4, "tasks": ["2.9", "2.10"] },
    { "id": 5, "tasks": ["2.11", "2.12", "4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5"] },
    { "id": 7, "tasks": ["5.1", "5.3"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["7.1", "8.1", "9.1", "13.1"] },
    { "id": 10, "tasks": ["7.2", "8.2", "8.3", "8.4", "9.2"] },
    { "id": 11, "tasks": ["9.3", "10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3", "10.4", "10.5", "11.1"] },
    { "id": 13, "tasks": ["11.2", "11.3"] },
    { "id": 14, "tasks": ["14.1"] },
    { "id": 15, "tasks": ["14.2", "14.3", "14.4"] }
  ]
}
```
