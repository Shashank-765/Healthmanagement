const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification/notificationController');
const {authenticateToken} = require('../middleware/middleware');


router.get('/getnotifications', authenticateToken, notificationController.getNotifications);

router.get('/getallnotifications', authenticateToken, notificationController.getAllNotifications);

router.put('/markAsRead/:notificationId', authenticateToken, notificationController.markAsRead);

router.put('/markAllAsRead', authenticateToken, notificationController.markAllAsRead);

router.post('/createAppointmentNotification', authenticateToken, notificationController.createAppointmentNotification);
router.post('/createMedicalHistory', authenticateToken, notificationController.createMedicalHistory);
router.post('/createDoctorReview', authenticateToken, notificationController.createDoctorReview);

router.get('/getallnotifications', authenticateToken, notificationController.getAllNotifications);

module.exports = router;

