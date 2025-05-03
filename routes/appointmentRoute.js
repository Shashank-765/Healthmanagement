// routes/appointmentRoute.js
const express = require('express');
const router = express.Router();
const appointmentController = require('../controller/appointment/appointmentController');
const { authenticateToken } = require('../middleware/middleware');

// Create appointment
router.post('/create', 
    authenticateToken,
    appointmentController.createAppointment
);
// Get patient's appointments by email
router.get('/patient',
    authenticateToken,
    appointmentController.getPatientAppointmentsByName
);

router.get('/all-appointments', 
    appointmentController.getpatientAppointmentsAlldata
);

// Get all appointments data

// Get doctor's appointments by ID
router.get('/doctor-appointments/:doctorId',
    appointmentController.getDoctorAppointments
);

// Update patient status (doctor only)
router.patch('/patient-status',
    appointmentController.updatePatientStatus 
);

router.get('/admin/appointments',
    appointmentController.getAllAppointments  
);

router.get('/doctor/:doctorName',
    appointmentController.getDoctorAppointments
);

router.get('/doctors/all',
    authenticateToken,
    appointmentController.getAllDoctors
);


// Update appointment status (doctor/admin only)
router.patch('/update-status',
    appointmentController.updatePatientStatus
);

router.delete('/delete-appointment/id/:id', authenticateToken, appointmentController.deleteAppointmentById);

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

// Add this route for "my appointments" (doctor only) (total appointments on doctor dashboard)
router.get('/my-appointments', authenticateToken, appointmentController.getDoctorOwnAppointments);

module.exports = router;