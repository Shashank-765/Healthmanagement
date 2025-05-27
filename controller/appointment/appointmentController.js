const appointmentModel = require('../../models/appointment/appointmentModel');
const appointmentService = require('../../services/appointmentService');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const addpatientModel = require('../../models/patient/addpatientModel');
const IPFSService = require('../../services/ipfsService');
const mongoose = require('mongoose');
const appointmentController = {
    createAppointment: async (req, res) => {
        try {
            const { department, doctorId, appointmentDate, appointmentTime, reason } = req.body;
            const patientEmail = req.user.email.toLowerCase();  

            const patient = await addpatientModel.findOne({ email: patientEmail });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: 'Patient not found',
                });
            }

            // Prepare appointment data
            const appointmentData = {
                patientId: patient._id,
                department,
                doctorId,
                appointmentDate,
                appointmentTime,
                reason
            };
            console.log('[DEBUG] Appointment data to be sent to service:', appointmentData);

            const result = await appointmentService.createAppointment(appointmentData);
            console.log('[DEBUG] Result from appointmentService.createAppointment:', result);

            // Create notification
            if (result.success) {
                try {
                    console.log('[DEBUG] Looking for doctor with ID:', doctorId);
                    const doctor = await adddoctorModel.findById(doctorId);

                    if (doctor) {
                        console.log('[DEBUG] Doctor found:', doctor._id);
                        await notificationController.createAppointmentNotificationInternal({
                            doctorId: doctor._id,
                            patientId: patient._id,
                            appointmentId: result.data.appointmentId,
                            patientName: patient.fullName
                        });
                        console.log('[DEBUG] Notification creation result:', notification);
                    } else {
                        console.error('[ERROR] Doctor not found with ID:', doctorId);
                    }
                } catch (notificationError) {
                    console.error('[ERROR] Exception while creating notification:', notificationError);
                }
            } else {
                console.error('[ERROR] Appointment creation failed:', result);
            }

            res.status(201).json(result);
            console.log('[DEBUG] Appointment creation response sent to client.');
        } catch (error) {
            console.error('[ERROR] Exception in createAppointment:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create appointment'
            });
        }
    },

    getPatientAppointmentsByName: async (req, res) => {
        try {
       const patientEmail = req.user.email.toLowerCase();  
            // Find patient in addpatientModel using email
            const patient = await addpatientModel.findOne({ 
                email: patientEmail 
            });
            
            if (!patient) {
            return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }
            
            const patientId = patient._id;
           
            // Get appointments with populated doctor info
            const appointments = await appointmentModel.find({ patientId })
                .populate('doctorId', 'fullName specialization')
                .sort({ createdAt: -1 });
            // Get IPFS data for each appointment
            const appointmentsWithDetails = await Promise.all(appointments.map(async (appointment) => {
                try {
                    // Get sensitive data from IPFS
                    const sensitiveData = await IPFSService.retrieveAndDecrypt(
                        appointment.ipfsCID,
                        appointment.ipfsIV
                    );

                    return {
                        _id: appointment._id,
                        doctor: {
                            id: appointment.doctorId._id,
                            name: appointment.doctorId.fullName,
                            specialization: appointment.doctorId.specialization
                        },
                        appointmentDate: sensitiveData.appointmentDate,
                        appointmentTime: sensitiveData.appointmentTime,
                        department: sensitiveData.department,
                        reason: sensitiveData.reason,
                        status: sensitiveData.status,
                        createdAt: appointment.createdAt,
                        updatedAt: appointment.updatedAt
                    };
                } catch (error) {
                      return {
                        _id: appointment._id,
                        doctor: {
                            id: appointment.doctorId._id,
                            name: appointment.doctorId.fullName,
                            specialization: appointment.doctorId.specialization
                        },
                        error: 'Failed to retrieve appointment details'
                    };
                }
            }));

            // Return 200 with empty array if no appointments found
            res.status(200).json({
                success: true,
                message: appointmentsWithDetails.length === 0 ? "No appointments found for this patient" : "Appointments fetched successfully",
                count: appointmentsWithDetails.length,
                data: appointmentsWithDetails
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
            // Temporarily remove authentication check for testing
            // if (req.user.role === 'patient') {
            //     query.patientId = req.user.id;
            // } else if (req.user.role === 'doctor') {
            //     query.doctorId = req.user.id;
            // }
            
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
                .select('fullName specialization _id');

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

            // Validate ObjectId
            if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Invalid appointment ID format" 
                });
            }

            const appointment = await appointmentModel.findById(appointmentId);
            if (!appointment) {
                return res.status(404).json({ success: false, message: "Appointment not found" });
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
                .sort({ createdAt: -1 });

            console.log(`Found ${appointments.length} appointments for doctor`);

            // Get IPFS data for each appointment
            const appointmentsWithDetails = await Promise.all(appointments.map(async (appointment, index) => {
                try {
                    console.log(`Processing appointment ${index + 1}:`, {
                        id: appointment._id,
                        cid: appointment.ipfsCID,
                        hasIV: !!appointment.ipfsIV,
                        mongoStatus: appointment.status // Log MongoDB status
                    });

                    // Check if IPFS data exists
                    if (!appointment.ipfsCID || !appointment.ipfsIV) {
                            return {
                            _id: appointment._id,
                            patientName: appointment.patientId?.fullName || 'N/A',
                            email: appointment.patientId?.email || 'N/A',
                            appointmentDate: 'No IPFS data',
                            appointmentTime: 'No IPFS data',
                            department: 'N/A',
                            reason: 'N/A',
                            status: appointment.status, // Use MongoDB status
                            createdAt: appointment.createdAt,
                            updatedAt: appointment.updatedAt,
                            error: 'Missing IPFS CID or IV'
                        };
                    }

                    // Get sensitive data from IPFS
                    const sensitiveData = await IPFSService.retrieveAndDecrypt(
                        appointment.ipfsCID,
                        appointment.ipfsIV
                    );
                    return {
                        _id: appointment._id,
                        patientName: appointment.patientId?.fullName || 'N/A',
                        email: appointment.patientId?.email || 'N/A',
                        appointmentDate: sensitiveData.appointmentDate,
                        appointmentTime: sensitiveData.appointmentTime,
                        department: sensitiveData.department,
                        reason: sensitiveData.reason,
                        status: appointment.status || sensitiveData.status, // Use MongoDB status first, fallback to IPFS
                        createdAt: appointment.createdAt,
                        updatedAt: appointment.updatedAt
                    };
                } catch (error) {
                    console.error(`Error retrieving IPFS data for appointment ${appointment._id}:`, error);
                    return {
                        _id: appointment._id,
                        patientName: appointment.patientId?.fullName || 'N/A',
                        email: appointment.patientId?.email || 'N/A',
                        appointmentDate: 'IPFS Error',
                        appointmentTime: 'IPFS Error',
                        department: 'N/A',
                        reason: 'N/A',
                        status: appointment.status, // Use MongoDB status on error
                        createdAt: appointment.createdAt,
                        updatedAt: appointment.updatedAt,
                        error: `IPFS retrieval failed: ${error.message}`
                    };
                }
            }));

            console.log('Final processed appointments:', appointmentsWithDetails.length);

            res.status(200).json({
                success: true,
                message: "Doctor's appointments fetched successfully",
                data: {
                    appointments: appointmentsWithDetails
                }
            });
        } catch (error) {
            console.error('Error in getDoctorOwnAppointments:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message || "Failed to fetch appointments" 
            });
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

            console.log('Getting current IPFS data for update...');
            
            // Get current IPFS data
            let currentIPFSData;
            try {
                currentIPFSData = await IPFSService.retrieveAndDecrypt(
                    appointment.ipfsCID,
                    appointment.ipfsIV
                );
            } catch (error) {
                console.error('Error retrieving current IPFS data:', error);
                return res.status(500).json({
                    success: false,
                    message: "Failed to retrieve current appointment data from IPFS"
                });
            }

            // Update only the status in IPFS data
            const updatedIPFSData = {
                ...currentIPFSData,
                status: status,
                updatedAt: new Date(),
                statusUpdatedBy: req.user.email
            };

            console.log('Updated IPFS data with new status:', updatedIPFSData);

            // Upload updated data to IPFS
            let newIPFSResult;
            try {
                newIPFSResult = await IPFSService.uploadEncryptedData(updatedIPFSData);
                console.log('New IPFS upload result:', newIPFSResult);
            } catch (error) {
                console.error('Error uploading updated data to IPFS:', error);
                return res.status(500).json({
                    success: false,
                    message: "Failed to update appointment status in IPFS"
                });
            }

            // Update MongoDB document with new IPFS references
            appointment.ipfsCID = newIPFSResult.cid;
            appointment.ipfsIV = newIPFSResult.iv;
            appointment.status = status;
            appointment.updatedAt = new Date();
            
            await appointment.save();

            console.log('Successfully updated appointment status:', {
                appointmentId: appointment._id,
                newStatus: status,
                newCID: newIPFSResult.cid
            });

            res.status(200).json({
                success: true,
                message: `Appointment status updated to ${status} successfully`,
                data: {
                    appointmentId: appointment._id,
                    status: status,
                    updatedAt: appointment.updatedAt,
                    newIPFSCID: newIPFSResult.cid
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

    getAppointmentDataFromIPFS: async (req, res) => {
        try {
            const { cid, iv } = req.body;

            // Validate required fields
            if (!cid || !iv) {
                return res.status(400).json({
                    success: false,
                    message: "IPFS CID and IV are required"
                });
            }

            console.log('Retrieving IPFS data:', { cid, iv });

            // Retrieve and decrypt data from IPFS
            const appointmentData = await IPFSService.retrieveAndDecrypt(cid, iv);

            // Get additional data from MongoDB if needed
            const appointment = await appointmentModel.findOne({ ipfsCID: cid })
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName specialization');

            res.status(200).json({
                success: true,
                message: "Appointment data retrieved successfully",
                data: {
                    ipfsData: appointmentData,
                    mongoData: appointment ? {
                        patientName: appointment.patientId?.fullName,
                        doctorName: appointment.doctorId?.fullName,
                        createdAt: appointment.createdAt,
                        updatedAt: appointment.updatedAt
                    } : null
                }
            });

        } catch (error) {
            console.error("Error retrieving IPFS data:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to retrieve appointment data"
            });
        }
    },
};    
module.exports = appointmentController;