// routes/appointmentRoute.js
const express = require('express');
const router = express.Router();
const appointmentController = require('../controller/appointment/appointmentController');
const { authenticateToken } = require('../middleware/middleware');

// Create appointment
router.post('/create',authenticateToken,appointmentController.createAppointment);

// Get patient's appointments
router.get('/patient',authenticateToken,appointmentController.getPatientAppointmentsByName);

// Get all appointments data
router.get('/all-appointments',authenticateToken,appointmentController.getpatientAppointmentsAlldata);

// Get doctor's appointments by ID
router.get('/doctor-appointments/:doctorId',authenticateToken,appointmentController.getDoctorAppointments);

// Update patient status (doctor only)
router.patch('/patient-status',authenticateToken,appointmentController.updatePatientStatus);

router.get('/admin/appointments',authenticateToken,appointmentController.getAllAppointments);

router.get('/doctor/:doctorName',authenticateToken,appointmentController.getDoctorAppointments);

router.get('/doctors/all',authenticateToken,appointmentController.getAllDoctors);

// Update appointment status (doctor/admin only)
router.put('/update-status',authenticateToken,appointmentController.updateAppointmentStatus);

router.delete('/delete-appointment/:id',authenticateToken,appointmentController.deleteAppointmentById);

// Cancel appointment (doctor only)
router.post('/cancel-appointment',
    authenticateToken,
    (req, res, next) => {
        if (req.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                message: "Only doctors can cancel appointments"
            });
        }
        next();
    },
    appointmentController.cancelAppointment
);

// Add this route for "my appointments" (doctor only)
router.get('/my-appointments', authenticateToken,appointmentController.getDoctorOwnAppointments);

// Get appointment data from IPFS
router.post('/ipfs-data-appointment',authenticateToken,appointmentController.getAppointmentDataFromIPFS);

module.exports = router;