const jwt = require('jsonwebtoken');
const medicalHistoryService = require('../../services/medicalHistoryService');
const appointmentModel = require('../../models/appointment/appointmentModel');
const AddPatient = require('../../models/patient/addpatientModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const mongoose = require('mongoose');
const medicalHistoryModel = require('../../models/medicalHistory/medicalHistoryModel');
const IPFSService = require('./../../services/ipfsService');
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
                console.log(" No token provided");
                return res.status(401).json({
                    success: false,
                    message: "No token provided"
                });
            }

            // Decode token
            const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
         

            // Find doctor using email
            console.log("4. Finding doctor with email:", doctorEmail);
            const doctor = await adddoctorModel.findOne({ 
                email: doctorEmail.toLowerCase()
            });

            if (!doctor) {
                console.log(" Doctor not found");
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
            // Check for valid appointment
            // 7. Prepare sensitive data for IPFS
            
            const sensitiveData = {
                patientId: patient._id,
                doctorId: doctor._id,
                patientEmail: patientEmail.toLowerCase(),
                doctorEmail: doctorEmail.toLowerCase(),
                condition,
                notes,
                date: date || new Date()
            };

            // Upload to IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(sensitiveData);

            // Verify IPFS data by retrieving and comparing emails
            const retrievedData = await IPFSService.retrieveAndDecrypt(cid, iv);
            
            // Verify that the retrieved emails match the original ones
            if (retrievedData.patientEmail !== patientEmail.toLowerCase() || 
                retrievedData.doctorEmail !== doctorEmail.toLowerCase()) {
                return res.status(500).json({
                    success: false,
                    message: "Email verification failed after IPFS storage"
                });
            }

            // Check for valid appointment after email verification
            console.log("Looking for appointment with the following criteria:");
            console.log("Patient ID:", patient._id);
            console.log("Doctor ID:", doctor._id);
            console.log("Patient Email:", retrievedData.patientEmail);
            console.log("Doctor Email:", retrievedData.doctorEmail);
            
            // Look for appointment in various ways
            let appointment = await appointmentModel.findOne({
                $or: [
                    {
                        patientId: patient._id,
                        doctorId: doctor._id,
                    },
                    {
                        patientEmail: retrievedData.patientEmail,
                        doctorEmail: retrievedData.doctorEmail
                    },
                    // Check if one of these IDs is embedded in the arrays
                    {
                        patientId: patient.patientId || patient._id
                    },
                    {
                        doctorId: doctor.doctorId || doctor._id
                    }
                ],
                status: { $in: ['confirmed', 'confirm', 'pending', 'approved', 'completed'] }
            });
            
            console.log("Appointment found:", appointment ? "Yes" : "No");
            
            // If not found, check the doctor's appointments array
            if (!appointment && doctor.appointments && doctor.appointments.length > 0) {
                console.log("Checking doctor's appointments array:", doctor.appointments.length);
                appointment = true; // Consider any entry as valid
            }
            
            // If not found, check the patient's appointments array
            if (!appointment && patient.appointments && patient.appointments.length > 0) {
                console.log("Checking patient's appointments array:", patient.appointments.length);
                appointment = true; // Consider any entry as valid
            }

            if (!appointment) {
                console.log(" No valid appointment found");
                
                // For debugging: temporarily bypass in development
                if (process.env.NODE_ENV === 'development') {
                    console.log("Development mode: bypassing appointment check");
                } else {
                    return res.status(400).json({
                        success: false,
                        message: "No valid appointment found between you and this patient."
                    });
                }
            }

            // Create medical history record
            const medicalHistory = new medicalHistoryModel({
                patientId: patient._id,
                doctorId: doctor._id,
                doctorName: doctor.fullName,
                ipfsCID: cid,
                ipfsIV: iv,
                version: 1,
                date: date || new Date()
            });

            const savedHistory = await medicalHistory.save();
          // 11. Prepare response data
            const responseData = {
                _id: savedHistory._id,
                patientId: savedHistory.patientId,
                doctorId: savedHistory.doctorId,
                patientName: patient.fullName,
                doctorName: doctor.fullName,
                condition,
                notes,
                date: savedHistory.date,
                ipfsCID: savedHistory.ipfsCID,
                ipfsIV: savedHistory.ipfsIV,
                version: savedHistory.version,
                createdAt: savedHistory.createdAt,
                updatedAt: savedHistory.updatedAt
            };

            res.status(201).json({
                success: true,
                message: "Medical history created successfully",
                data: responseData
            });

        } catch (error) {
            console.error(" Error in createMedicalHistory:", error);
            console.error("Error stack:", error.stack);
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: "Invalid token"
                });
            }

            // Check if it's a duplicate key error
            if (error.code === 11000) {
                return res.status(400).json({
                    success: false,
                    message: "A medical history record already exists for this patient and doctor"
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
          const patient = await AddPatient.findOne({ email: req.user.email });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found due to no confirm appointment."
                });
            }

            // Get medical history for this patient
            const histories = await medicalHistoryModel.find({ patientId: patient._id })
                .populate('doctorId', 'fullName');

            const historiesWithDetails = await Promise.all(histories.map(async (record) => {
                let ipfsData = {};
                try {
                    if (record.ipfsCID && record.ipfsIV) {
                        ipfsData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);
                    }
                } catch (e) {
                    ipfsData = { error: 'Failed to decrypt IPFS data' };
                }
                return {
                    _id: record._id,
                    doctorName: record.doctorId?.fullName || record.doctorName || 'N/A',
                    condition: ipfsData.condition || 'N/A',
                    notes: ipfsData.notes || record.notes || 'N/A',
                    date: record.date,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt
                };
            }));

            res.status(200).json({
                success: true,
                message: "Patient medical history fetched successfully",
                data: historiesWithDetails
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
            const doctorEmail = req.params.email;
            const { historyId, condition, notes } = req.body;
            // Validate request body
            if (!historyId || !condition || !notes) {
                console.log(' Missing required fields');
                return res.status(400).json({
                    success: false,
                    message: "History ID, condition and notes are required"
                });
            }

            // Validate historyId format
            if (!mongoose.Types.ObjectId.isValid(historyId)) {
                console.log(' Invalid history ID format');
                return res.status(400).json({
                    success: false,
                    message: "Invalid history ID format"
                });
            }

            // 1. Find the doctor by email
            console.log('2. Finding doctor');
            const doctor = await adddoctorModel.findOne({ 
                email: doctorEmail.toLowerCase() 
            });

            if (!doctor) {
                console.log(' Doctor not found');
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }
            // 2. Find the medical history record
            console.log('3. Finding medical history record');
            const record = await medicalHistoryModel.findOne({
                _id: historyId,
                doctorId: doctor._id // Ensure the record belongs to this doctor
            });

            if (!record) {
                console.log(' Medical history not found');
                return res.status(404).json({
                    success: false,
                    message: "Medical history not found or you don't have permission to edit it"
                });
            }
            // 3. Get patient details
            console.log('4. Finding patient');
            const patient = await AddPatient.findById(record.patientId);
            if (!patient) {
                console.log(' Patient not found');
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // 4. Prepare update data
             const updateData = {
                condition: condition.trim(),
                notes: notes.trim(),
                date: new Date()
            };

            // 5. Call service to update medical history
           const updatedHistory = await medicalHistoryService.editMedicalHistory(record._id, updateData);

            // 6. Send response
            console.log('7. Sending response');
            res.status(200).json({
                success: true,
                message: "Medical history updated successfully",
                data: {
                    ...updatedHistory.data,
                    patientName: patient.fullName,
                    doctorName: doctor.fullName
                }
            });
            console.log('=== Medical History Edit Controller Complete ===\n');
        } catch (error) {
            console.error(' Error in editMedicalHistory controller:', error);
            
            // Handle specific error types
            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: "Invalid data provided"
                });
            }
            
            if (error.name === 'CastError') {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ID format"
                });
            }

            res.status(500).json({
                success: false,
                message: "An error occurred while updating the medical history"
            });
        }
    },
    getMedicalHistoryByDoctor: async (req, res) => {
        try {
          
            const email = req.params.email;
          

            if (!email) {
                console.log(' No email provided');
                return res.status(400).json({
                    success: false,
                    message: "Email is required"
                });
            }

            // Find doctor using email
     
            const doctor = await adddoctorModel.findOne({ 
                email: email.toLowerCase()
            });

            if (!doctor) {
                console.log(' Doctor not found');
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }

            // Get all medical history records for this doctor
       
            const result = await medicalHistoryService.getMedicalHistoryByDoctor(doctor._id);
            console.log('4. Records fetched:', result.data?.length || 0);

            if (!result.success) {
                console.log(' Service returned error');
                return res.status(500).json(result);
            }

            // Group records by patient
            console.log('5. Grouping records by patient');
            const groupedRecords = {};
            
            for (const record of result.data) {
                const patientId = record.patientId;
                const patientName = record.patientName;
                const doctorName = record.doctorName;
                
                if (!groupedRecords[patientId]) {
                    groupedRecords[patientId] = {
                        patientId,
                        patientName,
                        doctorName,
                        historyChain: []
                    };
                }

                groupedRecords[patientId].historyChain.push({
                    _id: record._id,
                    version: record.version || 1,
                    condition: record.condition || 'N/A',
                    notes: record.notes || 'N/A',
                    date: record.date || new Date(),
                    ipfsCID: record.ipfsCID,
                    ipfsIV: record.ipfsIV,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt
                });
            }

            // Sort history chains by version
     
            const formattedRecords = Object.values(groupedRecords).map(group => ({
                ...group,
                historyChain: group.historyChain.sort((a, b) => b.version - a.version)
            }));
            res.status(200).json({
                success: true,
                message: "Medical history fetched successfully",
                data: formattedRecords
            });
        } catch (error) {
            console.error("Error in getMedicalHistoryByDoctor:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch medical history"
            });
        }
    },
    createPatientSelfHistory: async (req, res) => {
        try {
            const { fullName, doctorName, condition, notes, date } = req.body;
    
            // Validate required fields
            if (!fullName || !condition || !notes) {
                return res.status(400).json({
                    success: false,
                    message: "Full name, condition, and notes are required"
                });
            }
    
            // Call the service function
            const result = await medicalHistoryService.createPatientSelfHistory({
                fullName,
                doctorName: doctorName || 'Self',
                condition,
                notes,
                date
            });
    
            res.status(201).json(result);
        } catch (error) {
            console.error("Error in createPatientSelfHistory:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to create medical history"
            });
        }
    }, 
    getIPFSDataByCID: async (req, res) => {
        try {
            const { cid, iv } = req.query;

            if (!cid || !iv) {
                return res.status(400).json({
                    success: false,
                    message: "Both CID and IV are required"
                });
            }

            console.log('Retrieving IPFS data with:', { cid, iv });

            // Get data from IPFS using the service with both CID and IV
            const ipfsData = await IPFSService.retrieveAndDecrypt(cid, iv);

            if (!ipfsData) {
                return res.status(404).json({
                    success: false,
                    message: "No data found for the provided CID and IV"
                });
            }

            return res.status(200).json({
                success: true,
                message: "IPFS data retrieved successfully",
                data: ipfsData
            });

        } catch (error) {
            console.error('Error in getIPFSDataByCID:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Error retrieving IPFS data"
            });
        }
    } 
};


module.exports = medicalHistoryController; 