const notificationModel = require('../../models/notification/notificationModel');
const pusher = require('../../utils/pusher');
const adddoctorModel = require('../../models/doctor/adddoctorModel');

// Internal helper for creating a notification (no req/res)
async function createNotification({ doctorId, patientId, appointmentId, patientName }) {
    console.log('createNotification called with:', { doctorId, patientId, appointmentId, patientName });
    
    if (!doctorId || !patientId || !appointmentId || !patientName) {
        console.error('Missing required fields:', { doctorId, patientId, appointmentId, patientName });
        throw new Error('All fields are required');
    }

    // Get doctor's name
    const doctor = await adddoctorModel.findById(doctorId);
    if (!doctor) {
        console.error('Doctor not found with ID:', doctorId);
        throw new Error('Doctor not found');
    }

    // Use doctor's fullName
    const doctorName = doctor.fullName;
    if (!doctorName) {
        console.error('Doctor name not found:', doctor);
        throw new Error('Doctor name not found');
    }

    console.log('Found doctor:', {
        id: doctor._id,
        name: doctorName,
        email: doctor.email
    });

    const notification = await notificationModel.create({
        recipientId: doctorName, // Using doctor's fullName
        recipientModel: 'Doctor',
        patientId: patientId,
        appointmentId: appointmentId,
        title: 'New Appointment Request',
        message: `${patientName} has requested an appointment with you`,
        read: false,
        createdAt: new Date()
    });
    console.log('Notification created in database:', {
        id: notification._id,
        recipientId: notification.recipientId,
        message: notification.message
    });

    // Trigger Pusher event on doctor-specific channel
    try {
        const channelName = `notifications-${doctorName}`; // Using doctor's fullName
        console.log('Triggering Pusher event on channel:', channelName);
        const pusherResponse = await pusher.trigger(channelName, 'new-notification', {
            notification: notification
        });
        console.log('[CONTROLLER] Pusher event triggered successfully:', pusherResponse);
        console.log('[CONTROLLER] Pusher event triggered for doctor:', doctorName);
    } catch (pusherError) {
        console.error('[CONTROLLER] Pusher event failed:', pusherError);
        console.error('[CONTROLLER] Pusher error details:', {
            message: pusherError.message,
            code: pusherError.code,
            stack: pusherError.stack
        });
    }
    return notification;
}

// For appointment time reminder notification
async function createAppointmentReminderNotification({ patientId, appointmentId, appointmentTime }) {
    const notification = await notificationModel.create({
        recipientId: patientId,
        recipientModel: 'Patient',
        appointmentId: appointmentId,
        title: 'Appointment Reminder',
        message: `Your appointment is scheduled for ${appointmentTime}`,
        read: false,
        createdAt: new Date()
    });
    
    await pusher.trigger('notifications', 'new-notification', {
        notification: notification
    });
    return notification;
}

// For appointment status change notification
async function createAppointmentStatusNotification({ patientId, appointmentId, status }) {
    const notification = await notificationModel.create({
        recipientId: patientId,
        recipientModel: 'Patient',
        appointmentId: appointmentId,
        title: 'Appointment Status Update',
        message: `Your appointment status has been updated to: ${status}`,
        read: false,
        createdAt: new Date()
    });
    
    await pusher.trigger('notifications', 'new-notification', {
        notification: notification
    });
    return notification;
}

// For medical history creation notification
async function createMedicalHistoryNotification({ patientId, doctorName }) {
    const notification = await notificationModel.create({
        recipientId: patientId,
        recipientModel: 'Patient',
        title: 'New Medical History',
        message: `Dr. ${doctorName} has created your medical history`,
        read: false,
        createdAt: new Date()
    });
    
    await pusher.trigger('notifications', 'new-notification', {
        notification: notification
    });
    return notification;
}

