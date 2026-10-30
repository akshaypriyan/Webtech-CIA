require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { testConnection } = require('./config/db');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARES
// ==========================================

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse incoming JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Request logger for development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// ==========================================
// API ROUTES
// ==========================================

// Mount all REST API endpoints under /api
app.use('/api', apiRoutes);

// Catch-all 404 for undefined /api routes
app.use('/api/*', notFoundHandler);

// Fallback route for root to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Centralized error handling middleware
app.use(errorHandler);

// ==========================================
// SERVER INITIALIZATION
// ==========================================

async function startServer() {
  // Test MySQL connection on boot
  await testConnection();

  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` Online Marketplace Server is Running!`);
    console.log(` Local URL: http://localhost:${PORT}`);
    console.log(` API Base:  http://localhost:${PORT}/api`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===============================================`);
  });
}

// Start server when run directly from command line
if (require.main === module) {
  startServer();
}

module.exports = app;
