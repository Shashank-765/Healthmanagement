const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin/adminController');

// Admin routes
router.post('/admin-signup', adminController.adminSignup);
router.post('/admin-login', adminController.adminLogin);

module.exports = router; 