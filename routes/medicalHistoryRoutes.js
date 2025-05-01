const express = require('express');
const router = express.Router(); 
const { authenticateToken } = require('../middleware/middleware');
const medicalHistoryController = require('../controller/medicalHistory/medicalHistoryController');

router.post("/medical-create"   ,medicalHistoryController.createMedicalHistory);
router.get('/all', medicalHistoryController.getAllMedicalHistory);
router.get('/doctor/patients', authenticateToken, medicalHistoryController.getDoctorPatientHistory);
router.get('/patient/history', authenticateToken, medicalHistoryController.getPatientMedicalHistory);

module.exports = router;
