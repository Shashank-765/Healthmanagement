const medicalHistoryModel = require('../models/medicalHistory/medicalHistoryModel');
const patientModel = require('../models/patient/addpatientModel');
const doctorModel = require('../models/doctor/adddoctorModel');
const appointmentModel = require('../models/appointment/appointmentModel');
const mongoose = require('mongoose');
const IPFSService = require('../services/ipfsService');
const medicalHistoryService = {
    createMedicalHistory: async ({ patientId, doctorId, condition, notes, date }) => {
        try {
            console.log("=== Starting Medical History Service ===");
            console.log("1. Received data:", { patientId, doctorId, condition, notes, date });

            // Prepare history object for IPFS
            const historyObj = {
                patientId,
                doctorId,
                condition,
                notes,
                date: date || new Date()
            };
            console.log("2. Prepared history object for IPFS:", historyObj);

            // Upload to IPFS
            console.log("3. Starting IPFS upload...");
            const { cid, iv } = await IPFSService.uploadEncryptedData(historyObj);
            console.log("4. IPFS upload successful:", { cid, iv });

            if (!cid || !iv) {
                console.error("❌ IPFS upload failed - missing CID or IV");
                throw new Error("IPFS upload failed - missing CID or IV");
            }

            // Only store IPFS info and references in DB
            console.log("5. Creating new medical history record in DB");
            const newHistory = new medicalHistoryModel({
                patientId,
                doctorId,
                ipfsCID: cid,
                ipfsIV: iv
            });

            console.log("6. Saving to database...");
            await newHistory.save();
            console.log("7. Database save successful:", {
                id: newHistory._id,
                ipfsCID: newHistory.ipfsCID,
                ipfsIV: newHistory.ipfsIV
            });

            // Populate the record
            console.log("8. Populating record with patient and doctor details");
            const populatedHistory = await medicalHistoryModel.findById(newHistory._id)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName email');

            // Decrypt IPFS data for response
            console.log("9. Decrypting IPFS data for response");
            const ipfsData = await IPFSService.retrieveAndDecrypt(cid, iv);
            console.log("10. IPFS data decrypted successfully");

            const result = {
                ...populatedHistory.toObject(),
                ...ipfsData
            };
            console.log("11. Final response prepared:", {
                id: result._id,
                patientId: result.patientId,
                doctorId: result.doctorId,
                ipfsCID: result.ipfsCID,
                ipfsIV: result.ipfsIV
            });

            return result;
        } catch (error) {
            console.error("❌ Error in createMedicalHistory service:", error);
            console.error("Error stack:", error.stack);
            throw new Error(`Failed to create medical history: ${error.message}`);
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
            // Get all medical history records for this patient
            const historyRecords = await medicalHistoryModel.find({ patientId }).sort({ createdAt: -1 });

            // Decrypt each record from IPFS
            const decryptedHistory = await Promise.all(historyRecords.map(async (record) => {
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
                    ...ipfsData,
                    ipfsCID: record.ipfsCID,
                    ipfsIV: record.ipfsIV,
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt
                };
            }));

            return {
                success: true,
                message: "Patient medical history fetched successfully",
                data: decryptedHistory
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
    },

    getMedicalHistoryById: async (id) => {
        return await medicalHistoryModel.findById(id);
    },

    editMedicalHistory: async (id, updateData) => {
        try {
            console.log('\n=== Starting Medical History Edit ===');
            console.log('1. Input:', { id, updateData });

            // Find the current medical history record
            console.log('2. Finding medical history record');
            const currentHistory = await medicalHistoryModel.findById(id);

            if (!currentHistory) {
                console.log('❌ Medical history not found');
                throw new Error('Medical history not found');
            }
            console.log('✅ Found medical history:', {
                id: currentHistory._id,
                version: currentHistory.version
            });

            // Validate required fields
            if (!updateData.condition || !updateData.notes) {
                console.log('❌ Missing required fields');
                throw new Error('Condition and notes are required fields');
            }

            // Prepare data for IPFS
            console.log('3. Preparing data for IPFS');
            const sensitiveData = {
                patientId: currentHistory.patientId,
                doctorId: currentHistory.doctorId,
                condition: updateData.condition,
                notes: updateData.notes,
                date: updateData.date || new Date(),
                timestamp: new Date().getTime(),
                version: (currentHistory.version || 0) + 1
            };

            // Upload to IPFS
            console.log('4. Uploading to IPFS');
            const { cid, iv } = await IPFSService.uploadEncryptedData(sensitiveData);
            console.log('✅ IPFS upload successful:', { cid, iv });

            if (!cid || !iv) {
                console.log('❌ IPFS upload failed');
                throw new Error('IPFS upload failed - missing CID or IV');
            }

            // Store current CID and IV in history link
            const historyLink = {
                previousCID: currentHistory.ipfsCID,
                previousIV: currentHistory.ipfsIV,
                date: new Date()
            };

            // Update the record with new data and history link
            console.log('5. Updating database record');
            const updatedHistory = await medicalHistoryModel.findByIdAndUpdate(
                id,
                {
                    ipfsCID: cid,
                    ipfsIV: iv,
                    version: sensitiveData.version,
                    hl: historyLink,
                    updatedAt: new Date(),
                    condition: updateData.condition,
                    notes: updateData.notes,
                    date: updateData.date || new Date()
                },
                { new: true }
            );

            if (!updatedHistory) {
                console.log('❌ Failed to update record');
                throw new Error('Failed to update medical history record');
            }
            console.log('✅ Database update successful');

            // Populate and decrypt
            console.log('6. Populating and decrypting data');
            const populatedHistory = await medicalHistoryModel.findById(updatedHistory._id)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName email');

            if (!populatedHistory) {
                console.log('❌ Failed to retrieve updated record');
                throw new Error('Failed to retrieve updated medical history');
            }

            const ipfsData = await IPFSService.retrieveAndDecrypt(cid, iv);
            console.log('✅ Data decryption successful');

            console.log('=== Medical History Edit Complete ===\n');
            return {
                success: true,
                message: 'Medical history updated successfully',
                data: {
                    ...populatedHistory.toObject(),
                    ...ipfsData,
                    condition: ipfsData.condition || updateData.condition,
                    notes: ipfsData.notes || updateData.notes,
                    date: ipfsData.date || updateData.date
                }
            };
        } catch (error) {
            console.error('❌ Error in editMedicalHistory:', error);
            throw new Error(`Failed to edit medical history: ${error.message}`);
        }
    },

    createPatientSelfHistory: async ({ fullName, doctorName, condition, notes, date }) => {
        // Find patient by fullName
        const patient = await patientModel.findOne({ fullName });
        if (!patient) throw new Error('Patient not found');
        // Prepare history object for IPFS
        const historyObj = {
            patientId: patient._id,
            doctorName,
            condition,
            notes,
            date: date || new Date()
        };

        // Upload to IPFS
        const { cid, iv } = await IPFSService.uploadEncryptedData(historyObj);

        // Only store IPFS info and patient reference in DB
        const newHistory = new medicalHistoryModel({
            patientId: patient._id,
            ipfsCID: cid,
            ipfsIV: iv
        });
        await newHistory.save();

        // Return only the IPFS info and _id
        return {
            success: true,
            message: 'Medical history created',
            data: {
                ipfsCID: cid,
                ipfsIV: iv,
                _id: newHistory._id
            }
        };
    },

    getMedicalHistoryByDoctor: async (doctorId) => {
        try {
            console.log('Fetching medical history for doctor:', doctorId);
            
            const records = await medicalHistoryModel.find({ doctorId })
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName email')
                .sort({ createdAt: -1 });

            console.log(`Found ${records.length} records`);

            // Decrypt IPFS data for each record
            const decryptedRecords = await Promise.all(
                records.map(async (record) => {
                    try {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);
                        return {
                            ...record.toObject(),
                            ...ipfsData
                        };
                    } catch (error) {
                        console.error(`Error decrypting record ${record._id}:`, error);
                        return {
                            ...record.toObject(),
                            error: 'Failed to decrypt data'
                        };
                    }
                })
            );

            return {
                success: true,
                message: "Doctor's patient history fetched successfully",
                data: decryptedRecords
            };
        } catch (error) {
            console.error('Error in getMedicalHistoryByDoctor:', error);
            throw new Error(`Failed to fetch medical history: ${error.message}`);
        }
    }
};

module.exports = medicalHistoryService; 