'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path - stored locally in data/ directory
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'antrian.db');

// Migrations directory
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Ensure the data directory exists for the database file.
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Run all SQL migration files from the migrations directory in alphabetical order.
 * Uses a simple tracking table to avoid re-running migrations.
 * @param {Database.Database} db - The database instance
 */
function runMigrations(db) {
  // Create migrations tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Read all .sql files from migrations directory
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }

  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Alphabetical order ensures correct execution sequence (001_, 002_, etc.)

  if (migrationFiles.length === 0) {
    return;
  }

  // Get already applied migrations
  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map(row => row.filename)
  );

  // Run pending migrations within a transaction
  const runPending = db.transaction(() => {
    for (const file of migrationFiles) {
      if (applied.has(file)) {
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      db.exec(sql);

      db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
    }
  });

  runPending();
}

/**
 * Initialize and return the database instance.
 * - Creates the data directory if it doesn't exist
 * - Opens (or creates) the SQLite database file
 * - Enables WAL mode for concurrent read performance
 * - Runs any pending migrations
 */
function initializeDatabase() {
  ensureDataDir();

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

// Initialize the database instance (singleton)
const db = initializeDatabase();

module.exports = db;
