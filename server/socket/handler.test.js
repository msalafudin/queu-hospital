'use strict';

const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { initializeSocket, displayClients } = require('./handler');

describe('Socket.IO Handler', () => {
  let io, httpServer, clientSocket, port;

  beforeAll((done) => {
    httpServer = http.createServer();
    io = new Server(httpServer);
    initializeSocket(io);
    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    httpServer.close(done);
  });

  beforeEach(() => {
    displayClients.clear();
  });

  afterEach((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    // Small delay to allow disconnect to propagate
    setTimeout(done, 50);
  });

  function connectClient() {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });
  }

  describe('display:register event', () => {
    it('should store loketIds filter when display registers', (done) => {
      clientSocket = connectClient();
      clientSocket.on('connect', () => {
        clientSocket.emit('display:register', { loketIds: [1, 2] });
        setTimeout(() => {
          const client = displayClients.get(clientSocket.id);
          expect(client).toBeDefined();
          expect(client.loketIds).toEqual([1, 2]);
          done();
        }, 100);
      });
    });

    it('should store empty array when loketIds is not provided', (done) => {
      clientSocket = connectClient();
      clientSocket.on('connect', () => {
        clientSocket.emit('display:register', {});
        setTimeout(() => {
          const client = displayClients.get(clientSocket.id);
          expect(client).toBeDefined();
          expect(client.loketIds).toEqual([]);
          done();
        }, 100);
      });
    });

    it('should store empty array when data is null', (done) => {
      clientSocket = connectClient();
      clientSocket.on('connect', () => {
        clientSocket.emit('display:register', null);
        setTimeout(() => {
          const client = displayClients.get(clientSocket.id);
          expect(client).toBeDefined();
          expect(client.loketIds).toEqual([]);
          done();
        }, 100);
      });
    });
  });

  describe('disconnect event', () => {
    it('should remove client from displayClients on disconnect', (done) => {
      clientSocket = connectClient();
      clientSocket.on('connect', () => {
        clientSocket.emit('display:register', { loketIds: [1] });
        setTimeout(() => {
          expect(displayClients.size).toBe(1);
          clientSocket.disconnect();
          setTimeout(() => {
            expect(displayClients.has(clientSocket.id)).toBe(false);
            done();
          }, 100);
        }, 100);
      });
    });
  });

  describe('broadcast functions', () => {
    let broadcast;

    beforeAll(() => {
      // Re-initialize to get broadcast functions
      broadcast = initializeSocket(io);
    });

    describe('emitQueueUpdated', () => {
      it('should broadcast queue:updated to all connected clients', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.on('queue:updated', (payload) => {
            expect(payload).toEqual({
              queueTypeId: 1,
              waitingCount: 5,
              totalToday: 10
            });
            done();
          });
          setTimeout(() => {
            broadcast.emitQueueUpdated({
              queueTypeId: 1,
              waitingCount: 5,
              totalToday: 10
            });
          }, 50);
        });
      });
    });

    describe('emitQueueCalled', () => {
      it('should emit to display client whose filter includes the loketId', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.emit('display:register', { loketIds: [1, 2] });
          clientSocket.on('queue:called', (payload) => {
            expect(payload.loketId).toBe(1);
            expect(payload.number).toBe('A-001');
            done();
          });
          setTimeout(() => {
            broadcast.emitQueueCalled({
              number: 'A-001',
              queueTypeId: 1,
              queueTypeName: 'Pendaftaran',
              loketId: 1,
              loketName: 'Loket 1',
              timestamp: '2025-01-15T08:30:00'
            });
          }, 100);
        });
      });

      it('should emit to display client with empty filter (show all)', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.emit('display:register', { loketIds: [] });
          clientSocket.on('queue:called', (payload) => {
            expect(payload.loketId).toBe(3);
            done();
          });
          setTimeout(() => {
            broadcast.emitQueueCalled({
              number: 'B-002',
              queueTypeId: 2,
              queueTypeName: 'Kasir',
              loketId: 3,
              loketName: 'Loket 3',
              timestamp: '2025-01-15T08:35:00'
            });
          }, 100);
        });
      });

      it('should NOT emit to display client whose filter does not include the loketId', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.emit('display:register', { loketIds: [2, 3] });
          clientSocket.on('queue:called', () => {
            done.fail('Should not have received queue:called');
          });
          setTimeout(() => {
            broadcast.emitQueueCalled({
              number: 'A-001',
              queueTypeId: 1,
              queueTypeName: 'Pendaftaran',
              loketId: 1,
              loketName: 'Loket 1',
              timestamp: '2025-01-15T08:30:00'
            });
            // Wait a bit to confirm no event received
            setTimeout(done, 200);
          }, 100);
        });
      });
    });

    describe('emitQueueRecalled', () => {
      it('should emit to display client whose filter includes the loketId', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.emit('display:register', { loketIds: [1] });
          clientSocket.on('queue:recalled', (payload) => {
            expect(payload.loketId).toBe(1);
            expect(payload.number).toBe('A-001');
            done();
          });
          setTimeout(() => {
            broadcast.emitQueueRecalled({
              number: 'A-001',
              queueTypeId: 1,
              queueTypeName: 'Pendaftaran',
              loketId: 1,
              loketName: 'Loket 1',
              timestamp: '2025-01-15T08:30:00'
            });
          }, 100);
        });
      });

      it('should NOT emit to display client whose filter does not include the loketId', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.emit('display:register', { loketIds: [2] });
          clientSocket.on('queue:recalled', () => {
            done.fail('Should not have received queue:recalled');
          });
          setTimeout(() => {
            broadcast.emitQueueRecalled({
              number: 'A-001',
              queueTypeId: 1,
              queueTypeName: 'Pendaftaran',
              loketId: 1,
              loketName: 'Loket 1',
              timestamp: '2025-01-15T08:30:00'
            });
            setTimeout(done, 200);
          }, 100);
        });
      });
    });

    describe('emitQueueReset', () => {
      it('should broadcast queue:reset to all connected clients', (done) => {
        clientSocket = connectClient();
        clientSocket.on('connect', () => {
          clientSocket.on('queue:reset', (payload) => {
            expect(payload).toEqual({
              date: '2025-01-15',
              resetBy: 'admin'
            });
            done();
          });
          setTimeout(() => {
            broadcast.emitQueueReset({
              date: '2025-01-15',
              resetBy: 'admin'
            });
          }, 50);
        });
      });
    });
  });
});
