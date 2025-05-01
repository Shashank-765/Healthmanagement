const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const Cookies = require('js-cookie');
const patientSignup = require('../models/patient/signupModel');
const patientLogin = require('../models/patient/loginModel');
const IPFSService = require('./ipfsService');
const mnemonic = process.env.mnemonic;
const addpatientModel = require('../models/patient/addpatientModel');
const AddDoctorModel = require('../models/doctor/adddoctorModel');
const appointmentModel = require('../models/appointment/appointmentModel');
const medicalHistoryModel = require('../models/medicalHistory/medicalHistoryModel');
// const AddPatient = require('../models/patient/addpatientModel');
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

            // Validate date of birth format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(patientData.dateOfBirth)) {
                throw new Error("Date of birth must be in YYYY-MM-DD format");
            }

            // Validate if date is valid
            const date = new Date(patientData.dateOfBirth);
            if (isNaN(date.getTime())) {
                throw new Error("Please enter a valid date of birth");
            }

            // Validate if date is not in the future
            const today = new Date();
            if (date > today) {
                throw new Error("Date of birth cannot be in the future");
            }

            // Validate phone number format
            if (!/^\d{10}$/.test(patientData.phoneNumber)) {
                throw new Error("Phone number must be exactly 10 digits");
            }

            // Validate emergency contact number format
            if (!/^\d{10}$/.test(patientData.emergencyContactNumber)) {
                throw new Error("Emergency contact number must be exactly 10 digits");
            }

            // Generate wallet
            const walletData = await patientSignupService.generateWallet();
            
            // Hash password
            const hashedPassword = await bcrypt.hash(patientData.password, 10);

            return {
                ...patientData,
                password: hashedPassword,
                walletAddress: walletData.address
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
                gender: validatedData.gender,
                dateOfBirth: validatedData.dateOfBirth,
                email: validatedData.email,
                medicalDocument: validatedData.medicalDocument,
                walletAddress: validatedData.walletAddress
            };

            // Create patient in MongoDB using raw MongoDB operations
            const db = patientSignup.db;
            const collection = db.collection('patientsignups');
            const result = await collection.insertOne(mongoData);

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                password: validatedData.password,
                walletAddress: validatedData.walletAddress,
                phoneNumber: validatedData.phoneNumber,
                bloodGroup: validatedData.bloodGroup,
                emergencyContactNumber: validatedData.emergencyContactNumber,
                knownAllergies: validatedData.knownAllergies,
                currentMedication: validatedData.currentMedication,
                medicalHistory: validatedData.medicalHistory,
                medicalDocument: validatedData.medicalDocument
            };

            // Upload sensitive data to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);

            // Update patient with IPFS data using raw MongoDB operations
            await collection.updateOne(
                { _id: result.insertedId },
                { 
                    $set: { 
                        ipfsCID: ipfsResult.cid,
                        ipfsIV: ipfsResult.iv
                    } 
                }
            );

            // Find and return the complete patient document
            const patient = await collection.findOne({ _id: result.insertedId });

            // return await collection.findOne({ _id: result.insertedId });
            
            if (!patient) {
                throw new Error("Failed to create patient record");
            }

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
            console.log("1. Starting login validation...");
            console.log("Email received:", email);
            
            // 1. Pehle patientSignup mein check karo
            const patient = await patientSignup.findOne({ 
                email: { $regex: new RegExp(`^${email}$`, 'i') }
            });
            
            console.log("2. Patient found in signup:", patient ? "Yes" : "No");
            
            if (!patient) {
                throw new Error("Invalid email or password");
            }

            // 2. Password verify karo
            console.log("3. Retrieving sensitive data...");
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            console.log("4. Sensitive data retrieved:", sensitiveData ? "Yes" : "No");
            console.log("5. Comparing passwords...");
            console.log("Input password length:", password.length);
            console.log("Stored password hash length:", sensitiveData.password.length);

            // Try to hash the input password to compare
            const hashedInputPassword = await bcrypt.hash(password, 10);
            console.log("Hashed input password length:", hashedInputPassword.length);

            const isPasswordValid = await bcrypt.compare(password, sensitiveData.password);
            console.log("6. Password valid:", isPasswordValid ? "Yes" : "No");

            if (!isPasswordValid) {
                throw new Error("Invalid email or password");
            }

            // 3. Phir addpatientModel mein check karo
            console.log("7. Checking hospital records...");
            const hospitalPatient = await addpatientModel.findOne({ 
                email: { $regex: new RegExp(`^${email}$`, 'i') }
            });
            
            console.log("8. Patient found in hospital:", hospitalPatient ? "Yes" : "No");
            
            // 4. Token generate karo
            const token = jwt.sign(
                { id: hospitalPatient ? hospitalPatient._id : patient._id, role: 'patient' },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            console.log("9. Token generated successfully");

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
            // Check if patient exists in signup database
            const signedUpPatient = await patientSignup.findOne({
                email: patientData.email
            });
            
            console.log("Patient in signup database:", signedUpPatient ? " Found" : " Not found");

            // If user is not admin, check if email exists in signup
            if (userRole !== 'admin') {
                if (!signedUpPatient) {
                    throw new Error("Patient must be signed up first. Please register before adding patient details.");
                }
                console.log("Patient found in signup database");
            }

            // Check if already added to addpatientModel
            const existingPatient = await addpatientModel.findOne({ email: patientData.email });
            if (existingPatient) {
                throw new Error("Patient profile already exists in hospital records");
            }

            // Validate required fields and their types
            const requiredFields = {
                medicalCondition: 'string',
                admitDate: 'date',
                medicalDocument: 'string',
                roomNumber: 'number',
                assignedDoctor: 'string',
                medicalHistory: 'string',
            };

            // Check for missing or invalid fields
            const errors = [];
            for (const [field, type] of Object.entries(requiredFields)) {
                if (!patientData[field]) {
                    errors.push(`${field} is required`);
                } else {
                    // Type validation
                    if (type === 'number' && isNaN(Number(patientData[field]))) {
                        errors.push(`${field} must be a number`);
                    } else if (type === 'date' && isNaN(Date.parse(patientData[field]))) {
                        errors.push(`${field} must be a valid date`);
                    }
                }
            }

            if (errors.length > 0) {
                throw new Error(`Validation failed: ${errors.join(', ')}`);
            }

            // Basic data that will always be included
            let returnData = {
                fullName: patientData.fullName || signedUpPatient?.fullName,
                email: patientData.email,
                medicalCondition: patientData.medicalCondition,
                admitDate: patientData.admitDate,
                medicalDocument: patientData.medicalDocument,
                roomNumber: parseInt(patientData.roomNumber),
                assignedDoctor: patientData.assignedDoctor,
                medicalHistory: patientData.medicalHistory,
            };

            // Only include signup data if patient exists in signup database
            if (signedUpPatient) {
                console.log("Adding signup data to patient record");
                returnData = {
                    ...returnData,
                    gender: signedUpPatient.gender,
                    dateOfBirth: signedUpPatient.dateOfBirth,
                    ipfsCID: signedUpPatient.ipfsCID,
                    ipfsIV: signedUpPatient.ipfsIV,
                    signupData: {
                        password: signedUpPatient.password,
                        age: signedUpPatient.age,
                        phoneNumber: signedUpPatient.phoneNumber,
                        bloodGroup: signedUpPatient.bloodGroup,
                        emergencyContactNumber: signedUpPatient.emergencyContactNumber,
                        knownAllergies: signedUpPatient.knownAllergies,
                        currentMedication: signedUpPatient.currentMedication,
                        walletAddress: signedUpPatient.walletAddress
                    }
                };
            }

            console.log(" Patient data validation successful");
            return returnData;
        } catch (error) {
            console.error(" Error in validatePatientData:", error);
            throw error;
        }
    },

    savePatient: async (addpatientRequest) => {
        try {
            console.log("Saving patient data...");
            
            // Prepare data for IPFS
            const ipfsData = {
                medicalHistory: addpatientRequest.medicalHistory,
                medicalDocument: addpatientRequest.medicalDocument,
                admitDate: addpatientRequest.admitDate,
                medicalCondition: addpatientRequest.medicalCondition,
                roomNumber: addpatientRequest.roomNumber,
                assignedDoctor: addpatientRequest.assignedDoctor,
            };
    
            // Include signupData fields if available
            if (addpatientRequest.signupData) {
                console.log("Including signup data in IPFS");
                ipfsData.password = addpatientRequest.signupData.password;
                ipfsData.walletAddress = addpatientRequest.signupData.walletAddress;
                ipfsData.phoneNumber = addpatientRequest.signupData.phoneNumber;
                ipfsData.bloodGroup = addpatientRequest.signupData.bloodGroup;
                ipfsData.emergencyContactNumber = addpatientRequest.signupData.emergencyContactNumber;
                ipfsData.knownAllergies = addpatientRequest.signupData.knownAllergies;
                ipfsData.currentMedication = addpatientRequest.signupData.currentMedication;
            }
    
            // Upload to IPFS and encrypt
            const { cid, iv } = await IPFSService.uploadEncryptedData(ipfsData);
    
            // Create MongoDB document with all required fields
            const patient = new addpatientModel({
                fullName: addpatientRequest.fullName,
                email: addpatientRequest.email,
                medicalCondition: addpatientRequest.medicalCondition,
                admitDate: addpatientRequest.admitDate,
                medicalDocument: addpatientRequest.medicalDocument,
                roomNumber: parseInt(addpatientRequest.roomNumber),
                assignedDoctor: addpatientRequest.assignedDoctor,
                medicalHistory: addpatientRequest.medicalHistory,
                ipfsCID: cid,
                ipfsIV: iv,
                // Include additional fields if available
                gender: addpatientRequest.gender,
                dateOfBirth: addpatientRequest.dateOfBirth
            });
    
            // Save patient
            const savedPatient = await patient.save();
            console.log(" Patient saved to database");

            return {
                success: true,
                message: "Patient added successfully",
                data: savedPatient
            };
        } catch (error) {
            console.error(" Error in savePatient:", error);
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
    readAllpatientdata: async (filters) => {
        try {
            // Build query based on filters
            let query = {};
            if (filters?.fullName) {
                query.fullName = { $regex: new RegExp(filters.fullName, 'i') };
            }

            console.log('Filter Query:', query);

            try {
                // Get all patients from both collections
                const [addedPatients, signupPatients] = await Promise.all([
                    // Get patients from addpatientModel
                    addpatientModel.find(query).lean(),  // Using .lean() for better performance
                    // Get patients from patientSignup who are not in addpatientModel
                    patientSignup.find(query).lean()     // Using .lean() for better performance
                ]);

                // Create a set of emails from addedPatients for quick lookup
                const addedPatientsEmails = new Set(addedPatients.map(p => p.email));

                // Filter signup patients to only include those not in addpatientModel
                const uniqueSignupPatients = signupPatients.filter(p => !addedPatientsEmails.has(p.email));

                // Format added patients data
                const formattedAddedPatients = addedPatients.map(patient => ({
                    _id: patient._id.toString(), // Convert ObjectId to string
                    name: patient.fullName,
                    email: patient.email,
                    admitDate: patient.admitDate || "Not Available",
                    condition: patient.medicalCondition || "Not Available",
                    room: patient.roomNumber || "Not Assigned",
                    doctor: patient.assignedDoctor || "Not Assigned",
                    isAdded: true // Flag to indicate this patient is in addpatientModel
                }));

                // Format signup patients data
                const formattedSignupPatients = uniqueSignupPatients.map(patient => ({
                    _id: patient._id.toString(), // Convert ObjectId to string
                    name: patient.fullName,
                    email: patient.email,
                    admitDate: "Not Admitted",
                    condition: "Not Specified",
                    room: "Not Assigned",
                    doctor: "Not Assigned",
                    isAdded: false // Flag to indicate this patient is only in signup
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
                    message: "Patients retrieved successfully"
                };

            } catch (error) {
                console.error("Error in database operations:", error);
                return {
                    success: false,
                    data: [],
                    message: error.message || "Error retrieving patients data"
                };
            }

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
            // Find patient in addpatientModel
            const patient = await addpatientModel.findOne({ fullName });
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get current IPFS data
            const currentIpfsData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            // Prepare updated IPFS data with all possible fields
            const updatedIpfsData = {
                ...currentIpfsData,
                // Basic information
                fullName: updateData.fullName || currentIpfsData.fullName,
                email: updateData.email || currentIpfsData.email,
                bloodGroup: updateData.bloodGroup || currentIpfsData.bloodGroup,
                phoneNumber: updateData.phoneNumber || currentIpfsData.phoneNumber,
                // Additional medical information
                medicalCondition: updateData.medicalCondition || currentIpfsData.medicalCondition,
                roomNumber: updateData.roomNumber || currentIpfsData.roomNumber,
                assignedDoctor: updateData.assignedDoctor || currentIpfsData.assignedDoctor,
                emergencyContactNumber: updateData.emergencyContactNumber || currentIpfsData.emergencyContactNumber
            };

            // Upload updated data to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(updatedIpfsData);

            // Update patient in MongoDB with both IPFS references and direct data
            const updatedPatient = await addpatientModel.findOneAndUpdate(
                { fullName },
                { 
                    $set: {
                        // Update IPFS references
                        ipfsCID: ipfsResult.cid,
                        ipfsIV: ipfsResult.iv,
                        // Update direct data in MongoDB
                        fullName: updatedIpfsData.fullName,
                        email: updatedIpfsData.email,
                        medicalCondition: updatedIpfsData.medicalCondition,
                        roomNumber: updatedIpfsData.roomNumber,
                        assignedDoctor: updatedIpfsData.assignedDoctor
                    }
                },
                { new: true }
            );

            if (!updatedPatient) {
                throw new Error("Failed to update patient record");
            }

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
//new to check
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

    getPatientDashboardData: async (patientId) => {
        try {
           const appointments = await appointmentModel.find({ patientId })
                .populate('doctorId', 'fullName specialization email experience availability profileimage')
                .sort({ appointmentDate: -1, appointmentTime: -1 });

            // 2. Total appointments
            // const totalAppointments = appointments.length;
            const totalAppointments = await appointmentModel.countDocuments({ patientId });

          const recentAppointments = appointments.slice(0, 4).map(app => ({
                doctorName: app.doctorId?.fullName,
                date: app.appointmentDate,
                time: app.appointmentTime
            }));

            // 4. Primary doctor (from most recent appointment)
            const primaryDoctor = appointments[0]?.doctorId || null;

            // 5. Static medical records
            const medicalRecords = 8;

            return {
                totalAppointments,
                medicalRecords,
                recentAppointments,
                primaryDoctor
            };
        } catch (error) {
            console.error("Error in getPatientDashboardData:", error);
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
        if (error.message.includes('defaultCID')) {
            return {
                success: true,
                data: [],
                message: 'No patients found. Please add a patient to initialize the system.'
            };
        }
        throw error;
    }
};

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
    getAllPatients
};