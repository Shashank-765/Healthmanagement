const appointmentModel = require('../models/appointment/appointmentModel');
const addPatientModel = require('../models/patient/addpatientModel');
const addDoctorModel = require('../models/doctor/adddoctorModel');  // This imports the 'adddoctor' model
const mongoose = require('mongoose');

const appointmentService = {
    createAppointment: async (appointmentData) => {
        try {
            console.log("1. Starting appointment creation process...");
            console.log("Patient ID received:", appointmentData.patientId);
            
            // Ensure valid ObjectId
            if (!mongoose.Types.ObjectId.isValid(appointmentData.patientId)) {
                throw new Error("Invalid patient ID format");
            }

            // List all patients in the database for debugging
            const allPatients = await addPatientModel.find({}, '_id fullName email');
            console.log('All patients in database:', JSON.stringify(allPatients, null, 2));

            // Check if patient exists in hospital records
            const patient = await addPatientModel.findById(appointmentData.patientId);
            console.log("Patient lookup result:", patient ? "Found" : "Not found");
            
            if (!patient) {
                // Let's try to find the patient by ID to double-check
                const allPatients = await addPatientModel.find({});
                console.log("All patients in database:", allPatients.map(p => ({
                    id: p._id.toString(),
                    name: p.fullName,
                    email: p.email
                })));
                
                throw new Error("Patient not found in hospital records");
            }
            console.log("2. Patient verified:", {
                patientId: patient._id,
                name: patient.fullName,
                email: patient.email
            });

            // Check if doctor exists and belongs to the department
            const doctor = await addDoctorModel.findOne({
                _id: appointmentData.doctorId,
                specialization: appointmentData.department
            });
            
            if (!doctor) {
                throw new Error("Doctor not found or does not belong to selected department");
            }
            console.log("3. Doctor and department verified");

            // Validate appointment date
            const appointmentDate = new Date(appointmentData.appointmentDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (appointmentDate < today) {
                throw new Error("Appointment date cannot be in the past");
            }
            console.log("4. Date validation passed");

            // Check if time slot is available
            const existingAppointment = await appointmentModel.findOne({
                $or: [
                    // Check if doctor has an appointment at this time
                    {
                        doctorId: doctor._id,
                        appointmentDate: appointmentData.appointmentDate,
                        appointmentTime: appointmentData.appointmentTime,
                        status: { $ne: 'cancelled' }
                    },
                    // Check if patient has an appointment at this time
                    {
                        patientId: patient._id,
                        appointmentDate: appointmentData.appointmentDate,
                        appointmentTime: appointmentData.appointmentTime,
                        status: { $ne: 'cancelled' }
                    }
                ]
            });

            if (existingAppointment) {
                if (existingAppointment.doctorId.toString() === doctor._id.toString()) {
                    throw new Error("This time slot is already booked by another patient. Please select another time.");
                } else {
                    throw new Error("You already have an appointment at this time. Please select another time.");
                }
            }
            console.log("5. Time slot is available");

            // Create new appointment
            const appointment = new appointmentModel({
                patientId: patient._id,
                doctorId: doctor._id,
                department: appointmentData.department,
                appointmentDate: appointmentData.appointmentDate,
                appointmentTime: appointmentData.appointmentTime,
                reason: appointmentData.reason,
                status: 'pending' // Default status for new appointments
            });

            // Save appointment
            const savedAppointment = await appointment.save();
            console.log("6. Appointment created");

            // Update patient's appointments array
            await addPatientModel.findByIdAndUpdate(
                patient._id,
                { $push: { appointments: savedAppointment._id } }
            );
            console.log("7. Updated patient records");

            // Update doctor's appointments array
            await addDoctorModel.findByIdAndUpdate(
                doctor._id,
                { $push: { appointments: savedAppointment._id } }
            );
            console.log("8. Updated doctor records");

            // Return populated appointment details
            const populatedAppointment = await appointmentModel.findById(savedAppointment._id)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName specialization');

            return {
                success: true,
                message: "Appointment created successfully",
                data: {
                    appointmentId: populatedAppointment._id,
                    patient: {
                        name: populatedAppointment.patientId.fullName,
                        email: populatedAppointment.patientId.email
                    },
                    doctor: {
                        name: populatedAppointment.doctorId.fullName,
                        specialization: populatedAppointment.doctorId.specialization
                    },
                    department: populatedAppointment.department,
                    appointmentDate: populatedAppointment.appointmentDate,
                    appointmentTime: populatedAppointment.appointmentTime,
                    reason: populatedAppointment.reason,
                    status: populatedAppointment.status
                }
            };
        } catch (error) {
            console.log("Error in appointment service:", error.message);
            throw error; // Throw error to be handled by controller
        }
    },

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
            console.log("❌ Error fetching patient appointments:", error);
            throw error;
        }
    },

    getDoctorAppointments: async (doctorName) => {
        try {
            console.log("1. Finding doctor by name...");

            // Find doctor by name (case-insensitive)
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

            console.log(`2. Found ${appointments.length} appointments for doctor`);

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
            console.log("1. Fetching all doctors...");

            // Get all doctors
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

            console.log(`2. Found ${doctors.length} doctors`);

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
            console.log("1. Finding patient and appointment...");

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

            console.log("2. Appointment deleted successfully");

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
            console.log("1. Finding doctor and patient...");

            // Find doctor by name
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

            console.log(`2. Appointment status updated to ${status}`);

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
            console.log("❌ Error updating appointment status:", error.message);
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

            console.log("2. Pending appointment deleted successfully");

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
            console.log("❌ Error deleting patient appointment:", error.message);
            throw error;
        }
    }
};

module.exports = appointmentService;
