const postgres = require('postgres');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

// SSL is required by Neon (and most managed Postgres) but unavailable on a
// bare local install. Auto-detect Neon via the connection string, and allow
// an explicit DB_SSL=true override for any other remote/cloud DB.
const isNeon = /neon\.tech/.test(process.env.DATABASE_URL || '');
const useSSL = process.env.DB_SSL === 'true' || isNeon;

const sql = postgres(process.env.DATABASE_URL, {
  ssl: useSSL ? 'require' : false,
  max: 10,             // max connections in pool
  idle_timeout: 30,
});

module.exports = sql;