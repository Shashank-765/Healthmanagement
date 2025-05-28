const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const Cookies = require('js-cookie');
const patientSignup = require('../models/patient/signupModel');
const patientLogin = require('../models/patient/loginModel');
const IPFSService = require('../services/ipfsService');
const mnemonic = process.env.mnemonic;
const addpatientModel = require('../models/patient/addpatientModel');
const AddDoctorModel = require('../models/doctor/adddoctorModel');
const appointmentModel = require('../models/appointment/appointmentModel');
const medicalHistoryModel = require('../models/medicalHistory/medicalHistoryModel');
const mongoose = require("mongoose");
const patientSignupService = {
    generateWallet: async () => {
        try {
            const patientCount = await patientSignup.countDocuments();
            const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
            const wallet = hdNode.deriveChild(patientCount);
            return {
                address: wallet.address
            };
        } catch (error) {
            throw new Error("Wallet creation failed: " + error.message);
        }
    },

    validatePatientData: async (patientData) => {
        try {
            if (!patientData) {
                throw new Error("Patient data is required");
            }

            // Add password validation
            if (!patientData.password) {
                throw new Error("Password is required");
            }
            if (patientData.password.length < 8) {
                throw new Error("Password must be at least 8 characters long");
            }

            // Check if email exists
            const existingPatient = await patientSignup.findOne({ email: patientData.email });
            if (existingPatient) {
                throw new Error("Email already exists");
            }

            // Validate required fields
            const requiredFields = [
                'fullName', 'gender', 'dateOfBirth', 'email', 'password',
                'phoneNumber', 'bloodGroup', 'emergencyContactNumber',
                'knownAllergies', 'currentMedication', 'medicalHistory',
                'medicalDocument'
            ];

            const missingFields = requiredFields.filter(field => !patientData[field]);
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(patientData.email)) {
                throw new Error("Please enter a valid email address");
            }

            // Generate wallet
            const patientCount = await patientSignup.countDocuments();
            const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
            const wallet = hdNode.deriveChild(patientCount);
            const walletAddress = wallet.address;
            
            // Hash password
            const hashedPassword = await bcrypt.hash(patientData.password, 10);

            return {
                ...patientData,
                password: hashedPassword,
                walletAddress: walletAddress  // This will be stored in IPFS, not MongoDB
            };
        } catch (error) {
            console.error('Error in validatePatientData:', error);
            throw error;
        }
    },

    createPatient: async (validatedData) => {
        try {
            // Create MongoDB document with only specific fields
            const mongoData = {
                fullName: validatedData.fullName,
                email: validatedData.email
            };

            // Create patient in MongoDB
            const patient = await patientSignup.create(mongoData);

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                password: validatedData.password,
                walletAddress: validatedData.walletAddress,  // Store wallet address in IPFS
                gender: validatedData.gender,
                dateOfBirth: validatedData.dateOfBirth,
                medicalDocument: validatedData.medicalDocument,
                phoneNumber: validatedData.phoneNumber,
                bloodGroup: validatedData.bloodGroup,
                emergencyContactNumber: validatedData.emergencyContactNumber,
                knownAllergies: validatedData.knownAllergies,
                currentMedication: validatedData.currentMedication,
                medicalHistory: validatedData.medicalHistory
            };

            // Upload sensitive data to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);

            // Update patient with IPFS data
            patient.ipfsCID = ipfsResult.cid;
            patient.ipfsIV = ipfsResult.iv;
            await patient.save();

            return patient;
        } catch (error) {
            console.error('Error in createPatient:', error);
            throw error;
        }
    }
};

const patientLoginService = {
    validateLogin: async (email, password) => {
        try { 
            const patient = await patientSignup.findOne({ 
                email: { $regex: new RegExp(`^${email}$`, 'i') }
            });
 
            if (!patient) {
                throw new Error("Invalid email or password");
            }
             const sensitiveData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );
            const hashedInputPassword = await bcrypt.hash(password, 10);
            const isPasswordValid = await bcrypt.compare(password, sensitiveData.password);
            if (!isPasswordValid) {
                throw new Error("Invalid email or password");
            }
            const hospitalPatient = await addpatientModel.findOne({ 
                email: { $regex: new RegExp(`^${email}$`, 'i') }
            });
            const token = jwt.sign(
                { id: hospitalPatient ? hospitalPatient._id : patient._id, role: 'patient' },
                process.env.JWT_SECRET,
                { expiresIn: '2d' }
            );

            return {
                patient: hospitalPatient || patient,
                sensitiveData,
                token
            };
        } catch (error) {
            console.error('Error in validateLogin:', error);
            throw error;
        }
    }
};

