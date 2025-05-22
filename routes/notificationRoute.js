// const express = require('express');
// const router = express.Router();
// const notificationController = require('../controller/notification/notificationController');
// const {authenticateToken} = require('../middleware/middleware');


// // Get all notifications for the logged-in user
// router.get('/getnotifications', authenticateToken, notificationController.getNotifications);
// // Create appointment notification
// router.post('/createAppointmentNotification', (req, res, next) => {
//     console.log('[ROUTE] /createAppointmentNotification hit');
//     notificationController.createAppointmentNotification(req, res, next);
// });

// router.put('/markAllAsRead', authenticateToken, notificationController.markAllAsRead);

// // // Delete a notification
// // router.delete('/:id', authenticateToken, notificationController.deleteNotification);


// module.exports = router;