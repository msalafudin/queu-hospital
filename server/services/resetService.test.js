'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Create an in-memory database for testing
let db;
let resetService;

beforeEach(() => {
  // Create a fresh in-memory database for each test
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run the migration SQL
  const migrationPath = path.join(__dirname, '..', 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  db.exec(sql);

  // Mock the database module
  jest.resetModules();
  jest.doMock('../database', () => db);

  // Require resetService after mocking
  resetService = require('./resetService');
});

afterEach(() => {
  db.close();
  jest.restoreAllMocks();
});

describe('resetService', () => {
  describe('getToday', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const today = resetService.getToday();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getResetInfo', () => {
    it('should return current date and zero total when no queues exist', () => {
      const info = resetService.getResetInfo();
      expect(info.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(info.totalQueues).toBe(0);
    });

    it('should return correct total count of active queues for today', () => {
      const today = resetService.getToday();

      // Insert queue numbers for today
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-002', 2, 1, today, 'serving');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('B-001', 1, 2, today, 'done');

      const info = resetService.getResetInfo();
      expect(info.totalQueues).toBe(3);
    });

    it('should not count queue numbers from other dates', () => {
      const today = resetService.getToday();
      const yesterday = '2020-01-01';

      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, yesterday, 'waiting');

      const info = resetService.getResetInfo();
      expect(info.totalQueues).toBe(1);
    });
  });

  describe('performReset', () => {
    it('should save a recap with correct date', () => {
      const today = resetService.getToday();

      // Add some queue numbers
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');

      const recap = resetService.performReset();
      expect(recap.date).toBe(today);
      expect(recap.id).toBeDefined();
      expect(recap.createdAt).toBeDefined();
    });

    it('should include per-type summary with total, served, and unserved counts', () => {
      const today = resetService.getToday();

      // Type 1 (Pendaftaran): 2 waiting, 1 serving, 1 done = total 4, served 2, unserved 2
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-002', 2, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-003', 3, 1, today, 'serving');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-004', 4, 1, today, 'done');

      // Type 2 (Kasir): 1 skipped = total 1, served 0, unserved 1
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('B-001', 1, 2, today, 'skipped');

      const recap = resetService.performReset();

      expect(recap.summary['1']).toEqual({
        name: 'Pendaftaran',
        total: 4,
        served: 2,
        unserved: 2
      });

      expect(recap.summary['2']).toEqual({
        name: 'Kasir',
        total: 1,
        served: 0,
        unserved: 1
      });
    });

    it('should not include queue types with zero queues in summary', () => {
      const today = resetService.getToday();

      // Only type 1 has queues
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');

      const recap = resetService.performReset();

      expect(recap.summary['1']).toBeDefined();
      expect(recap.summary['2']).toBeUndefined();
      expect(recap.summary['3']).toBeUndefined();
      expect(recap.summary['4']).toBeUndefined();
    });

    it('should delete all queue_numbers for current day after reset', () => {
      const today = resetService.getToday();

      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-002', 2, 1, today, 'serving');

      resetService.performReset();

      const remaining = db.prepare(`SELECT COUNT(*) as count FROM queue_numbers WHERE date = ?`).get(today);
      expect(remaining.count).toBe(0);
    });

    it('should delete all daily_counters for current day after reset', () => {
      const today = resetService.getToday();

      // Insert daily counters
      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(1, today, 5);
      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(2, today, 3);

      resetService.performReset();

      const remaining = db.prepare(`SELECT COUNT(*) as count FROM daily_counters WHERE date = ?`).get(today);
      expect(remaining.count).toBe(0);
    });

    it('should not delete queue_numbers from other dates', () => {
      const today = resetService.getToday();
      const yesterday = '2020-01-01';

      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, yesterday, 'waiting');

      resetService.performReset();

      const remaining = db.prepare(`SELECT COUNT(*) as count FROM queue_numbers WHERE date = ?`).get(yesterday);
      expect(remaining.count).toBe(1);
    });

    it('should not delete daily_counters from other dates', () => {
      const today = resetService.getToday();
      const yesterday = '2020-01-01';

      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(1, today, 5);
      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(1, yesterday, 10);

      resetService.performReset();

      const remaining = db.prepare(`SELECT COUNT(*) as count FROM daily_counters WHERE date = ?`).get(yesterday);
      expect(remaining.count).toBe(1);
    });

    it('should persist recap in daily_recaps table', () => {
      const today = resetService.getToday();

      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'done');

      const recap = resetService.performReset();

      const savedRecap = db.prepare(`SELECT * FROM daily_recaps WHERE id = ?`).get(recap.id);
      expect(savedRecap).toBeDefined();
      expect(savedRecap.date).toBe(today);
      expect(JSON.parse(savedRecap.summary)).toEqual(recap.summary);
    });

    it('should handle reset with no queues (empty day)', () => {
      const recap = resetService.performReset();

      expect(recap.date).toBe(resetService.getToday());
      expect(recap.summary).toEqual({});
      expect(recap.id).toBeDefined();
    });

    it('should rollback if recap save fails (duplicate date)', () => {
      const today = resetService.getToday();

      // Pre-insert a recap for today to cause a UNIQUE constraint violation
      db.prepare(`INSERT INTO daily_recaps (date, summary) VALUES (?, ?)`)
        .run(today, JSON.stringify({}));

      // Add queue numbers
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(1, today, 1);

      // performReset should throw due to duplicate date
      expect(() => resetService.performReset()).toThrow();

      // Verify data was NOT deleted (rollback occurred)
      const queueCount = db.prepare(`SELECT COUNT(*) as count FROM queue_numbers WHERE date = ?`).get(today);
      expect(queueCount.count).toBe(1);

      const counterCount = db.prepare(`SELECT COUNT(*) as count FROM daily_counters WHERE date = ?`).get(today);
      expect(counterCount.count).toBe(1);
    });

    it('should be atomic - all or nothing', () => {
      const today = resetService.getToday();

      // Add data
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('B-001', 1, 2, today, 'serving');
      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(1, today, 1);
      db.prepare(`INSERT INTO daily_counters (queue_type_id, date, last_number) VALUES (?, ?, ?)`)
        .run(2, today, 1);

      // Successful reset
      const recap = resetService.performReset();

      // All data should be gone
      const queueCount = db.prepare(`SELECT COUNT(*) as count FROM queue_numbers WHERE date = ?`).get(today);
      expect(queueCount.count).toBe(0);

      const counterCount = db.prepare(`SELECT COUNT(*) as count FROM daily_counters WHERE date = ?`).get(today);
      expect(counterCount.count).toBe(0);

      // Recap should exist
      const savedRecap = db.prepare(`SELECT * FROM daily_recaps WHERE date = ?`).get(today);
      expect(savedRecap).toBeDefined();
    });
  });
});
