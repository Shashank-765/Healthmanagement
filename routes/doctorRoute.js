const express = require('express');
const router = express.Router();
const doctorController = require("../controller/doctor/doctorController");
const upload = require('../utils/multer');

router.post("/doctorsignup", upload.single('medicalDocument'), doctorController.doctorSignup);
router.post("/doctorlogin", doctorController.doctorLogin);

//crud for doctor

router.post("/adddoctor", upload.single('profileimage'), doctorController.createDoctor);
router.get("/readdoctors", doctorController.getDoctors);
router.put("/updatedoctors/:email", upload.single('profileimage'), doctorController.updateDoctor);
router.delete("/deletedoctors/:email", doctorController.deleteDoctor);

module.exports = router;