// Get all notifications for the notifications page (including read ones)
const getAllNotifications = async (req, res) => {
    try {
        console.log('[CONTROLLER] getAllNotifications called');
        console.log('[CONTROLLER] User from request:', {
            id: req.user?.id,
            email: req.user?.email,
            role: req.user?.role,
            fullName: req.user?.fullName
        });

        if (!req.user) {
            console.log('[CONTROLLER] No user found in request');
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Get doctor's name if user is a doctor
        let recipientName = req.user.fullName;
        if (req.user.role === 'doctor') {
            const doctor = await adddoctorModel.findById(req.user.id);
            if (doctor) {
                recipientName = doctor.fullName;
                console.log('[CONTROLLER] Found doctor:', {
                    id: doctor._id,
                    name: recipientName,
                    email: doctor.email
                });
            }
        }

        console.log('[CONTROLLER] User details for all notifications:', {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            name: recipientName
        });

        if (!recipientName) {
            console.error('[CONTROLLER] No name found in user data');
            return res.status(400).json({
                success: false,
                message: 'User name not found'
            });
        }

        // Find all notifications (both read and unread)
        let query = {
            $or: [
                { recipientId: recipientName },
                { recipientModel: 'Doctor', recipientId: recipientName }
            ]
        };

        console.log('[CONTROLLER] Query for all notifications:', query);

        const notifications = await notificationModel.find(query)
            .sort({ createdAt: -1 });

        // Log specific details about rating notifications
        const ratingNotifications = notifications.filter(n => n.title === 'New Review Received');
        console.log('[CONTROLLER] Rating notifications found:', {
            total: ratingNotifications.length,
            details: ratingNotifications.map(n => ({
                id: n._id,
                recipientId: n.recipientId,
                message: n.message,
                title: n.title,
                read: n.read,
                createdAt: n.createdAt,
                patientId: n.patientId
            }))
        });

        console.log('[CONTROLLER] All notifications found:', {
            total: notifications.length,
            ratingNotifications: ratingNotifications.length,
            notifications: notifications.map(n => ({
                id: n._id,
                recipientId: n.recipientId,
                message: n.message,
                title: n.title,
                read: n.read,
                createdAt: n.createdAt
            }))
        });

        // Count unread notifications
        const unreadCount = notifications.filter(n => !n.read).length;

        res.json({
            success: true,
            notifications,
            totalCount: notifications.length,
            unreadCount
        });
    } catch (error) {
        console.error('[CONTROLLER] Error in getAllNotifications:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch notifications'
        });
    }
};

