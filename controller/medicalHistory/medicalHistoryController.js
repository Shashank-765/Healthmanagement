const jwt = require('jsonwebtoken');
const medicalHistoryService = require('../../services/medicalHistoryService');
const appointmentModel = require('../../models/appointment/appointmentModel');
const AddPatient = require('../../models/patient/addpatientModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const mongoose = require('mongoose');
const medicalHistoryModel = require('../../models/medicalHistory/medicalHistoryModel');
const IPFSService = require('./../../services/ipfsService');
const patientModel = require('../../models/patient/addpatientModel');
const doctorModel = require('../../models/doctor/adddoctorModel');
const fs = require('fs').promises;

const medicalHistoryController = {
    createMedicalHistory: async (req, res) => {
        try { 
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).json({ success: false, message: "No token provided" });
            }
            jwt.verify(token, process.env.JWT_SECRET);
            const patientEmail = req.body.patientEmail;
            const doctorEmail = req.body.doctorEmail;
            const condition = req.body.condition;
            const notes = req.body.notes;
            const date = req.body.date;
            if (!patientEmail || !doctorEmail || !condition || !notes) {
                return res.status(400).json({ success: false, message: "Missing required fields" });
            }
            const doctor = await adddoctorModel.findOne({ email: doctorEmail.toLowerCase() });
            if (!doctor) {
                return res.status(400).json({ success: false, message: "Doctor not found with the provided email." });
            }
            const patient = await AddPatient.findOne({ email: patientEmail.toLowerCase() });
            if (!patient) {
                return res.status(400).json({ success: false, message: "Patient not found with the provided email." });
            }
            // Handle single file upload
            let fileData = null;
            let filesData = [];

            if (req.file) {
                // Handle single file upload
                try {
                    const fileContent = await fs.readFile(req.file.path);
                    fileData = {
                        content: fileContent,
                        originalName: req.file.originalname,
                        mimeType: req.file.mimetype,
                        size: req.file.size
                    };
                    await fs.unlink(req.file.path);
                } catch (error) {
                    return res.status(500).json({ success: false, message: "Error processing uploaded file" });
                }
            } else if (req.files && req.files.length > 0) {
                // Handle multiple file uploads
                try {
                    for (const file of req.files) {
                        const fileContent = await fs.readFile(file.path);
                        filesData.push({
                            content: fileContent,
                            originalName: file.originalname,
                            mimeType: file.mimetype,
                            size: file.size
                        });
                        await fs.unlink(file.path);
                    }
                } catch (error) {
                    return res.status(500).json({ success: false, message: "Error processing uploaded files" });
                }
            }

            // Prepare data for IPFS storage
            const ipfsData = {
                condition,
                notes,
                date,
                file: fileData,
                files: filesData.length > 0 ? filesData : undefined
            };

            // Upload to IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(ipfsData);

            // Call the service with the file data and IPFS information
            const result = await medicalHistoryService.createMedicalHistory({
                patientId: patient._id,
                doctorId: doctor._id,
                patientEmail: patientEmail.toLowerCase(),
                doctorEmail: doctorEmail.toLowerCase(),
                condition,
                notes,
                date,
                file: fileData,
                files: filesData.length > 0 ? filesData : undefined,
                ipfsCID: cid,
                ipfsIV: iv
            });

            return res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message || "Failed to create medical history" });
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

            console.log('Found histories:', histories.length);

            const historiesWithDetails = await Promise.all(histories.map(async (record) => {
                let ipfsData = {};
                try {
                    if (record.ipfsCID && record.ipfsIV) {
                        console.log('Decrypting IPFS data for record:', record._id);
                        console.log('IPFS CID:', record.ipfsCID);
                        console.log('IPFS IV:', record.ipfsIV);
                        
                        ipfsData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);
                        console.log('Decrypted IPFS data:', ipfsData);
                    }
                } catch (e) {
                    console.error('Error decrypting IPFS data:', e);
                    ipfsData = { error: 'Failed to decrypt IPFS data' };
                }

                // Get file information from either file or files array in IPFS data
                let fileInfo = null;
                if (ipfsData.files && Array.isArray(ipfsData.files)) {
                    fileInfo = ipfsData.files.map(file => ({
                        originalName: file.originalName,
                        mimeType: file.mimeType,
                        size: file.size
                    }));
                } else if (ipfsData.file) {
                    fileInfo = [{
                        originalName: ipfsData.file.originalName,
                        mimeType: ipfsData.file.mimeType,
                        size: ipfsData.file.size
                    }];
                }

                const historyWithDetails = {
                    _id: record._id,
                    doctorId: record.doctorId,
                    doctorName: record.doctorId?.fullName || record.doctorName || 'Self',
                    condition: ipfsData.condition || 'N/A',
                    notes: ipfsData.notes || 'N/A',
                    date: record.date,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                    fileInfo: fileInfo || record.fileInfo, 
                    ipfsData: {
                        cid: record.ipfsCID,
                        iv: record.ipfsIV,
                        file: ipfsData.file || ipfsData.files?.[0]
                    }
                };

                console.log('Processed history record:', historyWithDetails);
                return historyWithDetails;
            }));

            console.log('Final response data:', historiesWithDetails);

            res.status(200).json({
                success: true,
                message: "Patient medical history fetched successfully",
                data: historiesWithDetails
            });
        } catch (error) {
            console.error("Error fetching patient's medical history:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch medical history"
            });
        }
    },

    editMedicalHistory: async (req, res) => {
        try {
            const doctorEmail = req.params.email;
            // Check if req.body exists
            if (!req.body) {
                console.error('Request body is undefined');
                return res.status(400).json({
                    success: false,
                    message: "Request body is missing"
                });
            }

            // Extract data from FormData with fallbacks
            const historyId = req.body.historyId || req.body.history_id;
            const condition = req.body.condition;
            const notes = req.body.notes;
            const date = req.body.date;

            if (!historyId || !condition || !notes) {
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
                doctorId: doctor._id
            });

            if (!record) {
                console.log(' Medical history not found');
                return res.status(404).json({
                    success: false,
                    message: "Medical history not found or you don't have permission to edit it"
                });
            }

            const patient = await AddPatient.findById(record.patientId);
            if (!patient) {
                console.log(' Patient not found');
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Handle file upload if present
            let fileData = null;
            if (req.file) {
                try {
                    const fileContent = await fs.readFile(req.file.path);
                    fileData = {
                        content: fileContent,
                        originalName: req.file.originalname,
                        mimeType: req.file.mimetype,
                        size: req.file.size
                    };
                    // Delete the temporary file after reading
                    await fs.unlink(req.file.path);
                } catch (error) {
                    console.error("Error processing uploaded file:", error);
                    return res.status(500).json({
                        success: false,
                        message: "Error processing uploaded file"
                    });
                }
            }

            // Prepare update data
            const updateData = {
                condition: condition.trim(),
                notes: notes.trim(),
                date: date || new Date()
            };

            // Get the existing IPFS data
            const existingData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);

            // Update the IPFS data with new information
            const updatedIPFSData = {
                ...existingData,
                condition: updateData.condition,
                notes: updateData.notes,
                date: updateData.date,
                file: fileData || existingData.file
            };

            // Upload updated data to IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(updatedIPFSData);

            // Create a new document (new version)
            const newHistory = new medicalHistoryModel({
                patientId: record.patientId,
                doctorId: record.doctorId,
                date: updateData.date,
                ipfsCID: cid,
                ipfsIV: iv,
                version: (record.version || 1) + 1,
                hl: {
                    previousCID: record.ipfsCID,
                    previousIV: record.ipfsIV,
                    date: new Date()
                }
            });
            await newHistory.save();

            res.status(201).json({
                success: true,
                message: "Medical history updated successfully (new version created)",
                data: {
                    ...newHistory.toObject(),
                    patientName: patient.fullName,
                    doctorName: doctor.fullName
                }
            });
        } catch (error) {
            console.error('Error in editMedicalHistory controller:', error);
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
            console.log('Getting medical history for doctor email:', email);

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: "Email is required"
                });
            }

            const doctor = await adddoctorModel.findOne({ 
                email: email.toLowerCase()
            });

            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }

            console.log('Found doctor:', doctor._id);
            const result = await medicalHistoryService.getMedicalHistoryByDoctor(doctor._id);
            console.log('Service result:', JSON.stringify(result, null, 2));

            if (!result.success) {
                return res.status(500).json(result);
            }

            // Group records by patient
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

                // Create history chain entry
                const historyEntry = {
                    _id: record._id,
                    version: record.version || 1,
                    condition: record.condition,
                    notes: record.notes,
                    date: record.date,
                    ipfsCID: record.ipfsCID,
                    ipfsIV: record.ipfsIV,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                    fileInfo: record.fileInfo
                };

                groupedRecords[patientId].historyChain.push(historyEntry);
            }

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
            const { email, fullName, doctorName, condition, notes, date } = req.body;

            if (!req.user || req.user.role !== 'patient') {
                return res.status(403).json({
                    success: false,
                    message: "Only patients can create self medical history"
                });
            }

            let patient = await patientModel.findOne({ email: email.toLowerCase() });
            
            if (!patient) {
                console.log('Patient not found with email:', email);
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Handle single file upload
            let fileData = null;
            if (req.file) {
                try {
                    const fileContent = await fs.readFile(req.file.path);
                    fileData = {
                        content: fileContent,
                        originalName: req.file.originalname,
                        mimeType: req.file.mimetype,
                        size: req.file.size
                    };
                    // Delete the temporary file after reading
                    await fs.unlink(req.file.path);
                } catch (error) {
                    console.error("Error processing uploaded file:", error);
                    return res.status(500).json({
                        success: false,
                        message: "Error processing uploaded file"
                    });
                }
            }

            // Call the service with the file data
            const result = await medicalHistoryService.createPatientSelfHistory({
                fullName,
                doctorName,
                condition,
                notes,
                date,
                file: fileData
            });

            return res.status(201).json(result);
        } catch (error) {
            console.error("Error in createPatientSelfHistory:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to create medical history"
            });
        }
    }, 
    getImageByHistoryId: async (req, res) => {
        try {
            const { historyId } = req.params;
            if (!historyId) {
                return res.status(400).json({ success: false, message: "History ID is required" });
            }

            // Find the record in your DB
            const record = await medicalHistoryModel.findById(historyId);
            if (!record || !record.ipfsCID || !record.ipfsIV) {
                return res.status(404).send('Not found');
            }

            // Fetch from IPFS
            const ipfsData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);
            if (!ipfsData || !ipfsData.file) {
                return res.status(404).send('File not found');
            }

            res.set('Content-Type', ipfsData.file.mimeType);
            return res.send(Buffer.from(ipfsData.file.content.data));
        } catch (err) {
            res.status(500).send('Server error');
        }
    }
};


module.exports = medicalHistoryController; 