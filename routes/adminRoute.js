const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin/adminController');
const { authenticateToken } = require('../middleware/middleware');
// const { transferPatientSignup } = require('../controllers/adminController');

// Admin routes
router.post('/admin-signup', adminController.adminSignup);
router.post('/admin-login', adminController.adminLogin);
router.get('/admin-data', authenticateToken, adminController.getAdminData);
router.get('/confirmed-appointments', authenticateToken, adminController.fetchdataConfirmedAppointments);
router.get('/pending-appointments', authenticateToken, adminController.fetchdataPendingAppointments);
router.put('/update-appointment-status/:appointmentId', authenticateToken, adminController.updateAppointmentStatus);
router.post('/transfer-patient-signup',adminController.transferPatientSignup);

// Insurance access request routes
router.get('/insurance-access-requests', authenticateToken, adminController.getInsuranceAccessRequests);
router.post('/handle-insurance-request', authenticateToken, adminController.handleInsuranceRequest);
// router.get('/processed-insurance-requests', authenticateToken, adminController.getProcessedAccessRequests);

// Patient history routes
router.get('/patients', authenticateToken, adminController.getAllPatientsforAdmin);
router.get('/patient-medical-history/:patientName', authenticateToken, adminController.getPatientMedicalHistoryAdmin);

module.exports = router; 