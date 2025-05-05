const appointmentModel = require('../../models/appointment/appointmentModel');
const appointmentService = require('../../services/appointmentService');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const addpatientModel = require('../../models/patient/addpatientModel');
const IPFSService = require('../../services/ipfsService');
const appointmentController = {
    createAppointment: async (req, res) => {
        try {
            console.log('Received appointment data:', req.body);
            const { department, doctorId, appointmentDate, appointmentTime, reason } = req.body;
            const patientId = req.user.id;
            const patientEmail = req.user.email.toLowerCase();

            console.log('Creating appointment with data:', {
                patientId,
                patientEmail,
                doctorId,
                department,
                appointmentDate,
                appointmentTime,
                reason
            });

            // Basic field validation
            if (!department || !doctorId || !appointmentDate || !appointmentTime || !reason) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required: department, doctorId, appointmentDate, appointmentTime, reason',
                });
            }

            // Enhanced time format validation
            const timeMatch = appointmentTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/);
            if (!timeMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'appointmentTime must be in the format "HH:MM AM/PM" (e.g., "10:30 AM")',
                });
            }
            const [, rawHours, rawMinutes, rawPeriod] = timeMatch;
            const formattedTime = `${rawHours.padStart(2, '0')}:${rawMinutes} ${rawPeriod.toUpperCase()}`;
    
            // Validate and format appointmentDate
            const appointmentDateObj = new Date(appointmentDate);
            if (isNaN(appointmentDateObj.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid appointment date format. Please use YYYY-MM-DD format.',
                });
            }    

            // Find doctor to get their email
            const doctor = await adddoctorModel.findById(doctorId);
            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found',
                });
            }

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                department,
                appointmentDate,
                appointmentTime,
                reason,
                createdAt: new Date(),
            };
     console.log('Sensitive data to be uploaded to IPFS:', sensitiveData);
            // Upload to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);
    console.log('IPFS upload result:', ipfsResult);
            // Create appointment with all required MongoDB data and IPFS references
            console.log(1)
            const appointment = new appointmentModel({
                patientId,
                patientEmail,
                doctorId,
                doctorEmail: doctor.email.toLowerCase(),
                appointmentDate,
                appointmentTime: formattedTime,
                status: 'pending',
                ipfsCID: ipfsResult.cid,
                ipfsIV: ipfsResult.iv
            });

            await appointment.save();
            console.log(2)

            console.log('Appointment created:', appointment);

            // Update references in patient and doctor documents
            await addpatientModel.findByIdAndUpdate(patientId, {
                $push: { appointments: appointment._id }
            });

            await adddoctorModel.findByIdAndUpdate(doctorId, {
                $push: { appointments: appointment._id }
            });

            res.status(201).json({
                success: true,
                message: 'Appointment created successfully',
                data: {
                    appointmentId: appointment._id,
                    patientEmail: appointment.patientEmail,
                    doctorEmail: appointment.doctorEmail,
                    status: appointment.status,
                    appointmentDetails: {
                        department,
                        appointmentDate,
                        appointmentTime,
                        reason
                    }
                }
            });

        } catch (error) {
            console.log('Appointment creation error:', error);
            // console.error('Appointment creation error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create appointment'
            });
        }
    },

    getPatientAppointmentsByName: async (req, res) => {
        try {
            const patientId = req.user.id;
            
            // Get appointments with populated doctor info and IPFS data
            const appointments = await appointmentModel.find({ patientId })
                .populate('doctorId', 'fullName specialization')
                .sort({ appointmentDate: 1 });

            if (!appointments || appointments.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No appointments found for this patient"
                });
            }

            // Get IPFS data for each appointment
            const appointmentsWithDetails = await Promise.all(appointments.map(async (appointment) => {
                // Get sensitive data from IPFS
                const sensitiveData = await IPFSService.retrieveAndDecrypt(
                    appointment.ipfsCID,
                    appointment.ipfsIV
                );

                return {
                    _id: appointment._id,
                    doctorId: appointment.doctorId,
                    appointmentDate: appointment.appointmentDate,
                    appointmentTime: sensitiveData.appointmentTime || appointment.appointmentTime,
                    status: appointment.status,
                    reason: sensitiveData.reason,
                    department: sensitiveData.department,
                    createdAt: appointment.createdAt,
                    updatedAt: appointment.updatedAt
                };
            }));

            res.status(200).json({
                success: true,
                message: "Appointments fetched successfully",
                count: appointmentsWithDetails.length,
                data: appointmentsWithDetails
            });
        } catch (error) {
            console.error('Error in getPatientAppointmentsByName:', error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch appointments"
            });
        }
    },

    getpatientAppointmentsAlldata: async (req, res) => {
        try {
            let query = {};
            if (req.user.role === 'patient') {
                query.patientId = req.user.id;
            } else if (req.user.role === 'doctor') {
                query.doctorId = req.user.id;
            }
            const appointments = await appointmentModel.find(query)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName specialization')
                .sort({ appointmentDate: 1 });

            if (!appointments || appointments.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No appointments found"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Appointments fetched successfully",
                count: appointments.length,
                data: appointments
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch appointments"
            });
        }
    },

    getDoctorAppointments: async (req, res) => {
        try {
            const { doctorName } = req.params;
            
            if (!doctorName) {
                return res.status(400).json({
                    success: false,
                    message: "Doctor name is required"
                });
            }

            const result = await appointmentService.getDoctorAppointments(doctorName);
            res.status(200).json(result);

        } catch (error) {
            console.log("Error fetching doctor appointments:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch appointments"
            });
        }
    },

    getAllDoctors: async (req, res) => {
        try {
            const userRole = req.user.role; // Get user role from token

            // If user is admin, get all doctor details
            if (userRole === 'admin') {
                const doctors = await adddoctorModel.find()
                    .select('fullName specialization _id experience availability contactnumber email qualification address bio profileimage');
                
                return res.status(200).json({
                    success: true,
                    message: "All doctors fetched successfully",
                    data: {
                        doctors: doctors
                    }
                });
            }
            
            // For other users (patients), get only basic details
            const doctors = await adddoctorModel.find()
                .select('fullName specialization _id');  // Only select required fields

            return res.status(200).json({
                success: true,
                message: "Doctors fetched successfully",
                data: {
                    doctors: doctors
                }
            });
        } catch (error) {
            console.log("Error fetching doctors:", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch doctors"
            });
        }
    },

    updatePatientStatus: async (req, res) => {
        try {
            const { patientName, doctorName, status } = req.body;

            // Validate required fields
            if (!patientName || !doctorName || !status) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name, doctor name, and status are required"
                });
            }

            // Validate status value
            if (!['confirm', 'pending', 'cancelled'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid status. Must be: confirm, pending, or cancelled"
                });
            }

            // Check if user is authorized (admin or doctor)
            const userRole = req.user.role;
            if (userRole !== 'admin' && userRole !== 'doctor') {
                return res.status(403).json({
                    success: false,
                    message: "Unauthorized: Only doctors and admins can update appointment status"
                });
            }

            const result = await appointmentService.updatePatientStatus(
                patientName,
                doctorName,
                status
            );

            res.status(200).json(result);

        } catch (error) {
            console.log("Error updating appointment status:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to update appointment status"
            });
        }
    },

    getAllAppointments: async (req, res) => {
        try {
            const result = await appointmentService.getAllAppointments();
            res.status(200).json(result);
        } catch (error) {
            console.log("Error fetching all appointments:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch appointments"
            });
        }
    },

    patientDeleteOwnAppointment: async (req, res) => {
        try {
            const { patientName } = req.params;
            const patientId = req.user.id;

            // Validate patient name
            if (!patientName) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name is required"
                });
            }

            // Check if user is a patient
            if (req.user.role !== 'patient') {
                return res.status(403).json({
                    success: false,
                    message: "Unauthorized: Only patients can delete their own appointments"
                });
            }

            const result = await appointmentService.patientDeleteOwnAppointment(patientName, patientId);
            res.status(200).json(result);

        } catch (error) {
            console.log("Error deleting appointment:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to delete appointment"
            });
        }
    },

    deleteAppointmentById: async (req, res) => {
        try {
            const appointmentId = req.params.id;
            const userId = req.user.id;
            const userRole = req.user.role;

            const appointment = await appointmentModel.findById(appointmentId);
            if (!appointment) {
                return res.status(404).json({ success: false, message: "Appointment not found" });
            }

            console.log("User ID from token:", userId);
            console.log("Appointment Patient ID:", appointment.patientId);
            console.log("Type of userId:", typeof userId);
            console.log("Type of appointment.patientId:", typeof appointment.patientId);
            console.log("String compare:", appointment.patientId.toString() === userId.toString());

            if (userRole === 'patient' && appointment.patientId.toString() !== userId.toString()) {
                return res.status(403).json({ success: false, message: "Unauthorized: You can only delete your own appointments" });
            }

            await appointmentModel.findByIdAndDelete(appointmentId);

            return res.status(200).json({ success: true, message: "Appointment deleted successfully" });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message || "Failed to delete appointment" });
        }
    },
    cancelAppointment: async (req, res) => {
        try {
            const { 
                patientId,
                doctorId,
                department,
                appointmentDate,
                appointmentTime,
                reason 
            } = req.body;

            console.log('Received cancel request:', {
                patientId,
                doctorId,
                appointmentDate,
                appointmentTime,
                department
            });

            // Validate required fields
            if (!patientId || !doctorId || !department || !appointmentDate || !appointmentTime || !reason) {
                return res.status(400).json({
                    success: false,
                    message: "All fields are required"
                });
            }

            // Format the date for comparison
            const startDate = new Date(appointmentDate);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(appointmentDate);
            endDate.setHours(23, 59, 59, 999);

            console.log('Searching for appointment with:', {
                patientId,
                doctorId,
                dateRange: {
                    start: startDate,
                    end: endDate
                },
                appointmentTime
            });

            // Find the appointment
            const appointment = await appointmentModel.findOne({
                patientId: patientId,
                doctorId: doctorId,
                appointmentDate: {
                    $gte: startDate,
                    $lte: endDate
                },
                appointmentTime: appointmentTime
            });

            console.log('Found appointment:', appointment);

            if (!appointment) {
                return res.status(404).json({
                    success: false,
                    message: "Appointment not found with the provided details"
                });
            }

            // Update appointment status to cancelled
            appointment.status = 'cancelled';
            appointment.cancellationReason = reason;
            appointment.cancelledAt = new Date();
            appointment.cancelledBy = req.user.id;

            await appointment.save();

            return res.status(200).json({
                success: true,
                message: "Appointment cancelled successfully",
                data: {
                    appointmentId: appointment._id,
                    patientId: appointment.patientId,
                    doctorId: appointment.doctorId,
                    appointmentDate: appointment.appointmentDate,
                    appointmentTime: appointment.appointmentTime,
                    status: appointment.status,
                    cancellationReason: appointment.cancellationReason
                }
            });

        } catch (error) {
            console.error("Error cancelling appointment:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to cancel appointment"
            });
        }
    },

    getDoctorOwnAppointments: async (req, res) => {
        try {
            if (req.user.role !== 'doctor') {
                return res.status(403).json({ success: false, message: "Only doctors can view their appointments" });
            }
            const doctorEmail = req.user.email;
            const doctor = await adddoctorModel.findOne({ email: doctorEmail });
            if (!doctor) {
                return res.status(404).json({ success: false, message: "Doctor not found" });
            }
            const appointments = await appointmentModel.find({ doctorId: doctor._id })
                .populate('patientId', 'fullName email')
                .sort({ appointmentDate: -1, appointmentTime: -1 });

            const formatted = appointments.map(app => ({
                _id: app._id,
                patientName: app.patientId?.fullName || 'N/A',
                email: app.patientId?.email || 'N/A',
                dateTime: `${new Date(app.appointmentDate).toLocaleDateString()} ${app.appointmentTime}`,
                status: app.status,
                doctorId: app.doctorId.toString()
            }));

            res.status(200).json({
                success: true,
                message: "Doctor's appointments fetched successfully",
                data: {
                    appointments: formatted
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message || "Failed to fetch appointments" });
        }
    },

    updateAppointmentStatus: async (req, res) => {
        try {
            const { appointmentId, status } = req.body;
            const userId = req.user.id;
            const userRole = req.user.role;

            console.log('Updating appointment status:', {
                appointmentId,
                status,
                userId,
                userRole
            });

            // Validate required fields
            if (!appointmentId || !status) {
                return res.status(400).json({
                    success: false,
                    message: "Appointment ID and status are required"
                });
            }

            // Validate status value
            if (!['confirm', 'pending', 'cancelled'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid status. Must be: confirm, pending, or cancelled"
                });
            }

            // Find the appointment
            const appointment = await appointmentModel.findById(appointmentId);
            if (!appointment) {
                return res.status(404).json({
                    success: false,
                    message: "Appointment not found"
                });
            }

            console.log('Found appointment:', {
                appointmentId: appointment._id,
                doctorId: appointment.doctorId,
                status: appointment.status
            });

            // Check if user is authorized (admin or doctor)
            if (userRole !== 'admin' && userRole !== 'doctor') {
                return res.status(403).json({
                    success: false,
                    message: "Unauthorized: Only doctors and admins can update appointment status"
                });
            }

            // If user is doctor, check if they are the assigned doctor
            if (userRole === 'doctor') {
                const doctor = await adddoctorModel.findOne({ email: req.user.email });
                if (!doctor) {
                    return res.status(404).json({
                        success: false,
                        message: "Doctor not found"
                    });
                }

                if (appointment.doctorId.toString() !== doctor._id.toString()) {
                    return res.status(403).json({
                        success: false,
                        message: "Unauthorized: You can only update appointments assigned to you"
                    });
                }
            }

            // Update appointment status
            appointment.status = status;
            await appointment.save();

            console.log('Appointment status updated successfully');

            res.status(200).json({
                success: true,
                message: "Appointment status updated successfully",
                data: {
                    appointmentId: appointment._id,
                    status: appointment.status
                }
            });

        } catch (error) {
            console.error("Error updating appointment status:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to update appointment status"
            });
        }
    },
};    
module.exports = appointmentController;