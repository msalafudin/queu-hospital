'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public/ directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize database connection and run migrations on startup
const db = require('./database');

// Mount API routes
const queueTypeRoutes = require('./routes/queueType');
const queueRoutes = require('./routes/queue');
const adminRoutes = require('./routes/admin');

app.use('/api/queue-types', queueTypeRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/admin', adminRoutes);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Initialize Socket.IO handler with broadcast functions
const { initializeSocket } = require('./socket/handler');
const socketBroadcast = initializeSocket(io);

// Set broadcast reference for use by route modules
const { setBroadcast } = require('./socket/broadcast');
setBroadcast(socketBroadcast);

// Start server only when run directly (not when required for testing)
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server antrian berjalan di http://localhost:${PORT}`);
  });
}

module.exports = { app, server, io, socketBroadcast };
