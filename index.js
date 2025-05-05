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
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Your frontend URL
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

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

// Mount routes
app.use('/api/v1/patient', patientRoute);
app.use('/api/v1/doctor', doctorRoute);
app.use('/api/v1/admin', adminRoute);
app.use('/api/v1/appointment', appointmentRoute);
app.use('/api/v1/medical-history', medicalHistoryRoutes);
app.use('/api/v1/insurance', insuranceRoute);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    connectDB();
    console.log(`server is running on the port of ${PORT}`);
});
