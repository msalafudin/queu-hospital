'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Mock the database module with a factory that creates an in-memory db
jest.mock('../database', () => {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');

  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migration
  const migrationPath = path.join(__dirname, '..', 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  db.exec(sql);

  return db;
});

const queueTypeService = require('./queueTypeService');
const db = require('../database');

afterAll(() => {
  db.close();
});

describe('QueueTypeService', () => {
  describe('getAll()', () => {
    it('should return all queue types including inactive ones', () => {
      const result = queueTypeService.getAll();
      expect(result).toHaveLength(4); // 4 default types
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('prefix');
      expect(result[0]).toHaveProperty('isActive');
      expect(result[0]).toHaveProperty('isDefault');
    });

    it('should return default queue types with correct data', () => {
      const result = queueTypeService.getAll();
      const names = result.map(r => r.name);
      expect(names).toContain('Pendaftaran');
      expect(names).toContain('Kasir');
      expect(names).toContain('Farmasi');
      expect(names).toContain('Fast Track');
    });

    it('should map isActive and isDefault as booleans', () => {
      const result = queueTypeService.getAll();
      result.forEach(qt => {
        expect(typeof qt.isActive).toBe('boolean');
        expect(typeof qt.isDefault).toBe('boolean');
      });
    });
  });

  describe('getActive()', () => {
    it('should return only active queue types', () => {
      const result = queueTypeService.getActive();
      expect(result.length).toBeGreaterThan(0);
      result.forEach(qt => {
        expect(qt.isActive).toBe(true);
      });
    });

    it('should not include deactivated queue types', () => {
      // Create and deactivate a type
      const created = queueTypeService.create('Test Inactive', 'TI');
      db.prepare('UPDATE queue_types SET is_active = 0 WHERE id = ?').run(created.id);

      const active = queueTypeService.getActive();
      const found = active.find(qt => qt.id === created.id);
      expect(found).toBeUndefined();

      // Cleanup
      db.prepare('DELETE FROM queue_types WHERE id = ?').run(created.id);
    });
  });

  describe('validate()', () => {
    it('should pass for valid name and prefix', () => {
      const result = queueTypeService.validate('Test Type', 'TT');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for empty name', () => {
      const result = queueTypeService.validate('', 'TT');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tidak boleh kosong');
    });

    it('should fail for name longer than 50 characters', () => {
      const longName = 'A'.repeat(51);
      const result = queueTypeService.validate(longName, 'TT');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('maksimal 50 karakter');
    });

    it('should accept name with exactly 50 characters', () => {
      const name50 = 'A'.repeat(50);
      const result = queueTypeService.validate(name50, 'TT');
      expect(result.valid).toBe(true);
    });

    it('should accept name with exactly 1 character', () => {
      const result = queueTypeService.validate('X', 'TT');
      expect(result.valid).toBe(true);
    });

    it('should fail for empty prefix', () => {
      const result = queueTypeService.validate('Test', '');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('prefix tidak boleh kosong');
    });

    it('should fail for prefix longer than 3 characters', () => {
      const result = queueTypeService.validate('Test', 'ABCD');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('prefix maksimal 3 karakter');
    });

    it('should fail for lowercase prefix', () => {
      const result = queueTypeService.validate('Test', 'ab');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('huruf kapital');
    });

    it('should fail for prefix with numbers', () => {
      const result = queueTypeService.validate('Test', 'A1');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('huruf kapital');
    });

    it('should fail for duplicate prefix', () => {
      // 'A' is already used by Pendaftaran
      const result = queueTypeService.validate('New Type', 'A');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('prefix sudah digunakan');
    });

    it('should allow same prefix when excludeId matches', () => {
      // Get the ID of Pendaftaran (prefix 'A')
      const pendaftaran = db.prepare("SELECT id FROM queue_types WHERE prefix = 'A'").get();
      const result = queueTypeService.validate('Pendaftaran Updated', 'A', pendaftaran.id);
      expect(result.valid).toBe(true);
    });

    it('should accept prefix with 1 character', () => {
      const result = queueTypeService.validate('Test', 'Z');
      expect(result.valid).toBe(true);
    });

    it('should accept prefix with 3 characters', () => {
      const result = queueTypeService.validate('Test', 'XYZ');
      expect(result.valid).toBe(true);
    });
  });

  describe('create()', () => {
    afterEach(() => {
      // Clean up non-default types created during tests
      db.prepare('DELETE FROM queue_types WHERE is_default = 0').run();
    });

    it('should create a new queue type with valid data', () => {
      const result = queueTypeService.create('Laboratorium', 'LAB');
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Laboratorium');
      expect(result.prefix).toBe('LAB');
      expect(result.isActive).toBe(true);
      expect(result.isDefault).toBe(false);
    });

    it('should trim name and uppercase prefix', () => {
      const result = queueTypeService.create('  Radiologi  ', 'rad');
      expect(result.name).toBe('Radiologi');
      expect(result.prefix).toBe('RAD');
    });

    it('should throw VALIDATION_ERROR for empty name', () => {
      expect(() => queueTypeService.create('', 'XX')).toThrow();
      try {
        queueTypeService.create('', 'XX');
      } catch (e) {
        expect(e.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw PREFIX_DUPLICATE for existing prefix', () => {
      expect(() => queueTypeService.create('Duplicate', 'A')).toThrow();
      try {
        queueTypeService.create('Duplicate', 'A');
      } catch (e) {
        expect(e.code).toBe('PREFIX_DUPLICATE');
      }
    });
  });

  describe('update()', () => {
    let testTypeId;

    beforeEach(() => {
      const result = db.prepare(
        "INSERT INTO queue_types (name, prefix, is_active, is_default) VALUES ('Test Update', 'TU', 1, 0)"
      ).run();
      testTypeId = result.lastInsertRowid;
    });

    afterEach(() => {
      db.prepare('DELETE FROM queue_types WHERE is_default = 0').run();
    });

    it('should update name and prefix', () => {
      const result = queueTypeService.update(testTypeId, 'Updated Name', 'UN');
      expect(result.name).toBe('Updated Name');
      expect(result.prefix).toBe('UN');
    });

    it('should allow keeping the same prefix on update', () => {
      const result = queueTypeService.update(testTypeId, 'New Name', 'TU');
      expect(result.name).toBe('New Name');
      expect(result.prefix).toBe('TU');
    });

    it('should throw QUEUE_TYPE_NOT_FOUND for non-existent ID', () => {
      expect(() => queueTypeService.update(9999, 'Name', 'XX')).toThrow();
      try {
        queueTypeService.update(9999, 'Name', 'XX');
      } catch (e) {
        expect(e.code).toBe('QUEUE_TYPE_NOT_FOUND');
      }
    });

    it('should throw PREFIX_DUPLICATE when using another types prefix', () => {
      expect(() => queueTypeService.update(testTypeId, 'Name', 'A')).toThrow();
      try {
        queueTypeService.update(testTypeId, 'Name', 'A');
      } catch (e) {
        expect(e.code).toBe('PREFIX_DUPLICATE');
      }
    });
  });

  describe('deactivate()', () => {
    let testTypeId;

    beforeEach(() => {
      const result = db.prepare(
        "INSERT INTO queue_types (name, prefix, is_active, is_default) VALUES ('Test Deactivate', 'TD', 1, 0)"
      ).run();
      testTypeId = result.lastInsertRowid;
    });

    afterEach(() => {
      db.prepare('DELETE FROM queue_numbers WHERE queue_type_id = ?').run(testTypeId);
      db.prepare('DELETE FROM queue_types WHERE is_default = 0').run();
    });

    it('should deactivate a queue type with no active queues', () => {
      queueTypeService.deactivate(testTypeId);
      const row = db.prepare('SELECT is_active FROM queue_types WHERE id = ?').get(testTypeId);
      expect(row.is_active).toBe(0);
    });

    it('should throw QUEUE_TYPE_NOT_FOUND for non-existent ID', () => {
      expect(() => queueTypeService.deactivate(9999)).toThrow();
      try {
        queueTypeService.deactivate(9999);
      } catch (e) {
        expect(e.code).toBe('QUEUE_TYPE_NOT_FOUND');
      }
    });

    it('should reject deactivation when queue type has waiting queues today', () => {
      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO queue_numbers (number, sequence, queue_type_id, status, date)
        VALUES ('TD-001', 1, ?, 'waiting', ?)
      `).run(testTypeId, today);

      expect(() => queueTypeService.deactivate(testTypeId)).toThrow();
      try {
        queueTypeService.deactivate(testTypeId);
      } catch (e) {
        expect(e.code).toBe('QUEUE_TYPE_HAS_ACTIVE');
        expect(e.details.activeCount).toBe(1);
      }
    });

    it('should reject deactivation when queue type has serving queues today', () => {
      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO queue_numbers (number, sequence, queue_type_id, status, date)
        VALUES ('TD-001', 1, ?, 'serving', ?)
      `).run(testTypeId, today);

      expect(() => queueTypeService.deactivate(testTypeId)).toThrow();
      try {
        queueTypeService.deactivate(testTypeId);
      } catch (e) {
        expect(e.code).toBe('QUEUE_TYPE_HAS_ACTIVE');
      }
    });

    it('should allow deactivation when queues are done or skipped', () => {
      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO queue_numbers (number, sequence, queue_type_id, status, date)
        VALUES ('TD-001', 1, ?, 'done', ?)
      `).run(testTypeId, today);
      db.prepare(`
        INSERT INTO queue_numbers (number, sequence, queue_type_id, status, date)
        VALUES ('TD-002', 2, ?, 'skipped', ?)
      `).run(testTypeId, today);

      // Should not throw
      queueTypeService.deactivate(testTypeId);
      const row = db.prepare('SELECT is_active FROM queue_types WHERE id = ?').get(testTypeId);
      expect(row.is_active).toBe(0);
    });

    it('should allow deactivation when active queues are from a different day', () => {
      db.prepare(`
        INSERT INTO queue_numbers (number, sequence, queue_type_id, status, date)
        VALUES ('TD-001', 1, ?, 'waiting', '2020-01-01')
      `).run(testTypeId);

      // Should not throw - queues are from a different day
      queueTypeService.deactivate(testTypeId);
      const row = db.prepare('SELECT is_active FROM queue_types WHERE id = ?').get(testTypeId);
      expect(row.is_active).toBe(0);
    });
  });

  describe('activate()', () => {
    let testTypeId;

    beforeEach(() => {
      const result = db.prepare(
        "INSERT INTO queue_types (name, prefix, is_active, is_default) VALUES ('Test Activate', 'TA', 0, 0)"
      ).run();
      testTypeId = result.lastInsertRowid;
    });

    afterEach(() => {
      db.prepare('DELETE FROM queue_types WHERE is_default = 0').run();
    });

    it('should activate an inactive queue type', () => {
      queueTypeService.activate(testTypeId);
      const row = db.prepare('SELECT is_active FROM queue_types WHERE id = ?').get(testTypeId);
      expect(row.is_active).toBe(1);
    });

    it('should throw QUEUE_TYPE_NOT_FOUND for non-existent ID', () => {
      expect(() => queueTypeService.activate(9999)).toThrow();
      try {
        queueTypeService.activate(9999);
      } catch (e) {
        expect(e.code).toBe('QUEUE_TYPE_NOT_FOUND');
      }
    });
  });
});
