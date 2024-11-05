const {Pool} = require('pg'); // Maintains db connections

require('dotenv').config(); // Loads environment variables from .env file

const dbConfig = {
    host: process.env.DB_HOST, // Database host address
    port: parseInt(process.env.DB_PORT), // Database port number
    database: process.env.DB_NAME, // Database name
    user: process.env.DB_USERNAME, // Database user credentials
    password: process.env.DB_PASSWORD, // Database password
    ssl: {
        rejectUnauthoried: false // Allow self-signed certificates
    }
};

const pool = new Pool(dbConfig); // Creates new connection pool

module.exports = pool; // Exports pool instance to be used in other files