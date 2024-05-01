const { Pool } = require('pg');
require('dotenv').config()

let pool;

function getPool() {
    if (!pool) {
        pool = new Pool({
            user: process.env.DB_USERNAME,
            host: process.env.DB_HOSTNAME,
            database: process.env.DB_DATABASE,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
        });

        pool.on('connect', () => {
            console.log('Connected to the database');
        });
    }
    return pool;
}

module.exports = getPool();
