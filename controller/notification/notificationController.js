// const notificationModel = require('../../models/notification/notificationModel');
// const pusher = require('../../utils/pusher');

// // Internal helper for creating a notification (no req/res)
// async function createNotification({ doctorId, patientId, appointmentId, patientName }) {
//     if (!doctorId || !patientId || !appointmentId || !patientName) {
//         throw new Error('All fields are required');
//     }
//     const notification = await notificationModel.create({
//         recipientId: doctorId,
//         recipientModel: 'Doctor',
//         patientId: patientId,
//         appointmentId: appointmentId,
//         title: 'New Appointment Request',
//         message: `${patientName} has requested an appointment with you`,
//         read: false,
//         createdAt: new Date()
//     });
//     // Trigger Pusher event
//     try {
//         await pusher.trigger('notifications', 'new-notification', {
//             notification: notification
//         });
//         console.log('[CONTROLLER] Pusher event triggered');
//     } catch (pusherError) {
//         console.error('[CONTROLLER] Pusher event failed:', pusherError);
//     }
//     return notification;
// }

// module.exports = {
//     // For API route usage
//     getNotifications: async (req, res) => {
//         try {
//             console.log('[CONTROLLER] getNotifications called');
//             if (!req.user) {
//                 console.log('[CONTROLLER] No user found in request');
//             } else {
//                 console.log('[CONTROLLER] User:', req.user);
//             }
//             const notifications = await notificationModel.find({
//                 recipientId: req.user?.id
//             }).sort({ createdAt: -1 });

//             console.log('[CONTROLLER] Notifications found:', notifications.length);

//             const unreadCount = notifications.filter(n => !n.read).length;
//             res.json({
//                 success: true,
//                 notifications,
//                 unreadCount
//             });
//  } catch (error) {
//             console.error('[CONTROLLER] Error in getNotifications:', error);
//             res.status(500).json({
//                 success: false,
//                 message: error.message
//             });
//         }
//     },

//     // For API route usage
//     createAppointmentNotification: async (req, res) => {
//         try {
//             const { doctorId, patientId, appointmentId, patientName } = req.body;
//             const notification = await createNotification({ doctorId, patientId, appointmentId, patientName });
//             res.status(201).json({
//                 success: true,
//                 message: 'Notification created successfully',
//                 data: notification
//             });
//             console.log('[CONTROLLER] createAppointmentNotification response sent');
//         } catch (error) {
//             console.error('[CONTROLLER] Error in createAppointmentNotification:', error);
//             res.status(500).json({
//                 success: false,
//                 message: error.message || 'Failed to create notification'
//             });
//         }
//     },

//     // For internal usage (from other controllers, e.g. appointmentController)
//     createAppointmentNotificationInternal: async ({ doctorId, patientId, appointmentId, patientName }) => {
//         return await createNotification({ doctorId, patientId, appointmentId, patientName });
//     },

//     // Mark all notifications as read for the logged-in user
//     markAllAsRead: async (req, res) => {
//         try {
//             console.log('[CONTROLLER] markAllAsRead called for user:', req.user?.id);
//             const result = await notificationModel.updateMany(
//                 { recipientId: req.user?.id, read: false },
//                 { $set: { read: true } }
//             );
//             console.log('[CONTROLLER] All notifications marked as read for user:', req.user?.id);
//             res.json({ success: true, result });
//         } catch (error) {
//             console.error('[CONTROLLER] Error in markAllAsRead:', error);
//             res.status(500).json({ success: false, message: error.message });
//         }
//     }
// };