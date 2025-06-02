const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification/notificationController');
const {authenticateToken} = require('../middleware/middleware');


// Get all notifications for the logged-in user
router.get('/getnotifications', authenticateToken, notificationController.getNotifications);

// Get all notifications (including read ones) for the notifications page
router.get('/getallnotifications', authenticateToken, notificationController.getAllNotifications);

// Mark a single notification as read
router.put('/markAsRead/:notificationId', authenticateToken, notificationController.markAsRead);

// Mark all notifications as read
router.put('/markAllAsRead', authenticateToken, notificationController.markAllAsRead);

// Create appointment notification
router.post('/createAppointmentNotification', authenticateToken, notificationController.createAppointmentNotification);

// Create appointment reminder notification
router.post('/createAppointmentReminder', authenticateToken, notificationController.createAppointmentReminder);

// Create appointment status notification
router.post('/createAppointmentStatus', authenticateToken, notificationController.createAppointmentStatus);

// Create medical history notification
router.post('/createMedicalHistory', authenticateToken, notificationController.createMedicalHistory);

// Create doctor review notification
router.post('/createDoctorReview', authenticateToken, notificationController.createDoctorReview);

router.get('/getallnotifications', authenticateToken, notificationController.getAllNotifications);

// // Delete a notification
// router.delete('/:id', authenticateToken, notificationController.deleteNotification);


module.exports = router;

