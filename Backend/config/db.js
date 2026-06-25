const postgres = require('postgres');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

const sql = postgres(process.env.DATABASE_URL, {
  ssl: false,          // set to true only if using a remote/cloud DB
  max: 10,             // max connections in pool
  idle_timeout: 30,
});

module.exports = sql;