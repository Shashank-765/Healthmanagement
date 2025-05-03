const jwt = require('jsonwebtoken');
const medicalHistoryService = require('../../services/medicalHistoryService');
const appointmentModel = require('../../models/appointment/appointmentModel');
const AddPatient = require('../../models/patient/addpatientModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const mongoose = require('mongoose');
const medicalHistoryModel = require('../../models/medicalHistory/medicalHistoryModel');
const medicalHistoryController = {
    createMedicalHistory: async (req, res) => {
        try {
            const {
                patientEmail,
                doctorEmail,
                condition,
                notes,
                date
            } = req.body;

            // Get token
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: "No token provided"
                });
            }

            // Decode token
            const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
            console.log("Decoded token:", decodedToken);

            // Find doctor using email
            const doctor = await adddoctorModel.findOne({ 
                email: doctorEmail.toLowerCase()
            });

            console.log("Looking for doctor with email:", doctorEmail);
            console.log("Found doctor:", doctor ? {
                id: doctor._id,
                email: doctor.email,
                name: doctor.fullName
            } : null);

            if (!doctor) {
                return res.status(400).json({
                    success: false,
                    message: "Doctor not found with the provided email."
                });
            }

            // Find patient
            const patient = await AddPatient.findOne({ 
                email: patientEmail.toLowerCase()
            });

            if (!patient) {
                return res.status(400).json({
                    success: false,
                    message: "Patient not found with the provided email."
                });
            }

            // Check for valid appointment using emails
            const appointment = await appointmentModel.findOne({
                $or: [
                    {
                        patientId: patient._id,
                        doctorId: doctor._id,
                    },
                    {
                        patientEmail: patientEmail.toLowerCase(),
                        doctorEmail: doctorEmail.toLowerCase()
                    }
                ],
                status: { $in: ['confirmed', 'confirm', 'pending', 'approved'] }
            });

            if (!appointment) {
                return res.status(400).json({
                    success: false,
                    message: "No valid appointment found between you and this patient."
                });
            }

            // Create medical history
            const result = await medicalHistoryService.createMedicalHistory({
                patientId: patient._id,
                doctorId: doctor._id,
                date: date || new Date(),
                condition,
                notes
            });

            res.status(201).json({
                success: true,
                message: "Medical history created successfully",
                data: result
            });

        } catch (error) {
            console.error("Full error details:", error);
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: "Invalid token"
                });
            }
            res.status(500).json({
                success: false,
                message: error.message || "Failed to create medical history"
            });
        }
    },    

    getAllMedicalHistory: async (req, res) => {
        try {
            const result = await medicalHistoryService.getAllMedicalHistory();
            res.status(200).json(result);
        } catch (error) {
            console.log("Error fetching all medical history:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch medical history"
            });
        }
    },

    getDoctorPatientHistory: async (req, res) => {
        try {
            const doctorId = req.user.id;

            // Check if user is a doctor
            if (req.user.role !== 'doctor') {
                return res.status(403).json({
                    success: false,
                    message: "Unauthorized: Only doctors can view patient history"
                });
            }

            const result = await medicalHistoryService.getDoctorPatientHistory(doctorId);
            res.status(200).json(result);
        } catch (error) {
            console.log("Error fetching doctor's patient history:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch patient history"
            });
        }
    },

    getPatientMedicalHistory: async (req, res) => {
        try {
            const userEmail = req.user.email; // Get patient email from token

            // Find patient by email
            const patient = await AddPatient.findOne({ email: userEmail });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found."
                });
            }

            // Get medical history for this patient
            const history = await medicalHistoryService.getPatientMedicalHistory(patient._id);

            res.status(200).json({
                success: true,
                message: "Patient medical history fetched successfully",
                data: history.data
            });
        } catch (error) {
            console.log("Error fetching patient's medical history:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch medical history"
            });
        }
    },

    editMedicalHistory: async (req, res) => {
        try {
            const historyId = req.params.id;
            const { condition, notes } = req.body;
            const doctorEmail = req.user.email;

            // 1. Find the doctor by email
            const doctor = await adddoctorModel.findOne({ email: doctorEmail.toLowerCase() });
            if (!doctor) {
                return res.status(404).json({ success: false, message: "Doctor not found." });
            }

            // 2. Fetch the medical history record
            const record = await medicalHistoryService.getMedicalHistoryById(historyId);
            if (!record) {
                return res.status(404).json({ success: false, message: "Medical history not found" });
            }

            // 3. Only allow the doctor who created it to edit
            if (record.doctorId.toString() !== doctor._id.toString()) {
                return res.status(403).json({ success: false, message: "Unauthorized: Only the doctor who created this record can edit it." });
            }

            // 4. Update only condition and notes
            const updated = await medicalHistoryService.editMedicalHistory(historyId, { condition, notes });
            res.status(200).json({ success: true, message: "Medical history updated", data: updated });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message || "Failed to update medical history" });
        }
    },
    getMedicalHistoryByDoctor: async (req, res) => {
        try {
            const { email } = req.params;
    
            // Find doctor by email
            const doctor = await adddoctorModel.findOne({ email });
    
            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message: 'Doctor not found with this email.'
                });
            }
    
            // Get medical records by doctor._id and populate names
            const medicalRecords = await medicalHistoryModel.find({ doctorId: doctor._id })
                .populate({
                    path: 'patientId',
                    model: 'AddPatient',
                    select: 'fullName'
                })
                .populate({
                    path: 'doctorId',
                    model: 'adddoctor',
                    select: 'fullName'
                })
                .sort({ date: -1 });
    
            const formattedData = medicalRecords.map(record => ({
                _id: record._id,
                patientName: record.patientId?.fullName || 'N/A',
                doctorName: record.doctorId?.fullName || 'N/A',
                condition: record.condition,
                notes: record.notes,
                date: record.date
            }));
    
            res.status(200).json({
                success: true,
                data: formattedData
            });
        } catch (error) {
            console.log(error.message);
            res.status(500).json({
                success: false,
                message: 'Something went wrong while fetching medical history.'
            });
        }
    }
};


module.exports = medicalHistoryController; 