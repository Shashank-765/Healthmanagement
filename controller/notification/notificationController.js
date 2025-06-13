const notificationModel = require('../../models/notification/notificationModel');
const pusher = require('../../utils/pusher');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const AddPatient = require('../../models/patient/addpatientModel');

// Internal helper for creating a notification (no req/res)
async function createNotification({ doctorId, patientId, appointmentId, patientName }) {
    if (!doctorId || !patientId || !appointmentId || !patientName) {
        console.error('Missing required fields:', { doctorId, patientId, appointmentId, patientName });
        throw new Error('All fields are required');
    }

    // Get doctor's name
    const doctor = await adddoctorModel.findById(doctorId);
    if (!doctor) {
        throw new Error('Doctor not found');
    }

    // Use doctor's fullName
    const doctorName = doctor.fullName;
    if (!doctorName) {
        throw new Error('Doctor name not found');
    }

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

    // Trigger Pusher event on doctor-specific channel
    try {
        const channelName = `notifications-${doctorName}`; // Using doctor's fullName
        const pusherResponse = await pusher.trigger(channelName, 'new-notification', {
            notification: notification
        });
    } catch (pusherError) {
    }
    return notification;
}

// For appointment status change notification
async function createAppointmentStatusNotification({ patientId, appointmentId, status, doctorName }) {
    console.log('[CONTROLLER] Creating appointment status notification:', {
        patientId,
        appointmentId,
        status,
        doctorName
    });

    try {
        // Find patient to get their name
        const patient = await AddPatient.findById(patientId);
        if (!patient) {
            console.error('[CONTROLLER] Patient not found:', patientId);
            throw new Error('Patient not found');
        }

        console.log('[CONTROLLER] Found patient:', {
            id: patient._id,
            name: patient.fullName,
            email: patient.email
        });

        const notification = await notificationModel.create({
            recipientId: patient.fullName, // Use patient's fullName instead of ID
            recipientModel: 'Patient',
            appointmentId: appointmentId,
            title: 'Appointment Status Update',
            message: `Dr. ${doctorName} has updated your appointment status to: ${status}`,
            read: false,
            createdAt: new Date()
        });
        
        console.log('[CONTROLLER] Appointment status notification created:', {
            id: notification._id,
            recipientId: notification.recipientId,
            message: notification.message,
            title: notification.title,
            read: notification.read,
            createdAt: notification.createdAt
        });

        // Trigger Pusher event on patient-specific channel
        const channelName = `notifications-${patient.fullName}`;
        console.log('[CONTROLLER] Triggering Pusher event on channel:', channelName);
        
        const pusherResponse = await pusher.trigger(channelName, 'new-notification', {
            notification: notification
        });
        
        console.log('[CONTROLLER] Pusher event triggered successfully:', {
            channel: channelName,
            response: pusherResponse
        });

        return notification;
    } catch (error) {
        console.error('[CONTROLLER] Error in createAppointmentStatusNotification:', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name
        });
        throw error;
    }
}

// For medical history creation notification
async function createMedicalHistoryNotification({ patientId, doctorName }) {
    console.log('[CONTROLLER] Creating medical history notification:', {
        patientId,
        doctorName
    });

    try {
        // Find patient to get their name
        const patient = await AddPatient.findById(patientId);
        if (!patient) {
            console.error('[CONTROLLER] Patient not found:', patientId);
            throw new Error('Patient not found');
        }

        console.log('[CONTROLLER] Found patient:', {
            id: patient._id,
            name: patient.fullName,
            email: patient.email
        });

        const notification = await notificationModel.create({
            recipientId: patient.fullName, // Use patient's fullName instead of ID
            recipientModel: 'Patient',
            title: 'New Medical History',
            message: `Dr. ${doctorName} has created your medical history`,
            read: false,
            createdAt: new Date()
        });
        
        console.log('[CONTROLLER] Medical history notification created:', {
            id: notification._id,
            recipientId: notification.recipientId,
            message: notification.message,
            title: notification.title,
            read: notification.read,
            createdAt: notification.createdAt
        });

        // Trigger Pusher event on patient-specific channel
        const channelName = `notifications-${patient.fullName}`;
        console.log('[CONTROLLER] Triggering Pusher event on channel:', channelName);
        
        const pusherResponse = await pusher.trigger(channelName, 'new-notification', {
            notification: notification
        });
        
        console.log('[CONTROLLER] Pusher event triggered successfully:', {
            channel: channelName,
            response: pusherResponse
        });

        return notification;
    } catch (error) {
        console.error('[CONTROLLER] Error in createMedicalHistoryNotification:', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name
        });
        throw error;
    }
}