const addpatientService = {
    validatePatientData: async (patientData, userRole) => {
        try {  
            if (!patientData.email) {
                throw new Error("Email is required");
            }

            // Check if email exists using the model
            const existingPatient = await addpatientModel.findOne({ 
                email: { $regex: new RegExp(`^${patientData.email}$`, 'i') }
            });
            
            if (existingPatient) {
                throw new Error("Patient profile already exists");
            }

            return patientData;
        } catch (error) {
            console.error("Error in validatePatientData:", error);
            throw error;
        }
    },

    savePatient: async (patientData) => {
        try {
            // Prepare data for IPFS
            const ipfsData = {
                fullName: patientData.fullName,
                email: patientData.email,
                medicalCondition: patientData.medicalCondition,
                admitDate: patientData.admitDate,
                medicalDocument: patientData.medicalDocument,
                roomNumber: patientData.roomNumber,
                assignedDoctor: patientData.assignedDoctor,
                medicalHistory: patientData.medicalHistory
            };

            // Upload to IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(ipfsData);

            // Create new patient document
            const patient = new addpatientModel({
                fullName: patientData.fullName,
                email: patientData.email,
                ipfsCID: cid,
                ipfsIV: iv
            });

            // Save the patient
            await patient.save();

            return {
                success: true,
                message: "Patient added successfully",
                data: {
                    fullName: patient.fullName,
                    email: patient.email,
                    ipfsCID: patient.ipfsCID,
                    ipfsIV: patient.ipfsIV
                }
            };
        } catch (error) {
            console.error("Error in savePatient:", error);
            throw error;
        }
    }
};

const readpatientdataByName = {
    readpatientdataByName: async (name) => {
        try {
            // Find patient in addpatientModel
            const patient = await addpatientModel.findOne({ fullName: name });
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get IPFS data for sensitive information
            const ipfsData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            // Return the raw data for controller to format
            return {
                patient,
                ipfsData
            };
        } catch (error) {
            console.error("Service: Error in readpatientdataByName:", error);
            throw error;
        }
    }
};

const readAllpatientdata = {
    readAllpatientdata: async (filters, page = 1, limit = 10) => {
        try {
            // Auto-fix for version and patientId (keep as is)
            await addpatientModel.updateMany(
                { $or: [ { version: null }, { version: { $exists: false } } ] },
                [ { $set: { version: 1 } } ]
            );
            await addpatientModel.updateMany(
                { $or: [ { patientId: null }, { patientId: { $exists: false } } ] },
                [ { $set: { patientId: "$__id" } } ]
            );

            // Build query based on filters
            let query = {};
            if (filters?.fullName) {
                query.fullName = { $regex: new RegExp(filters.fullName, 'i') };
            }

            // Pagination logic
            const totalPatients = await addpatientModel.countDocuments(query);
            const totalPages = Math.ceil(totalPatients / limit);

            // Get only the required page
            const addedPatients = await addpatientModel.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();

            // Decrypt IPFS data for each patient
            const formattedAddedPatients = await Promise.all(addedPatients.map(async (patient) => {
                let admitDate = "Not Available";
                let condition = "Not Available";
                let room = "Not Assigned";
                let doctor = "Not Assigned";
                try {
                    if (patient.ipfsCID && patient.ipfsIV) {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(patient.ipfsCID, patient.ipfsIV);
                        admitDate = ipfsData.admitDate || admitDate;
                        condition = ipfsData.medicalCondition || condition;
                        room = ipfsData.roomNumber || room;
                        doctor = ipfsData.assignedDoctor || doctor;
                    }
                } catch (e) { 
                    console.error(`Error decrypting IPFS for patient ${patient._id}:`, e);
                }
                return {
                    _id: patient._id.toString(),
                    name: patient.fullName,
                    email: patient.email,
                    admitDate,
                    condition,
                    room,
                    doctor,
                    isAdded: true
                };
            }));

            // Create a set of emails from addedPatients for quick lookup
            const addedPatientsEmails = addedPatients.map(p => p.email);

            // Filter signup patients to only include those not in addpatientModel
            const signupPatients = await patientSignup.find({
                email: { $nin: addedPatientsEmails }
            }).lean();

            // Format signup patients data
            const formattedSignupPatients = signupPatients.map(patient => ({
                _id: patient._id.toString(),
                name: patient.fullName,
                email: patient.email,
                admitDate: "Not Admitted",
                condition: "Not Specified",
                room: "Not Assigned",
                doctor: "Not Assigned",
                isAdded: false
            }));

            // Combine both arrays
            const allPatients = [...formattedAddedPatients, ...formattedSignupPatients];

            // Return empty array with message if no patients found
            if (allPatients.length === 0) {
                return {
                    success: true,
                    data: [],
                    message: "No patients found"
                };
            }

            return {
                success: true,
                data: allPatients,
                message: "Patients retrieved successfully",
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalPatients,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            };

        } catch (error) {
            console.error("Service: Error in readAllpatientdata:", error);
            return {
                success: false,
                data: [],
                message: error.message || "Error processing patient data"
            };
        }
    }
};

