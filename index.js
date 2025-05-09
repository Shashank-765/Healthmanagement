const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();
const connectDB = require("./database/database");
require('dotenv').config();
const patientRoute = require("./routes/patientRoute");
const doctorRoute = require("./routes/doctorRoute");
const adminRoute = require("./routes/adminRoute");
const appointmentRoute = require("./routes/appointmentRoute");
const authMiddleware = require("./middleware/middleware");
const medicalHistoryRoutes = require("./routes/medicalHistoryRoutes");
const insuranceRoute = require("./routes/insuranceRoute");
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

// Handle preflight requests
// app.options('*', cors(corsOptions)); //error

// Cookie parser middleware
app.use(cookieParser());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
    app.use('/api/v1/doctor', doctorRoute);
    app.use('/api/v1/admin', adminRoute);
app.use('/api/v1/appointment', appointmentRoute);
app.use('/api/v1/patient', patientRoute);
app.use('/api/v1/medical-history', medicalHistoryRoutes);
app.use('/api/v1/insurance', insuranceRoute);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    connectDB();
    console.log(`server is running on the port of ${PORT}`);
});
