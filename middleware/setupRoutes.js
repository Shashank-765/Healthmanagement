const express = require('express');
const patientRoute = require("../routes/patientRoute");
const doctorRoute = require("../routes/doctorRoute");
const adminRoute = require("../routes/adminRoute");
const appointmentRoute = require("../routes/appointmentRoute"); 
const medicalHistoryRoutes = require("../routes/medicalHistoryRoutes");
const insuranceRoute = require("../routes/insuranceRoute");

const setupRoutes = (app) => {
    app.use('/api/v1/doctor', doctorRoute);
    app.use('/api/v1/admin', adminRoute);
    app.use('/api/v1/appointment', appointmentRoute);
    app.use('/api/v1/patient', patientRoute);
    app.use('/api/v1/medical-history', medicalHistoryRoutes);
    app.use('/api/v1/insurance', insuranceRoute);
};

module.exports = setupRoutes;