const updatePatientService = {
    updatePatientData: async (fullName, updateData) => {
        try {
            // Find the original patient document
            const originalPatient = await addpatientModel.findOne({ fullName })
                .sort({ version: 1 })
                .limit(1);

            if (!originalPatient) {
                throw new Error("Patient not found");
            }

            // Get current IPFS data
            const currentIpfsData = await IPFSService.retrieveAndDecrypt(
                originalPatient.ipfsCID,
                originalPatient.ipfsIV
            );

            // Only update the specified fields while keeping original data
            const updatedIpfsData = {
                ...currentIpfsData,
                medicalCondition: updateData.medicalCondition || currentIpfsData.medicalCondition,
                roomNumber: updateData.roomNumber || currentIpfsData.roomNumber,
                assignedDoctor: updateData.assignedDoctor || currentIpfsData.assignedDoctor
            };

            // Upload updated data to IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(updatedIpfsData);

            // Get the latest version number
            const latestVersion = await addpatientModel.findOne({ fullName })
                .sort({ version: -1 })
                .select('version')
                .limit(1);

            const newVersion = (latestVersion ? latestVersion.version : 0) + 1;

            // Create a new document for this update
            const updatedPatient = new addpatientModel({
                patientId: originalPatient._id, // Link to original patient
                fullName: originalPatient.fullName,
                email: originalPatient.email,
                ipfsCID: cid,
                ipfsIV: iv,
                version: newVersion,
                appointments: originalPatient.appointments,
                primaryDoctor: originalPatient.primaryDoctor
            });

            // Save the new document
            await updatedPatient.save();

            return {
                patient: updatedPatient,
                ipfsData: updatedIpfsData
            };
        } catch (error) {
            console.error("Service: Error in updatePatientData:", error);
            throw error;
        }
    }
};

const deletePatientService = {
    deletePatientData: async (fullName) => {
        try {
            // Find patient in addpatientModel
            const patient = await addpatientModel.findOne({ fullName });

            if (!patient) {
                throw new Error("Patient not found");
            }

            // Delete patient from addpatientModel
            await addpatientModel.deleteOne({ fullName });

            return {
                message: "Patient deleted successfully"
            };
        } catch (error) {
            console.error("Service: Error in deletePatientData:", error);
            throw error;
        }
    }
};

const addPrimaryDoctor = async (patientId, doctorId) => {
    try {
        const patient = await AddPatient.findById(patientId);
        if (!patient) {
            throw new Error('Patient not found');
        }

        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            throw new Error('Doctor not found');
        }

        patient.primaryDoctor = doctorId;
        await patient.save();
        
        return {
            success: true,
            message: 'Primary doctor assigned successfully'
        };
    } catch (error) {
        throw new Error(`Error assigning primary doctor: ${error.message}`);
    }
};

