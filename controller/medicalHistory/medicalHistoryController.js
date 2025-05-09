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
            console.log("=== Starting Medical History Creation ===");
            console.log("1. Request Body:", req.body);
            
            const {
                patientEmail,
                doctorEmail,
                condition,
                notes,
                date
            } = req.body;

            console.log("2. Extracted Data:", { 
                patientEmail, 
                doctorEmail, 
                condition, 
                notes, 
                date 
            });

            // Get token
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                console.log("❌ No token provided");
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
                console.log("❌ Doctor not found");
                return res.status(400).json({
                    success: false,
                    message: "Doctor not found with the provided email."
                });
            }
            console.log("✅ Doctor found:", { id: doctor._id, name: doctor.fullName });

            // Find patient
            console.log("5. Finding patient with email:", patientEmail);
            const patient = await AddPatient.findOne({ 
                email: patientEmail.toLowerCase()
            });

            if (!patient) {
                console.log("❌ Patient not found");
                return res.status(400).json({
                    success: false,
                    message: "Patient not found with the provided email."
                });
            }
            console.log("✅ Patient found:", { id: patient._id, name: patient.fullName });

            // Check for valid appointment
            console.log("6. Checking for valid appointment");
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
                console.log("❌ No valid appointment found");
                return res.status(400).json({
                    success: false,
                    message: "No valid appointment found between you and this patient."
                });
            }
            console.log("✅ Valid appointment found:", appointment._id);

            // 7. Prepare sensitive data for IPFS
            const sensitiveData = {
                patientId: patient._id,
                doctorId: doctor._id,
                condition,
                notes,
                date: date || new Date(),
                timestamp: new Date().getTime()
            };

            // 8. Upload sensitive data to IPFS
            console.log("7. Uploading sensitive data to IPFS");
            const { cid, iv } = await IPFSService.uploadEncryptedData(sensitiveData);
            console.log("✅ IPFS upload successful:", { cid, iv });

            // 9. Create medical history record with only necessary data
            console.log("8. Creating medical history record");
            const medicalHistory = new medicalHistoryModel({
                patientId: patient._id,
                doctorId: doctor._id,
                ipfsCID: cid,
                ipfsIV: iv,
                version: 1,
                hl: {
                    previousCID: null,
                    previousIV: null,
                    date: new Date()
                }
            });

            // 10. Save to database
            const savedHistory = await medicalHistory.save();
            console.log("✅ Medical history saved:", savedHistory._id);

            // 11. Prepare response data
            const responseData = {
                _id: savedHistory._id,
                patientId: savedHistory.patientId,
                doctorId: savedHistory.doctorId,
                patientName: patient.fullName,
                doctorName: doctor.fullName,
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
            console.error("❌ Error in createMedicalHistory:", error);
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
            const userEmail = req.user.email; 

            // Find patient by email
            const patient = await AddPatient.findOne({ email: userEmail });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found due to no confirm appointment."
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
            console.log('\n=== Starting Medical History Edit Controller ===');
            const doctorEmail = req.params.email;
            const { historyId, condition, notes } = req.body;

            console.log('1. Request details:', {
                doctorEmail,
                historyId,
                condition,
                notes
            });

            // Validate request body
            if (!historyId || !condition || !notes) {
                console.log('❌ Missing required fields');
                return res.status(400).json({
                    success: false,
                    message: "History ID, condition and notes are required"
                });
            }

            // Validate historyId format
            if (!mongoose.Types.ObjectId.isValid(historyId)) {
                console.log('❌ Invalid history ID format');
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
                console.log('❌ Doctor not found');
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }
            console.log('✅ Doctor found:', doctor._id);

            // 2. Find the medical history record
            console.log('3. Finding medical history record');
            const record = await medicalHistoryModel.findOne({
                _id: historyId,
                doctorId: doctor._id // Ensure the record belongs to this doctor
            });

            if (!record) {
                console.log('❌ Medical history not found');
                return res.status(404).json({
                    success: false,
                    message: "Medical history not found or you don't have permission to edit it"
                });
            }
            console.log('✅ Medical history found:', record._id);

            // 3. Get patient details
            console.log('4. Finding patient');
            const patient = await AddPatient.findById(record.patientId);
            if (!patient) {
                console.log('❌ Patient not found');
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }
            console.log('✅ Patient found:', patient._id);

            // 4. Prepare update data
            console.log('5. Preparing update data');
            const updateData = {
                condition: condition.trim(),
                notes: notes.trim(),
                date: new Date()
            };

            // 5. Call service to update medical history
            console.log('6. Calling service to update');
            const updatedHistory = await medicalHistoryService.editMedicalHistory(record._id, updateData);
            console.log('✅ Service update successful');

            // 6. Decrypt IPFS data for response
            console.log('7. Decrypting IPFS data');
            let decryptedData = {};
            try {
                if (updatedHistory.data.ipfsCID && updatedHistory.data.ipfsIV) {
                    decryptedData = await IPFSService.retrieveAndDecrypt(
                        updatedHistory.data.ipfsCID,
                        updatedHistory.data.ipfsIV
                    );
                    console.log('✅ IPFS data decrypted successfully');
                }
            } catch (error) {
                console.error('❌ Error decrypting IPFS data:', error);
                // Continue with the response even if decryption fails
            }

            // 7. Send response with decrypted data
            console.log('8. Sending response');
            res.status(200).json({
                success: true,
                message: "Medical history updated successfully",
                data: {
                    ...updatedHistory.data,
                    ...decryptedData, // Include decrypted data
                    patientName: patient.fullName,
                    doctorName: doctor.fullName,
                    condition: decryptedData.condition || updatedHistory.data.condition,
                    notes: decryptedData.notes || updatedHistory.data.notes,
                    date: decryptedData.date || updatedHistory.data.date
                }
            });
            console.log('=== Medical History Edit Controller Complete ===\n');
        } catch (error) {
            console.error('❌ Error in editMedicalHistory controller:', error);
            
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
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }

            // Get all medical history records for this doctor
            const records = await medicalHistoryModel.find({ 
                doctorId: doctor._id 
            }).sort({ version: -1 });

            if (!records || records.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: "No medical history records found",
                    data: []
                });
            }

            // Process records and create version chains
            const groupedRecords = {};
            
            for (const record of records) {
                if (!record.patientId) {
                    continue;
                }

                const key = record.patientId.toString();
                
                // Get patient details
                const patient = await AddPatient.findById(record.patientId);
                if (!patient) {
                    continue;
                }

                if (!groupedRecords[key]) {
                    groupedRecords[key] = [];
                }

                // Format dates
                const recordDate = record.date;
                const formattedDate = recordDate ? new Date(recordDate).toLocaleDateString() : 'Date not available';

                // Create history record with all details
                const historyRecord = {
                    _id: record._id.toString(),
                    patientId: record.patientId.toString(),
                    doctorId: record.doctorId.toString(),
                    patientName: patient.fullName,
                    doctorName: doctor.fullName,
                    ipfsCID: record.ipfsCID,
                    ipfsIV: record.ipfsIV,
                    version: record.version || 1,
                    condition: record.condition || 'Not available',
                    notes: record.notes || 'Not available',
                    date: formattedDate,
                    hl: {
                        previousCID: record.hl?.previousCID || null,
                        previousIV: record.hl?.previousIV || null,
                        date: formattedDate
                    },
                    createdAt: new Date(record.createdAt).toLocaleDateString(),
                    updatedAt: new Date(record.updatedAt).toLocaleDateString()
                };

                // Add to grouped records
                groupedRecords[key].push(historyRecord);
            }

            // Convert grouped records to array format
            const formattedRecords = Object.entries(groupedRecords).map(([patientId, patientRecords]) => ({
                patientId,
                patientName: patientRecords[0].patientName,
                doctorName: patientRecords[0].doctorName,
                historyChain: patientRecords.sort((a, b) => b.version - a.version) // Sort by version in descending order
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
            const result = await medicalHistoryService.createPatientSelfHistory({
                 fullName, doctorName, condition, notes, date
            });
            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message || 'Failed to create medical history' });
        }
    }
};


module.exports = medicalHistoryController; 