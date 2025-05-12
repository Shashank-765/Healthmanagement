const express = require('express');
const router = express.Router(); 
const { authenticateToken } = require('../middleware/middleware');
const medicalHistoryController = require('../controller/medicalHistory/medicalHistoryController');

// Test route for IPFS data - No authentication
// router.get('/test-ipfs', medicalHistoryController.getIPFSDataByCID);

// Protected routes with authentication
router.post("/medical-create", authenticateToken, medicalHistoryController.createMedicalHistory);
// router.get('/all', medicalHistoryController.getAllMedicalHistory);
router.get('/doctor/patients', authenticateToken, medicalHistoryController.getDoctorPatientHistory);
router.get('/patient/history', authenticateToken, medicalHistoryController.getPatientMedicalHistory);

router.put('/edit/:email', authenticateToken, medicalHistoryController.editMedicalHistory);
router.get('/personal-history/:email', authenticateToken, medicalHistoryController.getMedicalHistoryByDoctor);
router.post('/self-history', authenticateToken, medicalHistoryController.createPatientSelfHistory);

module.exports = router;