const express = require('express');
const router = express.Router();
const adminController = require('../controller/admin/adminController');
const { authenticateToken } = require('../middleware/middleware');

// Admin routes
router.post('/admin-signup', adminController.adminSignup);
router.post('/admin-login', adminController.adminLogin);
router.get('/admin-data', authenticateToken, adminController.getAdminData);

module.exports = router; 