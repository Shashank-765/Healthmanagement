const express = require('express');
const router = express.Router();
const insuranceController = require('../controller/insurance/insuranceController');
const { authenticateToken } = require('../middleware/middleware');
const upload = require('../utils/multer');

router.post('/insurance-signup',upload.single('image'), insuranceController.insuranceSignup);
router.post('/insurance-login', insuranceController.insuranceLogin);

router.get("/patients-with-medical-history", authenticateToken, insuranceController.getPatientsWithMedicalHistory);
router.post("/request-access", authenticateToken, insuranceController.requestAccess);
router.get("/verify-patient/:patientName", authenticateToken, insuranceController.verifyPatient);
router.get("/patient-medical-history/:patientName", authenticateToken, insuranceController.getPatientMedicalHistoryInsurance);

// Admin routes for handling access requests
router.get("/pending-requests", authenticateToken, insuranceController.getPendingAccessRequests);
router.post("/handle-access-request", authenticateToken, insuranceController.handleAccessRequest);

module.exports = router; 