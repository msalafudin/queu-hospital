'use strict';

const express = require('express');
const request = require('supertest');

// Mock dependencies before requiring the route
jest.mock('../services/queueService');
jest.mock('../services/printerService');
jest.mock('../socket/broadcast', () => ({
  getBroadcast: jest.fn(() => null)
}));

const queueService = require('../services/queueService');
const printerService = require('../services/printerService');
const queueRouter = require('./queue');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/queue', queueRouter);
  return app;
}

describe('POST /api/queue/take - printer integration', () => {
  const mockTakeResult = {
    id: 1,
    number: 'A-001',
    sequence: 1,
    queueType: { id: 1, name: 'Pendaftaran', prefix: 'A' },
    timestamp: '2025-01-15T08:30:00.000Z',
    waitingAhead: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queueService.takeNumber.mockReturnValue(mockTakeResult);
    queueService.getWaitingCount.mockReturnValue(0);
    queueService.getQueueState.mockReturnValue({ totalToday: 1 });
  });

  it('should return success with printer status "success" when print succeeds', async () => {
    printerService.checkPrinterStatus.mockResolvedValue({ connected: true });
    printerService.printTicket.mockResolvedValue({ success: true });

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/take')
      .send({ queueTypeId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.number).toBe('A-001');
    expect(res.body.data.printer.status).toBe('success');
    expect(printerService.printTicket).toHaveBeenCalledWith({
      number: 'A-001',
      queueType: { id: 1, name: 'Pendaftaran', prefix: 'A' },
      timestamp: '2025-01-15T08:30:00.000Z',
      waitingAhead: 0
    });
  });

  it('should return success with printer "offline" when printer is not connected', async () => {
    printerService.checkPrinterStatus.mockResolvedValue({ connected: false });

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/take')
      .send({ queueTypeId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.number).toBe('A-001');
    expect(res.body.data.printer.status).toBe('offline');
    expect(res.body.data.printer.message).toContain('Printer tidak terhubung');
    expect(res.body.data.printer.canReprint).toBe(true);
    expect(res.body.data.printer.reprintId).toBe(1);
    // printTicket should NOT be called when printer is offline
    expect(printerService.printTicket).not.toHaveBeenCalled();
  });

  it('should return success with printer "error" when print fails', async () => {
    printerService.checkPrinterStatus.mockResolvedValue({ connected: true });
    printerService.printTicket.mockResolvedValue({ success: false, error: 'Kertas habis' });

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/take')
      .send({ queueTypeId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.number).toBe('A-001');
    expect(res.body.data.printer.status).toBe('error');
    expect(res.body.data.printer.message).toBe('Kertas habis');
    expect(res.body.data.printer.canReprint).toBe(true);
    expect(res.body.data.printer.reprintId).toBe(1);
  });

  it('should return success with printer "error" when printTicket throws', async () => {
    printerService.checkPrinterStatus.mockResolvedValue({ connected: true });
    printerService.printTicket.mockRejectedValue(new Error('Connection timeout'));

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/take')
      .send({ queueTypeId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.number).toBe('A-001');
    expect(res.body.data.printer.status).toBe('error');
    expect(res.body.data.printer.message).toContain('Connection timeout');
    expect(res.body.data.printer.canReprint).toBe(true);
    expect(res.body.data.printer.reprintId).toBe(1);
  });

  it('should still save queue number even when printer check throws', async () => {
    printerService.checkPrinterStatus.mockRejectedValue(new Error('Unexpected error'));

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/take')
      .send({ queueTypeId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.number).toBe('A-001');
    expect(res.body.data.printer.status).toBe('error');
    expect(res.body.data.printer.canReprint).toBe(true);
  });

  it('should return validation error for missing queueTypeId', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/queue/take')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/queue/reprint/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return success when reprint succeeds', async () => {
    printerService.reprintTicket.mockResolvedValue({ success: true });

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/reprint/1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.printed).toBe(true);
    expect(printerService.reprintTicket).toHaveBeenCalledWith(1);
  });

  it('should return success with printed=false when reprint fails', async () => {
    printerService.reprintTicket.mockResolvedValue({
      success: false,
      error: 'Nomor antrian tidak ditemukan.'
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/reprint/99');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.printed).toBe(false);
    expect(res.body.data.error).toBe('Nomor antrian tidak ditemukan.');
  });

  it('should return validation error for invalid id', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/queue/reprint/abc');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return validation error for negative id', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/queue/reprint/-1');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 500 when reprintTicket throws', async () => {
    printerService.reprintTicket.mockRejectedValue(new Error('DB connection lost'));

    const app = createApp();
    const res = await request(app)
      .post('/api/queue/reprint/1');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PRINTER_ERROR');
  });
});
