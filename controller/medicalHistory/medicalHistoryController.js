const medicalHistoryService = require('../../services/medicalHistoryService');
const appointmentModel = require('../../models/appointment/appointmentModel');
const mongoose = require('mongoose');

const medicalHistoryController = {
    createMedicalHistory: async (req, res) => {
        try {
            const {
                patientId,
                date,
                condition,
                medications,
                followUpDate,
                notes,
                department,
                visitTime,
                recoveryDate
            } = req.body;
    
            // Find appointment to get doctorId
            const appointment = await appointmentModel.findOne({
                patientId: patientId,
                status: { $in: ['completed', 'confirmed', 'confirm', 'pending', 'approved'] }
            });
    
            if (!appointment) {
                return res.status(400).json({
                    success: false,
                    message: "No valid appointment found for this patient. Please check if the appointment exists and has a valid status."
                });
            }
    
            // Create medical history with doctorId from appointment
            const result = await medicalHistoryService.createMedicalHistory({
                patientId: appointment.patientId,
                doctorId: appointment.doctorId,
                date,
                condition,
                medications,
                followUpDate,
                notes,
                department,
                visitTime,
                recoveryDate
            });
    
            res.status(201).json(result);
        } catch (error) {
            console.log("Error creating medical history:", error.message);
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
            const userEmail = req.user.email; // Get user email from token

            // Find patient's appointment using email
            const appointment = await appointmentModel.findOne({ 
                email: userEmail,
                status: { $in: ['completed', 'confirmed', 'confirm', 'pending', 'approved'] }
            });

            if (!appointment) {
                return res.status(404).json({
                    success: false,
                    message: "No appointment found for this user. Please make sure you have a valid appointment."
                });
            }

            // Get all appointments for this patient to get all possible patient IDs
            const appointments = await appointmentModel.find({ 
                email: userEmail,
                status: { $in: ['completed', 'confirmed', 'confirm', 'pending', 'approved'] }
            });

            // Extract all unique patient IDs
            const patientIds = [...new Set(appointments.map(app => app.patientId.toString()))];

            // Get medical history for all patient IDs
            const allHistory = await Promise.all(
                patientIds.map(patientId => 
                    medicalHistoryService.getPatientMedicalHistory(patientId)
                )
            );

            // Combine all history records
            const combinedHistory = allHistory.reduce((acc, curr) => {
                if (curr.success && curr.data) {
                    return [...acc, ...curr.data];
                }
                return acc;
            }, []);

            res.status(200).json({
                success: true,
                message: "Patient medical history fetched successfully",
                data: combinedHistory
            });
        } catch (error) {
            console.log("Error fetching patient's medical history:", error.message);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch medical history"
            });
        }
    }
};

module.exports = medicalHistoryController; 