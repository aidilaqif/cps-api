const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  },
  // Add timezone configuration
  timezone: 'Asia/Kuala_Lumpur',
  // Set session parameters
  connectionTimeZone: 'Asia/Kuala_Lumpur',
});

// Test database connection
pool.on('connect', (client) => {
  client.query('SET timezone="Asia/Kuala_Lumpur";', (err) => {
    if (err) {
      console.error('Error setting timezone:', err);
    }
  });
  console.log('Successfully connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

module.exports = pool;