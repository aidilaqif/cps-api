const express = require('express'); // Import Express.js framewaork - main web app framework
const cors = require('cors'); // Allow API to be accessed from different domains/origins

require('dotenv').config(); // Load environment variables from .env file

const app = express(); // Creates new Express app instance

const port = process.env.PORT || 3000; // Sets the port for server to run

// Middlewares
app.use(cors()); // Enables CORS for all routes
app.use(express.json()); // Parse incoming JSON payloads in request bodies

// Import routes
const labelRoutes = require('./routes/label.routes');

// Use routes
app.use('/cps-api', labelRoutes); // Mounts the label routes under the '/api' path prefix

// Simple error handler
app.use((err, req, res, next) => {
    res.status(500).json({
        message: err.message || 'Internal Server Error'
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});