// Get all notifications for the notifications page (including read ones)
const getAllNotifications = async (req, res) => {
    try {
        if (!req.user) {
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

        const notifications = await notificationModel.find(query)
            .sort({ createdAt: -1 });

        // Log specific details about rating notifications
        const ratingNotifications = notifications.filter(n => n.title === 'New Review Received');
        // Count unread notifications
        const unreadCount = notifications.filter(n => !n.read).length;

        res.json({
            success: true,
            notifications,
            totalCount: notifications.length,
            unreadCount
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch notifications'
        });
    }
};

// Create notification for insurance access approval
async function createInsuranceAccessNotification({ insuranceName, patientName }) {
    console.log('[CONTROLLER] Creating insurance access notification:', {
        insuranceName,
        patientName
    });

    try {
        const notification = await notificationModel.create({
            recipientId: insuranceName,
            recipientModel: 'Insurance',
            title: 'Medical History Access Granted',
            message: `You have been granted access to view ${patientName}'s medical history`,
            read: false,
            createdAt: new Date()
        });
        
        console.log('[CONTROLLER] Insurance access notification created:', {
            id: notification._id,
            recipientId: notification.recipientId,
            message: notification.message,
            title: notification.title,
            read: notification.read,
            createdAt: notification.createdAt
        });

        // Trigger Pusher event on insurance-specific channel
        const channelName = `notifications-insurance-${insuranceName}`;
        console.log('[CONTROLLER] Triggering Pusher event on channel:', channelName);
        
        const pusherResponse = await pusher.trigger(channelName, 'new-notification', {
            notification: notification
        });
        
        console.log('[CONTROLLER] Pusher event triggered successfully:', {
            channel: channelName,
            response: pusherResponse
        });

        return notification;
    } catch (error) {
        console.error('[CONTROLLER] Error in createInsuranceAccessNotification:', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name
        });
        throw error;
    }
}

module.exports = {
    // Get all notifications for logged in user
    getNotifications: async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const user = req.user;
            const userId = user.id;
            const userRole = user.role;

            let recipientModel;
            let recipientId;

            // Determine the recipient model and ID based on the user's role
            if (userRole === 'patient') {
                recipientModel = 'Patient';
                recipientId = user.fullName || user.name;
            } else if (userRole === 'doctor') {
                recipientModel = 'Doctor';
                recipientId = user.fullName || user.name;
            } else if (userRole === 'admin') {
                recipientModel = 'Admin';
                recipientId = user.fullName || user.name;
            } else if (userRole === 'insurance') {
                recipientModel = 'Insurance';
                recipientId = user.companyName || user.name;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Unknown user role"
                });
            }

            console.log('[CONTROLLER] Fetching notifications for:', {
                recipientId: recipientId,
                recipientModel: recipientModel,
                userId: userId,
                userRole: userRole
            });

            // Find notifications for this user
            const notifications = await notificationModel.find({
                $or: [
                    { recipientId: recipientId, recipientModel: recipientModel },
                    { recipientId: userId, recipientModel: recipientModel }
                ]
            })
            .sort({ createdAt: -1 }); // Sort by newest first

            console.log('[CONTROLLER] Found notifications:', { 
                count: notifications.length, 
                notifications: notifications,
                query: {
                    recipientId: recipientId,
                    recipientModel: recipientModel
                }
            });

            const unreadCount = notifications.filter(n => !n.read).length;

            res.status(200).json({
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
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create notification'
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
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    // Mark all notifications as read
    markAllAsRead: async (req, res) => {
        try {
            const result = await notificationModel.updateMany(
                { recipientId: req.user?.id, read: false },
                { $set: { read: true } }
            );
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // For internal usage (from other controllers, e.g. appointmentController)
    createAppointmentNotificationInternal: async ({ doctorId, patientId, appointmentId, patientName }) => {
        return await createNotification({ doctorId, patientId, appointmentId, patientName });
    },

    // New exported functions
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
            res.json({ 
                success: true, 
                message: 'Notification marked as read',
                notification: result
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message 
            });
        }
    },

    // Create notification for insurance access approval
    createInsuranceAccessNotification,
};