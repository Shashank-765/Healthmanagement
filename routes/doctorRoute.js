const express = require('express');
const router = express.Router();
const doctorController = require("../controller/doctor/doctorController");
const upload = require('../utils/multer');


router.post("/doctorsignup", upload.single('medicalDocument'), doctorController.doctorSignup);
router.post("/doctorlogin", doctorController.doctorLogin);
module.exports = router;