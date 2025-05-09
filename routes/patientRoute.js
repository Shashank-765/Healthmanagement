const express = require('express');
const router = express.Router();
const patientController = require('../controller/patient/patientController');
const upload = require('../utils/multer');
// const authMiddleware = require('../middleware/auth');
const { authenticateToken } = require('../middleware/middleware');

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({
            success: false,
            message: err.message || 'File upload error'
        });
    }
    next();
};

// Form data parsing middleware
const parseFormData = (req, res, next) => {
    next();
};

// Public routes
router.post("/signup", 
    upload.single('medicalDocument'),
    handleMulterError,
    parseFormData,
    patientController.patientSignup
);

router.post('/patientlogin', patientController.patientLogin);

// Protected routes
router.get('/patient-dashboard', authenticateToken, patientController.getPatientDashboard);

router.get('/sensitive-data/:cid', authenticateToken, patientController.getSensitiveData);

router.post('/addpatient', 
    upload.single('profileimage'),
    handleMulterError,
    parseFormData,
    authenticateToken,
    patientController.addPatient
);
//for ipfs data
router.get('/addpatient/:email', patientController.getPatientCompleteData);
//crud for patient
router.get('/allpatientdata', patientController.readAllpatientdata);
router.get('/patientdata/:fullName', patientController.readpatientdataByName);
router.put('/update/:fullName', patientController.updatePatientData);
router.delete('/delete-patientdata/:fullName', patientController.deletePatientData);

// Add these new routes while kaeeping existing ones
router.post('/assign-primary-doctor', patientController.assignPrimaryDoctor);
router.get('/patient-dashboard',authenticateToken, patientController.getPatientDashboard);
// router.post('/add-appointment', patientController.addAppointmentToPatient);
// router.get('/sensitive-data/:cid', patientController.getPatientSensitiveData);
router.get('/transfer-patient/:email', authenticateToken, patientController.transferPatientByEmail);
module.exports = router;
