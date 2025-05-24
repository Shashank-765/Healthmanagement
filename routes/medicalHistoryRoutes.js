const express = require('express');
const router = express.Router(); 
const { authenticateToken } = require('../middleware/middleware');
const medicalHistoryController = require('../controller/medicalHistory/medicalHistoryController');
const upload = require('../utils/multer');

// Create medical history with file upload
router.post('/medical-create', authenticateToken, upload.single('file'), medicalHistoryController.createMedicalHistory);
router.post('/self-history', authenticateToken, upload.single('file'), medicalHistoryController.createPatientSelfHistory);
// Test route for IPFS data - No authentication
// router.get('/test-ipfs', medicalHistoryController.getIPFSDataByCID);
router.get('/image/:historyId', medicalHistoryController.getImageByHistoryId);
// router.get('/all', medicalHistoryController.getAllMedicalHistory);
router.get('/doctor/patients', authenticateToken, medicalHistoryController.getDoctorPatientHistory);
router.get('/patient/history', authenticateToken, medicalHistoryController.getPatientMedicalHistory);
// router.put('/edit/:email', authenticateToken, medicalHistoryController.editMedicalHistory);
router.get('/personal-history/:email', authenticateToken, medicalHistoryController.getMedicalHistoryByDoctor);
router.put('/edit/:email', authenticateToken, upload.single('file'), medicalHistoryController.editMedicalHistory);
module.exports = router;