const express = require('express');
const router = express.Router();
const insuranceController = require('../controller/insurance/insuranceController');
const { authenticateToken } = require('../middleware/middleware');
const upload = require('../utils/multer');

router.post('/insurance-signup',upload.single('image'), insuranceController.insuranceSignup);
router.post('/insurance-login', insuranceController.insuranceLogin);
module.exports = router; 