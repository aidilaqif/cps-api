const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Import routes
const labelRoutes = require('./routes/label.routes');

// Use routes
app.use('/cps-api', labelRoutes);

// Test route
app.get('/cps-api/test', (req, res) => {
    res.json({
        message: 'API is working!',
        timestamp: new Date().toISOString(),
        environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            port: port
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    res.status(500).json({
        message: err.message || 'Internal Server Error'
    });
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
    console.log(`Test endpoint: http://localhost:${port}/cps-api/test`);
});