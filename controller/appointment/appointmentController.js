const appointmentModel = require('../../models/appointment/appointmentModel');
const appointmentService = require('../../services/appointmentService');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const appointmentController = {
    createAppointment: async (req, res) => {
        try {
            const { department, doctorId, appointmentDate, appointmentTime, reason } = req.body;
            const patientId = req.user.id;
            const patientEmail = req.user.email;

            console.log('Creating appointment with data:', {
                patientId,
                patientEmail,
                doctorId,
                department,
                appointmentDate,
                appointmentTime,
            });

            // Basic field validation
            if (!department || !doctorId || !appointmentDate || !appointmentTime || !reason) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required: department, doctorId, appointmentDate, appointmentTime, reason',
                });
            }

            // Validate appointmentTime format (HH:MM AM/PM)
            const timeRegex = /^([1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/i;
            if (!timeRegex.test(appointmentTime)) {
                return res.status(400).json({
                    success: false,
                    message: 'appointmentTime must be in the format "HH:MM AM/PM" (e.g., "10:30 AM")',
                });
            }

            // Optional: Validate appointmentDate format (ensure it's a valid date)
            const parsedDate = new Date(appointmentDate);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'appointmentDate must be a valid date',
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

            const result = await appointmentService.createAppointment({
                patientId,
                patientEmail,
                doctorId,
                doctorEmail: doctor.email.toLowerCase(), // Store doctor's email
                department,
                appointmentDate,
                appointmentTime,
                reason,
            });

            res.status(201).json(result);
        } catch (error) {
            console.log('Appointment creation error:', {
                message: error.message,
                stack: error.stack,
            });

            if (error.message.includes('Patient not found')) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient not found in hospital records. Please ensure you are registered.',
                });
            }

            if (error.message.includes('Doctor not found')) {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }

            if (error.message.includes('already booked')) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: Object.values(error.errors).map((err) => err.message).join(', '),
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create appointment',
            });
        }
    },

    getPatientAppointmentsByName: async (req, res) => {
        try {
            const patientId = req.user.id;
            const appointments = await appointmentModel.find({ patientId })
                .populate('doctorId', 'fullName specialization')
                .sort({ appointmentDate: 1 });

            if (!appointments || appointments.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No appointments found for this patient"
                });
            }
            res.status(200).json({
                success: true,
                message: "Appointments fetched successfully",
                count: appointments.length,
                data: appointments
            });
        } catch (error) {
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

    getDoctorTotalAppointments: async (req, res) => {
        try {
            const { fullName } = req.params;
            
            console.log("Searching for doctor with name:", fullName); // Debug log
    
            // METHOD 1: Exact match (case sensitive)
            const doctor = await adddoctorModel.findOne({ fullName: fullName });
    
            if (!doctor) {
                console.log("Available doctors:", 
                    await adddoctorModel.find({}, 'fullName')); // Log all doctors
                return res.status(404).json({
                    success: false,
                    message: `Doctor not found with name: ${fullName}`,
                    debug: {
                        searchedName: fullName,
                        availableDoctors: await adddoctorModel.find({}, 'fullName')
                    }
                });
            }

            // Get appointments for the doctor
            const appointments = await appointmentModel.find({ doctorId: doctor._id })
                .populate('patientId', 'fullName email')
                .sort({ appointmentDate: -1 });

            console.log(`Found ${appointments.length} appointments for doctor ${fullName}`);

            return res.status(200).json({
                success: true,
                message: "Doctor appointments fetched successfully",
                data: {
                    doctor: {
                        id: doctor._id,
                        fullName: doctor.fullName,
                        email: doctor.email,
                        specialization: doctor.specialization
                    },
                    appointments: appointments,
                    totalAppointments: appointments.length
                }
            });
        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ success: false, message: error.message });
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

  
};    
module.exports = appointmentController;