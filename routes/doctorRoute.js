const express = require('express');
const router = express.Router();
const doctorController = require("../controller/doctor/doctorController");
const { authenticateToken } = require('../middleware/middleware');
const upload = require('../utils/multer');

router.post("/doctorsignup", upload.single('medicalDocument'), doctorController.doctorSignup);
router.post("/doctorlogin", doctorController.doctorLogin);

//crud for doctor

router.post("/adddoctor", upload.single('profileimage'),authenticateToken,doctorController.createDoctor);
router.get("/readdoctors", doctorController.getDoctors);
router.put("/updatedoctors/:email", upload.single('profileimage'), doctorController.updateDoctor);
router.delete("/deletedoctors/:email",authenticateToken, doctorController.deleteDoctor);

// Add these new routes
router.post('/assign-patient',authenticateToken,doctorController.assignPatientToDoctor);
router.get('/dashboard/:doctorEmail', authenticateToken,doctorController.getDoctorDashboard);
router.post('/add-appointment',authenticateToken,doctorController.addAppointmentToDoctor);
router.get('/readdoctorstransfer/:email',authenticateToken,doctorController.readDoctorsByEmail);
router.get('/reviewsummary', authenticateToken, doctorController.getReviewsSummary);
router.post('/rate-doctor', authenticateToken, doctorController.rateDoctor);

module.exports = router;