module.exports = {
    // Get all notifications for logged in user
    getNotifications: async (req, res) => {
        try {
            console.log('[CONTROLLER] getNotifications called');
            console.log('[CONTROLLER] User from request:', {
                id: req.user?.id,
                email: req.user?.email,
                role: req.user?.role,
                fullName: req.user?.fullName
            });

            if (!req.user) {
                console.log('[CONTROLLER] No user found in request');
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            // Get doctor's name if user is a doctor
            let recipientName = req.user.fullName;
            if (req.user.role === 'doctor') {
                const doctor = await adddoctorModel.findById(req.user.id);
                if (doctor) {
                    recipientName = doctor.fullName;
                    console.log('[CONTROLLER] Found doctor:', {
                        id: doctor._id,
                        name: recipientName,
                        email: doctor.email
                    });
                }
            }

            console.log('[CONTROLLER] User details:', {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                name: recipientName
            });

            if (!recipientName) {
                console.error('[CONTROLLER] No name found in user data');
                return res.status(400).json({
                    success: false,
                    message: 'User name not found'
                });
            }

            // Find notifications based on user role
            let query = {
                $or: [
                    { recipientId: recipientName, read: false },
                    { recipientModel: 'Doctor', recipientId: recipientName, read: false }
                ]
            };

            console.log('[CONTROLLER] Query used:', query);

            const notifications = await notificationModel.find(query)
                .sort({ createdAt: -1 });

            // Log specific details about rating notifications
            const ratingNotifications = notifications.filter(n => n.title === 'New Review Received');
            console.log('[CONTROLLER] Rating notifications found:', {
                total: ratingNotifications.length,
                details: ratingNotifications.map(n => ({
                    id: n._id,
                    recipientId: n.recipientId,
                    message: n.message,
                    title: n.title,
                    read: n.read,
                    createdAt: n.createdAt,
                    patientId: n.patientId
                }))
            });

            console.log('[CONTROLLER] All notifications found:', {
                total: notifications.length,
                ratingNotifications: ratingNotifications.length,
                notifications: notifications.map(n => ({
                    id: n._id,
                    recipientId: n.recipientId,
                    message: n.message,
                    title: n.title,
                    read: n.read,
                    createdAt: n.createdAt
                }))
            });

            const unreadCount = notifications.length;
            res.json({
                success: true,
                notifications,
                unreadCount
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in getNotifications:', {
                error: error.message,
                stack: error.stack,
                name: error.name
            });
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    // Get all notifications for the notifications page (including read ones)
    getAllNotifications: getAllNotifications,

    // Create notification for new appointment request
    createAppointmentNotification: async (req, res) => {
        try {
            const { doctorId, patientId, appointmentId, patientName } = req.body;
            
            const notification = await notificationModel.create({
                recipientId: doctorId,
                recipientModel: 'Doctor',
                patientId: patientId,
                appointmentId: appointmentId,
                title: 'New Appointment Request',
                message: `${patientName} has requested an appointment with you`,
                read: false,
                createdAt: new Date()
            });

            await pusher.trigger('notifications', 'new-notification', {
                notification: notification
            });

            res.status(201).json({
                success: true,
                message: 'Notification created successfully',
                data: notification
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in createAppointmentNotification:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create notification'
            });
        }
    },

    // Create notification for appointment reminder
    createAppointmentReminder: async (req, res) => {
        try {
            const { patientId, appointmentId, appointmentTime } = req.body;
            
            const notification = await notificationModel.create({
                recipientId: patientId,
                recipientModel: 'Patient',
                appointmentId: appointmentId,
                title: 'Appointment Reminder',
                message: `Your appointment is scheduled for ${appointmentTime}`,
                read: false,
                createdAt: new Date()
            });

            await pusher.trigger('notifications', 'new-notification', {
                notification: notification
            });

            res.status(201).json({
                success: true,
                message: 'Reminder notification created successfully',
                data: notification
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in createAppointmentReminder:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    // Create notification for appointment status change
    createAppointmentStatus: async (req, res) => {
        try {
            const { patientId, appointmentId, status } = req.body;
            
            const notification = await notificationModel.create({
                recipientId: patientId,
                recipientModel: 'Patient',
                appointmentId: appointmentId,
                title: 'Appointment Status Update',
                message: `Your appointment status has been updated to: ${status}`,
                read: false,
                createdAt: new Date()
            });

            await pusher.trigger('notifications', 'new-notification', {
                notification: notification
            });

            res.status(201).json({
                success: true,
                message: 'Status notification created successfully',
                data: notification
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in createAppointmentStatus:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    // Create notification for medical history creation
    createMedicalHistory: async (req, res) => {
        try {
            const { patientId, doctorName } = req.body;
            
            const notification = await notificationModel.create({
                recipientId: patientId,
                recipientModel: 'Patient',
                title: 'New Medical History',
                message: `Dr. ${doctorName} has created your medical history`,
                read: false,
                createdAt: new Date()
            });

            await pusher.trigger('notifications', 'new-notification', {
                notification: notification
            });

            res.status(201).json({
                success: true,
                message: 'Medical history notification created successfully',
                data: notification
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in createMedicalHistory:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    // Mark all notifications as read
    markAllAsRead: async (req, res) => {
        try {
            console.log('[CONTROLLER] markAllAsRead called for user:', req.user?.id);
            const result = await notificationModel.updateMany(
                { recipientId: req.user?.id, read: false },
                { $set: { read: true } }
            );
            console.log('[CONTROLLER] All notifications marked as read for user:', req.user?.id);
            res.json({ success: true, result });
        } catch (error) {
            console.error('[CONTROLLER] Error in markAllAsRead:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // For internal usage (from other controllers, e.g. appointmentController)
    createAppointmentNotificationInternal: async ({ doctorId, patientId, appointmentId, patientName }) => {
        return await createNotification({ doctorId, patientId, appointmentId, patientName });
    },

    // New exported functions
    createAppointmentReminderNotification,
    createAppointmentStatusNotification,
    createMedicalHistoryNotification,

    // Create notification for doctor review
    createDoctorReview: async (req, res) => {
        try {
            const { doctorId, patientId, patientName, rating } = req.body;
            
            const notification = await notificationModel.create({
                recipientId: doctorId,
                recipientModel: 'Doctor',
                patientId: patientId,
                title: 'New Review Received',
                message: `${patientName} has given you a ${rating} star review`,
                read: false,
                createdAt: new Date()
            });

            await pusher.trigger('notifications', 'new-notification', {
                notification: notification
            });

            res.status(201).json({
                success: true,
                message: 'Review notification created successfully',
                data: notification
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in createDoctorReview:', error);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    // Mark a single notification as read
    markAsRead: async (req, res) => {
        try {
            const { notificationId } = req.params;
            console.log('[CONTROLLER] markAsRead called for notification:', notificationId);
            
            const result = await notificationModel.findByIdAndUpdate(
                notificationId,
                { $set: { read: true } },
                { new: true }
            );

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found'
                });
            }

            console.log('[CONTROLLER] Notification marked as read:', notificationId);
            res.json({ 
                success: true, 
                message: 'Notification marked as read',
                notification: result
            });
        } catch (error) {
            console.error('[CONTROLLER] Error in markAsRead:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    }
};