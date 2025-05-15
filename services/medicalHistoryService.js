const medicalHistoryModel = require('../models/medicalHistory/medicalHistoryModel');
const patientModel = require('../models/patient/addpatientModel');
const doctorModel = require('../models/doctor/adddoctorModel');
const appointmentModel = require('../models/appointment/appointmentModel');
const mongoose = require('mongoose');
const IPFSService = require('../services/ipfsService');
const medicalHistoryService = {
    createMedicalHistory: async ({ patientId, condition, notes, date }) => {
        try {
            // Prepare history object for IPFS
            const historyObj = {
                patientId,
                condition,
                notes,
                date: date || new Date()
            };

            // Upload to IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(historyObj);

            // Create new medical history record
            const newHistory = new medicalHistoryModel({
                patientId,
                doctorId,
                ipfsCID: cid,
                ipfsIV: iv
            });
            await newHistory.save();
            console.log("7. Database save successful:", {
                id: newHistory._id,
                ipfsCID: newHistory.ipfsCID,
                ipfsIV: newHistory.ipfsIV
            });
                const populatedHistory = await medicalHistoryModel.findById(newHistory._id)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName email');

            const ipfsData = await IPFSService.retrieveAndDecrypt(cid, iv);
            const result = {
                ...populatedHistory.toObject(),
                ...ipfsData
            };

            return result;
        } catch (error) {
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
            // Find patient first to get the correct patientId
            const patient = await patientModel.findOne({ patientId });
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get all medical history records for this patient
            const historyRecords = await medicalHistoryModel.find({ 
                patientId: patient.patientId 
            }).sort({ createdAt: -1 });

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
                    patientId: patient.patientId,
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
            // console.log("Error fetching patient medical history:", error.message);
            throw error;
        }
    },

    getDoctorPatientHistory: async (doctorId) => {
        try {
            const history = await medicalHistoryModel.find({ doctorId })
                .populate({
                    path: 'patientId',
                    model: 'AddPatient',
                    select: 'fullName email patientId'
                })
                .populate({
                    path: 'doctorId',
                    model: 'adddoctor',
                    select: 'fullName email'
                })
                .sort({ date: -1 });

            // Decrypt IPFS data for each record
            const decryptedHistory = await Promise.all(history.map(async (record) => {
                try {
                    const ipfsData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);
                    return {
                        ...record.toObject(),
                        ...ipfsData,
                        patientId: record.patientId.patientId || record.patientId._id
                    };
                } catch (error) {
                    console.error(`Error decrypting record ${record._id}:`, error);
                    return {
                        ...record.toObject(),
                        error: 'Failed to decrypt data',
                        patientId: record.patientId.patientId || record.patientId._id
                    };
                }
            }));

            return {
                success: true,
                message: "Doctor's patient history fetched successfully",
                data: decryptedHistory
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
            const currentHistory = await medicalHistoryModel.findById(id);
            if (!currentHistory) {
              throw new Error('Medical history not found');
            }

            // Validate required fields
            if (!updateData.condition || !updateData.notes) {
                console.log(' Missing required fields');
                throw new Error('Condition and notes are required fields');
            }

            const sensitiveData = {
                patientId: currentHistory.patientId,
                doctorId: currentHistory.doctorId,
                condition: updateData.condition,
                notes: updateData.notes,
                date: updateData.date || new Date(),
                timestamp: new Date().getTime(),
                version: (currentHistory.version || 0) + 1
            };

            const { cid, iv } = await IPFSService.uploadEncryptedData(sensitiveData);
            if (!cid || !iv) {
             throw new Error('IPFS upload failed - missing CID or IV');
            }

            const newHistory = new medicalHistoryModel({
                patientId: currentHistory.patientId,
                doctorId: currentHistory.doctorId,
                ipfsCID: cid,
                ipfsIV: iv,
                version: sensitiveData.version,
                hl: {
                    previousCID: currentHistory.ipfsCID,
                    previousIV: currentHistory.ipfsIV,
                    date: new Date()
                },
                date: updateData.date || new Date()
            });

            // Save the new record
            const savedHistory = await newHistory.save();
            const populatedHistory = await medicalHistoryModel.findById(savedHistory._id)
                .populate('patientId', 'fullName email')
                .populate('doctorId', 'fullName email');

            if (!populatedHistory) {
                console.log(' Failed to retrieve saved record');
                throw new Error('Failed to retrieve saved medical history');
            }

            // Decrypt IPFS data for response
            const ipfsData = await IPFSService.retrieveAndDecrypt(cid, iv);
            return {
                success: true,
                message: 'Medical history updated successfully',
                data: {
                    ...populatedHistory.toObject(),
                    ...ipfsData
                }
            };
        } catch (error) {
            console.error(' Error in editMedicalHistory:', error);
            throw new Error(`Failed to edit medical history: ${error.message}`);
        }
    },

    createPatientSelfHistory: async ({ fullName, doctorName, condition, notes, date }) => {
        try {
             let patient = await patientModel.findOne({
                fullName: { $regex: fullName, $options: 'i' }
            });

            // Optional: fallback to exact, case-insensitive match
            if (!patient) {
                patient = await patientModel.findOne({
                    fullName: { $regex: new RegExp(`^${fullName}$`, 'i') }
                });
            }

            if (!patient) {
                console.log('Patient not found:', fullName);
                throw new Error('Patient not found');
            }
            let doctorId = null;
            if (doctorName && doctorName !== 'Self') {
                const doctor = await doctorModel.findOne({ fullName: doctorName });
                if (doctor) {
                    doctorId = doctor._id.toString();
                    console.log('Found doctor:', doctorId);
                }
            }

            // Prepare history object for IPFS
            const historyObj = {
                patientId: patient._id,
                doctorId,
                doctorName: doctorName || 'Self',
                condition,
                notes,
                date: date || new Date()
            };
            const { cid, iv } = await IPFSService.uploadEncryptedData(historyObj);
            const newHistory = new medicalHistoryModel({
                patientId: patient._id,
                doctorId: doctorId || null,
                doctorName: doctorName || 'Self',
                date: date || new Date(),
                ipfsCID: cid,
                ipfsIV: iv,
                version: 1
            });
            await newHistory.save();
            return {
                success: true,
                message: "Medical history created successfully",
                data: {
                    _id: newHistory._id,
                    patientId: patient._id,
                    patientName: patient.fullName,
                    doctorId: newHistory.doctorId,
                    doctorName: newHistory.doctorName,
                    condition,
                    notes,    
                    date: newHistory.date,
                    ipfsCID: cid,
                    ipfsIV: iv,
                    version: newHistory.version
                }
            };
        } catch (error) {
            console.error('Error in createPatientSelfHistory:', error);
            throw error;
        }
    },

    getMedicalHistoryByDoctor: async (doctorId) => {
        try {  
            const records = await medicalHistoryModel.find({ doctorId })
                .populate({
                    path: 'patientId',
                    model: 'AddPatient',
                    select: 'fullName email'
                })
                .populate({
                    path: 'doctorId',
                    model: 'adddoctor',
                    select: 'fullName email'
                })
                .lean();

          const recordsWithNullPatient = records.filter(record => !record.patientId);
            if (recordsWithNullPatient.length > 0) {
                console.log('Found records with null patientId:', recordsWithNullPatient.map(r => ({
                    _id: r._id,
                    ipfsCID: r.ipfsCID,
                    date: r.date
                })));
            }

            // Decrypt IPFS data for each record
            const decryptedRecords = await Promise.all(
                records.map(async (record) => {
                    try {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(record.ipfsCID, record.ipfsIV);
                        
                        // For records with null patientId, try to get patient info from IPFS data
                        let patientName = 'N/A';
                        let patientId = record.patientId?._id || record.patientId;
                        
                        if (!patientId && ipfsData.patientId) {
                            // Try to find patient by ID from IPFS data
                            const patient = await patientModel.findById(ipfsData.patientId);
                            if (patient) {
                                patientId = patient._id;
                                patientName = patient.fullName;
                            }
                        } else {
                            patientName = record.patientId?.fullName || 'N/A';
                        }
                        
                        const doctorName = record.doctorId?.fullName || record.doctorName || 'N/A';
                        
                        return {
                            _id: record._id,
                            patientName,
                            doctorName,
                            patientId,
                            doctorId: record.doctorId?._id || record.doctorId,
                            condition: ipfsData.condition || 'N/A',
                            notes: ipfsData.notes || 'N/A',
                            date: record.date || new Date(),
                            ipfsCID: record.ipfsCID,
                            ipfsIV: record.ipfsIV,
                            version: record.version || 1
                        };
                    } catch (error) {
                        console.error(`Error decrypting record ${record._id}:`, error);
                        
                        // For records with null patientId, try to get patient info from IPFS data
                        let patientName = 'N/A';
                        let patientId = record.patientId?._id || record.patientId;
                        
                        if (!patientId && ipfsData?.patientId) {
                            // Try to find patient by ID from IPFS data
                            const patient = await patientModel.findById(ipfsData.patientId);
                            if (patient) {
                                patientId = patient._id;
                                patientName = patient.fullName;
                            }
                        } else {
                            patientName = record.patientId?.fullName || 'N/A';
                        }
                        
                        const doctorName = record.doctorId?.fullName || record.doctorName || 'N/A';
                        
                        return {
                            _id: record._id,
                            patientName,
                            doctorName,
                            patientId,
                            doctorId: record.doctorId?._id || record.doctorId,
                            condition: 'N/A',
                            notes: 'N/A',
                            date: record.date || new Date(),
                            ipfsCID: record.ipfsCID,
                            ipfsIV: record.ipfsIV,
                            version: record.version || 1,
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