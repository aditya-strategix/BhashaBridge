const http = require('http');
const app = require('./app');
const setupSocket = require('./socket');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

// Initialize Prisma
const prisma = new PrismaClient();

const server = http.createServer(app);

// Initialize Socket.IO
const io = setupSocket(server);

// Make prisma available globally if needed, or pass it
global.prisma = prisma;
global.io = io;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
