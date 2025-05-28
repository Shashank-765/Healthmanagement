const appointmentModel = require('../models/appointment/appointmentModel');
const addPatientModel = require('../models/patient/addpatientModel');
const addDoctorModel = require('../models/doctor/adddoctorModel');  // This imports the 'adddoctor' model
const mongoose = require('mongoose');
const IPFSService = require('../services/ipfsService');

const appointmentService = {
    getPatientAppointments: async (patientId) => {
        try {
     // Verify patient exists
            const patient = await addPatientModel.findById(patientId);
            if (!patient) {
                throw new Error("Patient not found in hospital records");
            }

            // Get all appointments for the patient
            const appointments = await appointmentModel.find({ patientId })
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName email medicalCondition')
                .sort({ appointmentDate: 1, appointmentTime: 1 });

            console.log(`2. Found ${appointments.length} appointments`);

            return {
                success: true,
                message: "Patient appointments fetched successfully",
                data: {
                    patient: {
                        id: patient._id,
                        name: patient.fullName,
                        email: patient.email
                    },
                    appointments: appointments,
                    totalAppointments: appointments.length
                }
            };
        } catch (error) {
            console.log(" Error fetching patient appointments:", error);
            throw error;
        }
    },

    getDoctorAppointments: async (doctorName) => {
        try {
      const doctor = await addDoctorModel.findOne({
                fullName: { $regex: new RegExp(`^${doctorName}$`, 'i') }
            });

            if (!doctor) {
                throw new Error("Doctor not found");
            }

            // Get all appointments for the doctor
            const appointments = await appointmentModel.find({ doctorId: doctor._id })
                .populate('patientId', 'fullName email medicalCondition')
                .populate('doctorId', 'fullName specialization')
                .sort({ appointmentDate: 1, appointmentTime: 1 });

              return {
                success: true,
                message: "Doctor appointments fetched successfully",
                data: {
                    doctor: {
                        id: doctor._id,
                        name: doctor.fullName,
                        specialization: doctor.specialization
                    },
                    appointments: appointments,
                    totalAppointments: appointments.length
                }
            };
        } catch (error) {
            console.log("Error fetching doctor appointments:", error.message);
            throw error;
        }
    },

    getAllDoctorsWithAppointments: async () => {
        try { 
            const doctors = await addDoctorModel.find()
                .select('fullName specialization experience availability');

            // Get appointments for each doctor
            const doctorsWithAppointments = await Promise.all(doctors.map(async (doctor) => {
                const appointments = await appointmentModel.find({ doctorId: doctor._id })
                    .populate('patientId', 'fullName email medicalCondition')
                    .sort({ appointmentDate: 1, appointmentTime: 1 });

                return {
                    doctor: {
                        id: doctor._id,
                        name: doctor.fullName,
                        specialization: doctor.specialization,
                        experience: doctor.experience,
                        availability: doctor.availability
                    },
                    appointments: appointments,
                    totalAppointments: appointments.length
                };
            }));
            return {
                success: true,
                message: "All doctors and their appointments fetched successfully",
                data: {
                    totalDoctors: doctors.length,
                    doctors: doctorsWithAppointments
                }
            };
        } catch (error) {
            console.log(" Error fetching all doctors:", error.message);
            throw error;
        }
    },

    deleteAppointmentByPatientName: async (patientName, doctorId) => {
        try {
            // Find patient by name
            const patient = await addPatientModel.findOne({
                fullName: { $regex: new RegExp(`^${patientName}$`, 'i') }
            });

            if (!patient) {
                throw new Error("Patient not found");
            }

            // Find appointment with both patient and doctor
            const appointment = await appointmentModel.findOne({
                patientId: patient._id,
                doctorId: doctorId
            });

            if (!appointment) {
                throw new Error("No appointment found for this patient with the doctor");
            }

            // Remove appointment reference from patient
            await addPatientModel.findByIdAndUpdate(patient._id, {
                $pull: { appointments: appointment._id }
            });

            // Remove appointment reference from doctor
            await addDoctorModel.findByIdAndUpdate(doctorId, {
                $pull: { appointments: appointment._id }
            });

            // Delete the appointment
            await appointmentModel.findByIdAndDelete(appointment._id);
            return {
                success: true,
                message: "Appointment deleted successfully",
                data: {
                    appointmentId: appointment._id,
                    patientName: patient.fullName,
                    appointmentDate: appointment.appointmentDate,
                    appointmentTime: appointment.appointmentTime
                }
            };
        } catch (error) {
            console.log(" Error deleting appointment:", error.message);
            throw error;
        }
    },

    updatePatientStatus: async (patientName, doctorName, status) => {
        try {
            const doctor = await addDoctorModel.findOne({
                fullName: { $regex: new RegExp(`^${doctorName}$`, 'i') }
            });

            if (!doctor) {
                throw new Error("Doctor not found");
            }

            // Find patient by name
            const patient = await addPatientModel.findOne({
                fullName: { $regex: new RegExp(`^${patientName}$`, 'i') }
            });

            if (!patient) {
                throw new Error("Patient not found");
            }

            // Find appointment with both patient and doctor
            const appointment = await appointmentModel.findOne({
                patientId: patient._id,
                doctorId: doctor._id
            });

            if (!appointment) {
                throw new Error("No appointment found for this patient with the specified doctor");
            }

            // Validate status
            if (!['confirm', 'pending', 'cancelled'].includes(status)) {
                throw new Error("Invalid status. Must be: confirm, pending, or cancelled");
            }

            // Update appointment status
            const updatedAppointment = await appointmentModel.findByIdAndUpdate(
                appointment._id,
                { status },
                { new: true }
            ).populate('patientId', 'fullName email')
             .populate('doctorId', 'fullName specialization');
            return {
                success: true,
                message: `Appointment status updated to ${status} successfully`,
                data: {
                    appointmentId: updatedAppointment._id,
                    patientName: updatedAppointment.patientId.fullName,
                    doctorName: updatedAppointment.doctorId.fullName,
                    appointmentDate: updatedAppointment.appointmentDate,
                    appointmentTime: updatedAppointment.appointmentTime,
                    status: updatedAppointment.status,
                    reason: updatedAppointment.reason
                }
            };
        } catch (error) {
            console.log(" Error updating appointment status:", error.message);
            throw error;
        }
    },
    getAllAppointments: async (req, res) => {
        try {
            const userRole = req.user.role;
            
            const result = await appointmentService.getAllAppointments(userRole);
            
            res.status(200).json(result);
        } catch (error) {
            console.log("Error in getAllAppointments:", error.message);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },
    getAppointmentsByDoctorName: async (req, res) => {
        try {
            const { doctorName } = req.params;
            
            if (!doctorName) {
                return res.status(400).json({
                    success: false,
                    message: "Doctor name is required"
                });
            }

            const result = await appointmentService.getAppointmentsByDoctorName(doctorName);
            
            res.status(200).json(result);
        } catch (error) {
            console.log(" Error in getAppointmentsByDoctorName:", error.message);
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },
    patientDeleteOwnAppointment: async (patientName, patientId) => {
        try {
            console.log("1. Finding patient and pending appointments...");

            // Find patient by name and ID to ensure authenticity
            const patient = await addPatientModel.findOne({
                _id: patientId,
                fullName: { $regex: new RegExp(`^${patientName}$`, 'i') }
            });

            if (!patient) {
                throw new Error("Patient not found or name doesn't match");
            }

            // Find pending appointment for this patient
            const appointment = await appointmentModel.findOne({
                patientId: patient._id,
                status: 'pending'
            }).populate('doctorId');

            if (!appointment) {
                throw new Error("No pending appointment found for this patient");
            }

            // Remove appointment reference from patient
            await addPatientModel.findByIdAndUpdate(patient._id, {
                $pull: { appointments: appointment._id }
            });

            // Remove appointment reference from doctor
            await addDoctorModel.findByIdAndUpdate(appointment.doctorId._id, {
                $pull: { appointments: appointment._id }
            });

            // Delete the appointment
            await appointmentModel.findByIdAndDelete(appointment._id);
            return {
                success: true,
                message: "Your pending appointment has been deleted successfully",
                data: {
                    appointmentId: appointment._id,
                    patientName: patient.fullName,
                    doctorName: appointment.doctorId.fullName,
                    appointmentDate: appointment.appointmentDate,
                    appointmentTime: appointment.appointmentTime,
                    status: appointment.status
                }
            };
        } catch (error) {
            console.log(" Error deleting patient appointment:", error.message);
            throw error;
        }
    },
    getAppointmentDetails: async (appointmentId) => {
        try {
            const appointment = await appointmentModel.findById(appointmentId);
            if (!appointment) {
                throw new Error('Appointment not found');
            }

            // Get sensitive data from IPFS
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                appointment.ipfsCID,
                appointment.ipfsIV
            );

            return {
                ...appointment.toObject(),
                appointmentDetails: sensitiveData
            };
        } catch (error) {
            console.error('Error retrieving appointment details:', error);
            throw error;
        }
    },
    deleteAppointmentById: async (appointmentId) => {
        try {
            // Find the appointment
            const appointment = await appointmentModel.findById(appointmentId);
            
            if (!appointment) {
                throw new Error("Appointment not found");
            }

            // Remove appointment reference from patient
            await addPatientModel.findByIdAndUpdate(appointment.patientId, {
                $pull: { appointments: appointment._id }
            });

            // Remove appointment reference from doctor
            await addDoctorModel.findByIdAndUpdate(appointment.doctorId, {
                $pull: { appointments: appointment._id }
            });

            // Delete the appointment
            await appointmentModel.findByIdAndDelete(appointmentId);

            return {
                success: true,
                message: "Appointment deleted successfully",
                data: {
                    appointmentId: appointment._id,
                    appointmentDate: appointment.appointmentDate,
                    appointmentTime: appointment.appointmentTime
                }
            };
        } catch (error) {
            console.log("Error deleting appointment:", error.message);
            throw error;
        }
    },
    getDoctorOwnAppointments: async (req, res) => {
        try {
            if (req.user.role !== 'doctor') {
                return res.status(403).json({ success: false, message: "Only doctors can view their appointments" });
            }
            
            const doctorEmail = req.user.email;
            const doctor = await addDoctorModel.findOne({ email: doctorEmail });
            if (!doctor) {
                return res.status(404).json({ success: false, message: "Doctor not found" });
            }
            
            const appointments = await appointmentModel.find({ doctorId: doctor._id })
                .populate('patientId', 'fullName email')
                .sort({ createdAt: -1 });
            // Get IPFS data for each appointment
            const appointmentsWithDetails = await Promise.all(appointments.map(async (appointment) => {
                try {
                    // Get sensitive data from IPFS
                    const sensitiveData = await IPFSService.retrieveAndDecrypt(
                        appointment.ipfsCID,
                        appointment.ipfsIV
                    );
                    // Ensure we have valid date and time
                    const appointmentDate = sensitiveData.appointmentDate || new Date().toISOString().split('T')[0];
                    const appointmentTime = sensitiveData.appointmentTime || '12:00 PM';

                    return {
                        _id: appointment._id,
                        patientName: appointment.patientId?.fullName || 'N/A',
                        email: appointment.patientId?.email || 'N/A',
                        appointmentDate: appointmentDate,
                        appointmentTime: appointmentTime,
                        dateTime: `${new Date(appointmentDate).toLocaleDateString()} ${appointmentTime}`,
                        status: sensitiveData.status || 'pending', // Default to pending if not set
                        doctorId: appointment.doctorId.toString(),
                        department: sensitiveData.department || 'N/A',
                        reason: sensitiveData.reason || 'N/A',
                        createdAt: appointment.createdAt,
                        updatedAt: appointment.updatedAt
                    };
                } catch (error) {
                    console.error('Error retrieving IPFS data for appointment:', appointment._id, error);
                    
                    // Return with fallback data
                    return {
                        _id: appointment._id,
                        patientName: appointment.patientId?.fullName || 'N/A',
                        email: appointment.patientId?.email || 'N/A',
                        appointmentDate: new Date().toISOString().split('T')[0],
                        appointmentTime: '12:00 PM',
                        dateTime: `${new Date().toLocaleDateString()} 12:00 PM`,
                        status: 'pending', // Default status
                        doctorId: appointment.doctorId.toString(),
                        department: 'N/A',
                        reason: 'N/A',
                        error: 'Failed to retrieve appointment details'
                    };
                }
            }));

            console.log('Final processed appointments:', appointmentsWithDetails);

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
    }
};

module.exports = appointmentService;
