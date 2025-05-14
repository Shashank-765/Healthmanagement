const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();
const connectDB = require("./database/database");
require('dotenv').config();
const authMiddleware = require("./middleware/middleware");
const setupRoutes = require("./middleware/setupRoutes");
const path = require('path');
const fs = require('fs');

// CORS configuration
// const corsOptions = {
//     origin: 'http://localhost:3000',
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//     allowedHeaders: [
//         'Content-Type', 
//         'Authorization', 
//         'x-user-role',
//         'x-requested-with',
//         'Accept',
//         'Origin',
//         'Access-Control-Allow-Headers',
//         'Access-Control-Allow-Origin'
//     ],
//     exposedHeaders: ['Set-Cookie'],
//     credentials: true,
//     preflightContinue: false,
//     optionsSuccessStatus: 204
// };
const corsOptions = {
    origin: ['http://localhost:3000', 'https://jnr5k30t-3000.inc1.devtunnels.ms'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'x-user-role',
        'x-requested-with',
        'Accept',
        'Origin',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Origin'
    ],
    exposedHeaders: ['Set-Cookie'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Increase timeout for all routes
app.use((req, res, next) => {
    res.setTimeout(60000, () => {
        console.log('Request has timed out.');
        res.status(504).send('Request has timed out.');
    });
    next();
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Setup all routes
setupRoutes(app);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

const PORT = process.env.PORT || 5000;

// Start server
const startServer = async () => {
    try {
        // Connect to database
        await connectDB();
        
        // Start listening
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