const patientService = {
    getPatientAppointments: async (patientId) => {
        try {
            // Verify patient exists
            const patient = await addpatientModel.findById(patientId);
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get all appointments for the patient
            const appointments = await appointmentModel.find({ patientId })
                .populate('doctorId', 'fullName specialization')
                .sort({ appointmentDate: 1, appointmentTime: 1 });

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
            console.log("Error in getPatientAppointments:", error.message);
            throw error;
        }
    },

    getPatientDashboardData: async (patientEmail) => {
        try {
            // First find in addpatientModel
            const hospitalPatient = await addpatientModel.findOne({ 
                email: patientEmail.toLowerCase().trim() 
            });
            
            // If not found, find in patientSignup
            const signupPatient = await patientSignup.findOne({ 
                email: patientEmail.toLowerCase().trim() 
            });

            if (!hospitalPatient && !signupPatient) {
                throw new Error("Patient not found");
            }

            // Use the correct patient ID - prefer hospitalPatient if exists
            const patientId = hospitalPatient ? hospitalPatient._id : signupPatient._id;
            const signupId = hospitalPatient ? hospitalPatient.patientId : signupPatient._id;

            // Get all appointments for this patient using both IDs
            const appointments = await appointmentModel.find({
                $or: [
                    { patientId: patientId },
                    { patientId: signupId }
                ]
            })
            .populate('doctorId', 'fullName specialization email experience availability profileimage')
            .sort({ createdAt: -1 });

            // Process appointments in real-time
            const recentAppointments = await Promise.all(
                appointments.slice(0, 4).map(async (app) => {
                    if (app.ipfsCID && app.ipfsIV) {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(
                            app.ipfsCID,
                            app.ipfsIV
                        );
                        return {
                            _id: app._id,
                            doctorName: app.doctorId?.fullName,
                            appointmentDate: ipfsData.appointmentDate,
                            appointmentTime: ipfsData.appointmentTime,
                            status: ipfsData.status
                        };
                    }
                    return null;
                })
            );

            // Get medical records using both IDs
            const medicalRecords = await medicalHistoryModel.countDocuments({
                $or: [
                    { patientId: patientId },
                    { patientId: signupId }
                ]
            });

            return {
                success: true,
                data: {
                    totalAppointments: appointments.length,
                    medicalRecords: medicalRecords,
                    recentAppointments: recentAppointments.filter(Boolean),
                    primaryDoctor: appointments[0]?.doctorId || null,
                    patientInfo: {
                        id: patientId,
                        signupId: signupId,
                        fullName: hospitalPatient?.fullName || signupPatient?.fullName,
                        email: patientEmail
                    }
                }
            };
        } catch (error) {
            console.error('Error in getPatientDashboardData:', error);
            throw error;
        }
    }
};

const getAllPatients = async () => {
    try {
        // Get all patients from addpatientModel
        const patients = await addpatientModel.find({});

        if (!patients || patients.length === 0) {
            return {
                success: true,
                data: [],
                message: 'No patients found. Please add a patient to initialize the system.'
            };
        }

        // Get IPFS data for each patient
        const patientsWithData = await Promise.all(patients.map(async (patient) => {
            try {
                if (patient.ipfsCID && patient.ipfsCID !== 'defaultCID') {
                    const ipfsData = await IPFSService.retrieveAndDecrypt(
                        patient.ipfsCID,
                        patient.ipfsIV
                    );
                    return {
                        ...patient.toObject(),
                        sensitiveData: ipfsData
                    };
                }
                return patient.toObject();
            } catch (error) {
                console.error(`Error retrieving IPFS data for patient ${patient._id}:`, error);
                return patient.toObject();
            }
        }));

        return {
            success: true,
            data: patientsWithData,
            message: 'Patients retrieved successfully'
        };

    } catch (error) {
        console.error('Error in getAllPatients:', error);
        return {
            success: false,
            data: [],
            message: error.message || 'Error processing patient data'
        };
    }
}

module.exports = {
    patientSignupService,
    patientLoginService,
    addpatientService,
    readpatientdataByName,
    readAllpatientdata,
    updatePatientService,
    deletePatientService,
    addPrimaryDoctor,
    patientService,
    getAllPatients,
    // getPatientSensitiveData
};