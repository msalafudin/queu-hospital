-- ============================================
-- Hospital Queue System - Initial Schema
-- ============================================

-- Tipe Antrian
CREATE TABLE queue_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(name) > 0 AND length(name) <= 50),
    prefix TEXT NOT NULL UNIQUE CHECK(length(prefix) >= 1 AND length(prefix) <= 3 AND prefix GLOB '[A-Z]*'),
    is_active INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Loket
CREATE TABLE lokets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    queue_type_id INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (queue_type_id) REFERENCES queue_types(id)
);

-- Nomor Antrian (data harian, direset setiap hari)
CREATE TABLE queue_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    queue_type_id INTEGER NOT NULL,
    loket_id INTEGER,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting', 'serving', 'done', 'skipped')),
    date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    called_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (queue_type_id) REFERENCES queue_types(id),
    FOREIGN KEY (loket_id) REFERENCES lokets(id)
);

-- Counter harian (untuk atomic increment)
CREATE TABLE daily_counters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_type_id INTEGER NOT NULL,
    date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE(queue_type_id, date),
    FOREIGN KEY (queue_type_id) REFERENCES queue_types(id)
);

-- Rekap Harian
CREATE TABLE daily_recaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Indexes
CREATE INDEX idx_queue_numbers_status ON queue_numbers(status, date);
CREATE INDEX idx_queue_numbers_type_date ON queue_numbers(queue_type_id, date);
CREATE INDEX idx_daily_counters_type_date ON daily_counters(queue_type_id, date);

-- ============================================
-- Default Data
-- ============================================

-- Default Queue Types: Pendaftaran (A), Kasir (B), Farmasi (C), Fast Track (D)
INSERT INTO queue_types (name, prefix, is_active, is_default) VALUES
    ('Pendaftaran', 'A', 1, 1),
    ('Kasir', 'B', 1, 1),
    ('Farmasi', 'C', 1, 1),
    ('Fast Track', 'D', 1, 1);

-- Default Lokets
INSERT INTO lokets (name, queue_type_id, is_active) VALUES
    ('Loket 1', 1, 1),
    ('Loket 2', 1, 1),
    ('Loket 3', 2, 1),
    ('Loket 4', 3, 1),
    ('Loket 5', 4, 1);
