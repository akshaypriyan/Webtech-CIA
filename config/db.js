const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool using environment variables
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'marketplace_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test database connection helper
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(' Successfully connected to MySQL database:', process.env.DB_NAME || 'marketplace_db');
    connection.release();
    return true;
  } catch (error) {
    console.error(' MySQL Database Connection Error:', error.message);
    return false;
  }
}

module.exports = {
  pool,
  testConnection
};
