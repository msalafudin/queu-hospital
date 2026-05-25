'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Create an in-memory database for testing
let db;
let queueService;

beforeEach(() => {
  // We need to mock the database module before requiring queueService
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

  // Require queueService after mocking
  queueService = require('./queueService');
});

afterEach(() => {
  db.close();
  jest.restoreAllMocks();
});

describe('queueService', () => {
  describe('getToday', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const today = queueService.getToday();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getWaitingCount', () => {
    it('should return 0 when no queue numbers exist', () => {
      const count = queueService.getWaitingCount(1);
      expect(count).toBe(0);
    });

    it('should count only waiting queue numbers for the specified type', () => {
      const today = queueService.getToday();

      // Insert some queue numbers
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-002', 2, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-003', 3, 1, today, 'serving');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('B-001', 1, 2, today, 'waiting');

      expect(queueService.getWaitingCount(1)).toBe(2);
      expect(queueService.getWaitingCount(2)).toBe(1);
      expect(queueService.getWaitingCount(3)).toBe(0);
    });

    it('should not count queue numbers from other dates', () => {
      const today = queueService.getToday();
      const yesterday = '2020-01-01';

      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, today, 'waiting');
      db.prepare(`INSERT INTO queue_numbers (number, sequence, queue_type_id, date, status) VALUES (?, ?, ?, ?, ?)`)
        .run('A-001', 1, 1, yesterday, 'waiting');

      expect(queueService.getWaitingCount(1)).toBe(1);
    });
  });

  describe('takeNumber', () => {
    it('should generate a queue number with correct format PREFIX-NNN', () => {
      const result = queueService.takeNumber(1); // Pendaftaran, prefix 'A'
      expect(result.number).toBe('A-001');
      expect(result.sequence).toBe(1);
    });

    it('should increment the counter for subsequent calls', () => {
      const result1 = queueService.takeNumber(1);
      const result2 = queueService.takeNumber(1);
      const result3 = queueService.takeNumber(1);

      expect(result1.number).toBe('A-001');
      expect(result2.number).toBe('A-002');
      expect(result3.number).toBe('A-003');
    });

    it('should use the correct prefix for different queue types', () => {
      const resultA = queueService.takeNumber(1); // Pendaftaran -> A
      const resultB = queueService.takeNumber(2); // Kasir -> B
      const resultC = queueService.takeNumber(3); // Farmasi -> C
      const resultD = queueService.takeNumber(4); // Fast Track -> D

      expect(resultA.number).toBe('A-001');
      expect(resultB.number).toBe('B-001');
      expect(resultC.number).toBe('C-001');
      expect(resultD.number).toBe('D-001');
    });

    it('should return queue type info', () => {
      const result = queueService.takeNumber(1);

      expect(result.queueType).toEqual({
        id: 1,
        name: 'Pendaftaran',
        prefix: 'A'
      });
    });

    it('should return a timestamp', () => {
      const result = queueService.takeNumber(1);
      expect(result.timestamp).toBeDefined();
      // Should be a valid ISO timestamp
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should return waitingAhead count', () => {
      const result1 = queueService.takeNumber(1);
      expect(result1.waitingAhead).toBe(0); // First in queue, no one ahead

      const result2 = queueService.takeNumber(1);
      expect(result2.waitingAhead).toBe(1); // One person ahead

      const result3 = queueService.takeNumber(1);
      expect(result3.waitingAhead).toBe(2); // Two people ahead
    });

    it('should insert queue number with status waiting', () => {
      const result = queueService.takeNumber(1);
      const today = queueService.getToday();

      const row = db.prepare(`SELECT * FROM queue_numbers WHERE id = ?`).get(result.id);
      expect(row.status).toBe('waiting');
      expect(row.number).toBe('A-001');
      expect(row.sequence).toBe(1);
      expect(row.queue_type_id).toBe(1);
      expect(row.date).toBe(today);
      expect(row.loket_id).toBeNull();
    });

    it('should throw error for non-existent queue type', () => {
      expect(() => queueService.takeNumber(999)).toThrow('QUEUE_TYPE_NOT_FOUND');
    });

    it('should throw error for inactive queue type', () => {
      // Deactivate queue type 1
      db.prepare(`UPDATE queue_types SET is_active = 0 WHERE id = 1`).run();

      expect(() => queueService.takeNumber(1)).toThrow('QUEUE_TYPE_NOT_FOUND');
    });

    it('should maintain separate counters for different queue types', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(1); // A-002
      queueService.takeNumber(2); // B-001
      const result = queueService.takeNumber(2); // B-002

      expect(result.number).toBe('B-002');
      expect(result.sequence).toBe(2);
    });

    it('should return an id for the created queue number', () => {
      const result = queueService.takeNumber(1);
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('number');
      expect(result.id).toBeGreaterThan(0);
    });
  });

  describe('callNext', () => {
    it('should return null when no waiting queue exists', () => {
      const result = queueService.callNext(1, 1);
      expect(result).toBeNull();
    });

    it('should call the earliest waiting queue number for the type', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(1); // A-002
      queueService.takeNumber(1); // A-003

      const result = queueService.callNext(1, 1);
      expect(result).not.toBeNull();
      expect(result.number).toBe('A-001');
      expect(result.sequence).toBe(1);
    });

    it('should update status to serving and set loket_id and called_at', () => {
      queueService.takeNumber(1); // A-001

      const result = queueService.callNext(1, 1);

      // Verify in database
      const row = db.prepare(`SELECT * FROM queue_numbers WHERE id = ?`).get(result.id);
      expect(row.status).toBe('serving');
      expect(row.loket_id).toBe(1);
      expect(row.called_at).not.toBeNull();
    });

    it('should return correct loket and queue type info', () => {
      queueService.takeNumber(1); // A-001

      const result = queueService.callNext(1, 1);
      expect(result.loketId).toBe(1);
      expect(result.loketName).toBe('Loket 1');
      expect(result.queueTypeId).toBe(1);
      expect(result.queueTypeName).toBe('Pendaftaran');
      expect(result.calledAt).toBeDefined();
    });

    it('should call queues in FIFO order', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(1); // A-002
      queueService.takeNumber(1); // A-003

      const first = queueService.callNext(1, 1);
      expect(first.number).toBe('A-001');

      const second = queueService.callNext(1, 1);
      expect(second.number).toBe('A-002');

      const third = queueService.callNext(1, 1);
      expect(third.number).toBe('A-003');

      // No more waiting
      const fourth = queueService.callNext(1, 1);
      expect(fourth).toBeNull();
    });

    it('should only call queues of the specified type', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(2); // B-001

      const result = queueService.callNext(2, 3); // Call type 2 (Kasir) at Loket 3
      expect(result.number).toBe('B-001');
      expect(result.queueTypeName).toBe('Kasir');
    });

    it('should use loket name from database when available', () => {
      queueService.takeNumber(1); // A-001

      // Loket 1 exists in the database with name 'Loket 1'
      const result = queueService.callNext(1, 1);
      expect(result).not.toBeNull();
      expect(result.loketName).toBe('Loket 1');
    });
  });

  describe('recallCurrent', () => {
    it('should return null when no queue is being served at the loket', () => {
      const result = queueService.recallCurrent(1);
      expect(result).toBeNull();
    });

    it('should return the currently serving queue for the loket', () => {
      queueService.takeNumber(1); // A-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1

      const result = queueService.recallCurrent(1);
      expect(result).not.toBeNull();
      expect(result.number).toBe('A-001');
      expect(result.loketId).toBe(1);
      expect(result.loketName).toBe('Loket 1');
      expect(result.queueTypeName).toBe('Pendaftaran');
      expect(result.calledAt).toBeDefined();
    });

    it('should return a serving queue when multiple have been served at the same loket', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(1); // A-002

      queueService.callNext(1, 1); // Call A-001 at Loket 1

      // Manually set called_at to an earlier time for A-001
      const today = queueService.getToday();
      db.prepare(`UPDATE queue_numbers SET called_at = '2020-01-01T00:00:00.000Z' WHERE number = 'A-001' AND date = ?`).run(today);

      queueService.callNext(1, 1); // Call A-002 at Loket 1

      const result = queueService.recallCurrent(1);
      expect(result).not.toBeNull();
      // Should return the most recently called (A-002 has later called_at)
      expect(result.number).toBe('A-002');
    });

    it('should not return queues from other lokets', () => {
      queueService.takeNumber(1); // A-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1

      const result = queueService.recallCurrent(2); // Check Loket 2
      expect(result).toBeNull();
    });

    it('should not modify any data (read-only operation)', () => {
      queueService.takeNumber(1); // A-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1

      const result1 = queueService.recallCurrent(1);
      const result2 = queueService.recallCurrent(1);

      expect(result1).toEqual(result2);
    });
  });

  describe('getCurrentServing', () => {
    it('should return empty array when no queues are serving', () => {
      const result = queueService.getCurrentServing();
      expect(result).toEqual([]);
    });

    it('should return all currently serving queues when no loketId specified', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(2); // B-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1
      queueService.callNext(2, 3); // Call B-001 at Loket 3

      const result = queueService.getCurrentServing();
      expect(result).toHaveLength(2);
      const numbers = result.map(r => r.number).sort();
      expect(numbers).toEqual(['A-001', 'B-001']);
    });

    it('should filter by loketId when specified', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(2); // B-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1
      queueService.callNext(2, 3); // Call B-001 at Loket 3

      const result = queueService.getCurrentServing(1);
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe('A-001');
      expect(result[0].loketId).toBe(1);
    });

    it('should return empty array for loket with no serving queue', () => {
      queueService.takeNumber(1); // A-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1

      const result = queueService.getCurrentServing(2);
      expect(result).toEqual([]);
    });

    it('should include correct queue type and loket info', () => {
      queueService.takeNumber(1); // A-001
      queueService.callNext(1, 1); // Call A-001 at Loket 1

      const result = queueService.getCurrentServing(1);
      expect(result[0].queueTypeName).toBe('Pendaftaran');
      expect(result[0].loketName).toBe('Loket 1');
      expect(result[0].calledAt).toBeDefined();
    });
  });

  describe('getQueueState', () => {
    it('should return empty state when no queues exist', () => {
      const state = queueService.getQueueState();
      expect(state.serving).toEqual([]);
      expect(state.totalToday).toBe(0);
      expect(state.waitingCounts).toBeDefined();
    });

    it('should include waiting counts for all active queue types', () => {
      const state = queueService.getQueueState();

      // Should have entries for all 4 default queue types
      const typeIds = Object.keys(state.waitingCounts).map(Number);
      expect(typeIds).toContain(1);
      expect(typeIds).toContain(2);
      expect(typeIds).toContain(3);
      expect(typeIds).toContain(4);
    });

    it('should reflect correct waiting counts after taking numbers', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(1); // A-002
      queueService.takeNumber(2); // B-001

      const state = queueService.getQueueState();
      expect(state.waitingCounts[1].count).toBe(2);
      expect(state.waitingCounts[2].count).toBe(1);
      expect(state.waitingCounts[3].count).toBe(0);
      expect(state.totalToday).toBe(3);
    });

    it('should include serving queues', () => {
      queueService.takeNumber(1); // A-001
      queueService.takeNumber(1); // A-002
      queueService.callNext(1, 1); // Call A-001

      const state = queueService.getQueueState();
      expect(state.serving).toHaveLength(1);
      expect(state.serving[0].number).toBe('A-001');
      expect(state.waitingCounts[1].count).toBe(1); // A-002 still waiting
      expect(state.totalToday).toBe(2);
    });

    it('should include queue type metadata in waiting counts', () => {
      const state = queueService.getQueueState();

      expect(state.waitingCounts[1].queueTypeName).toBe('Pendaftaran');
      expect(state.waitingCounts[1].prefix).toBe('A');
      expect(state.waitingCounts[1].queueTypeId).toBe(1);
    });
  });
});
