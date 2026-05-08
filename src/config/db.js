const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function connectDatabase() {
  try {
    const client = await pool.connect();
    client.release();
    console.log('Connected to PostgreSQL');
  } catch (error) {
    console.error('PostgreSQL connection error:', error.message);
    throw error;
  }
}

module.exports = {
  pool,
  connectDatabase
};