const medicalHistoryModel = require('../models/medicalHistory/medicalHistoryModel');
const patientModel = require('../models/patient/addpatientModel');
const doctorModel = require('../models/doctor/adddoctorModel');
const appointmentModel = require('../models/appointment/appointmentModel');
const mongoose = require('mongoose');

const medicalHistoryService = {
    createMedicalHistory: async (medicalHistoryData) => {
        try {
            // Create new medical history entry
            const medicalHistory = new medicalHistoryModel({
                patientId: medicalHistoryData.patientId,
                doctorId: medicalHistoryData.doctorId,
                date: medicalHistoryData.date,
                condition: medicalHistoryData.condition,
                medications: medicalHistoryData.medications,
                followUpDate: medicalHistoryData.followUpDate,
                notes: medicalHistoryData.notes,
                department: medicalHistoryData.department,
                visitTime: medicalHistoryData.visitTime,
                recoveryDate: medicalHistoryData.recoveryDate
            });
    
            const savedHistory = await medicalHistory.save();
    
            // Return populated medical history
            const populatedHistory = await medicalHistoryModel.findById(savedHistory._id)
                .populate({
                    path: 'patientId',
                    model: 'AddPatient',
                    select: 'fullName email'
                })
                .populate({
                    path: 'doctorId',
                    model: 'adddoctor',
                    select: 'fullName specialization'
                });
    
            return {
                success: true,
                message: "Medical history created successfully",
                data: populatedHistory
            };
        } catch (error) {
            console.log("Error creating medical history:", error.message);
            throw error;
        }
    },    

    updateMedicalHistory: async (historyId, updateData) => {
        try {
            // Validate the update data
            const validFields = [
                'date',
                'condition',
                'medications',
                'followUpDate',
                'notes',
                'department',
                'visitTime'
            ];

            // Filter out any fields that aren't in our valid fields list
            const sanitizedUpdateData = Object.keys(updateData)
                .filter(key => validFields.includes(key))
                .reduce((obj, key) => {
                    obj[key] = updateData[key];
                    return obj;
                }, {});

            // Add updated timestamp
            sanitizedUpdateData.updatedAt = new Date();

            const updatedHistory = await medicalHistoryModel.findByIdAndUpdate(
                historyId,
                sanitizedUpdateData,
                { 
                    new: true,
                    runValidators: true
                }
            )
            .populate('patientId', 'fullName email')
            .populate('doctorId', 'fullName specialization');

            if (!updatedHistory) {
                throw new Error("Medical history record not found");
            }

            return {
                success: true,
                message: "Medical history updated successfully",
                data: updatedHistory
            };
        } catch (error) {
            console.log("Error updating medical history:", error.message);
            throw error;
        }
    },

    getPatientMedicalHistory: async (patientId) => {
        try {
            const history = await medicalHistoryModel.find({ patientId })
                .populate({
                    path: 'doctorId',
                    model: 'adddoctor',
                    select: 'fullName specialization'
                })
                .populate({
                    path: 'patientId',
                    model: 'AddPatient',
                    select: 'fullName email'
                })
                .sort({ date: -1 });

            return {
                success: true,
                message: "Patient medical history fetched successfully",
                data: history
            };
        } catch (error) {
            console.log("Error fetching patient medical history:", error.message);
            throw error;
        }
    },

    getDoctorPatientHistory: async (doctorId) => {
        try {
            const history = await medicalHistoryModel.find({ doctorId })
                .populate('patientId', 'fullName email')
                .sort({ date: -1 });

            return {
                success: true,
                message: "Doctor's patient history fetched successfully",
                data: history
            };
        } catch (error) {
            console.log("Error fetching doctor's patient history:", error.message);
            throw error;
        }
    },

    getSpecificPatientHistoryForDoctor: async (doctorId, patientName) => {
        try {
            // Find patient by name
            const patient = await appointmentModel.findOne({
                fullName: { $regex: new RegExp(`^${patientName}$`, 'i') }
            });

            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get medical history for this specific patient and doctor
            const history = await medicalHistoryModel.find({
                doctorId,
                patientId: patient._id
            })
            .populate('patientId', 'fullName email')
            .populate('doctorId', 'fullName specialization')
            .sort({ date: -1 });

            return {
                success: true,
                message: "Patient's medical history fetched successfully",
                data: history
            };
        } catch (error) {
            console.log("Error fetching specific patient history:", error.message);
            throw error;
        }
    },

    getPatientHistoryById: async (patientId) => {
        try {
            // Find patient first to verify they exist
            const patient = await appointmentModel.findById(patientId);
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get all medical history records for this patient
            const history = await medicalHistoryModel.find({ patientId })
                .populate('doctorId', 'fullName specialization email')
                .populate('patientId', 'fullName email')
                .sort({ date: -1 });

            return {
                success: true,
                message: "Patient medical history fetched successfully",
                data: {
                    patient: {
                        id: patient._id,
                        fullName: patient.fullName,
                        email: patient.email
                    },
                    history: history
                }
            };
        } catch (error) {
            console.log("Error fetching patient history by ID:", error.message);
            throw error;
        }
    },

    createPatientHistory: async (medicalHistoryData) => {
        try {
            // Validate patient and doctor
            const patient = await appointmentModel.findById(medicalHistoryData.patientId);
            if (!patient) {
                throw new Error("Patient not found");
            }

            const doctor = await appointmentModel.findById(medicalHistoryData.doctorId);
            if (!doctor) {
                throw new Error("Doctor not found");
            }

            // Create new medical history
            const medicalHistory = new medicalHistoryModel({
                patientId: medicalHistoryData.patientId,
                doctorId: medicalHistoryData.doctorId,
                date: medicalHistoryData.date,
                condition: medicalHistoryData.condition,
                medications: medicalHistoryData.medications,
                followUpDate: medicalHistoryData.followUpDate,
                notes: medicalHistoryData.notes,
                department: medicalHistoryData.department,
                visitTime: medicalHistoryData.visitTime,
                recoveryDate: medicalHistoryData.recoveryDate
            });

            const savedHistory = await medicalHistory.save();

            // Return populated medical history
            const populatedHistory = await medicalHistoryModel.findById(savedHistory._id)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName specialization');

            return {
                success: true,
                message: "Medical history created successfully",
                data: populatedHistory
            };
        } catch (error) {
            console.log("Error creating medical history:", error.message);
            throw error;
        }
    },

    getAllMedicalHistory: async () => {
        try {
            const history = await medicalHistoryModel.find()
                .populate({
                    path: 'patientId',
                    model: 'AddPatient',
                    select: 'fullName email'
                })
                .populate({
                    path: 'doctorId',
                    model: 'adddoctor',
                    select: 'fullName specialization'
                })
                .sort({ createdAt: -1 });

            return {
                success: true,
                message: "All medical history fetched successfully",
                data: history
            };
        } catch (error) {
            console.log("Error fetching all medical history:", error.message);
            throw error;
        }
    }
};

module.exports = medicalHistoryService; 