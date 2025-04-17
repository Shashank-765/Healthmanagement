const express = require('express');
const app = express();
const connectDB = require("./database/database");
require('dotenv').config();
const patientRoute = require("./routes/patientRoute");
const doctorRoute = require("./routes/doctorRoute");
const authMiddleware = require("./middleware/middleware");
const path = require('path');
const fs = require('fs');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.use('/api/v1/patient', patientRoute);
app.use('/api/v1/doctor', doctorRoute);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    connectDB();
    console.log(`server is running on the port of ${PORT}`);
});
