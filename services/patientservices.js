const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const Cookies = require('js-cookie');
const patientSignup = require('../models/patient/signupModel');
const patientLogin = require('../models/patient/loginModel');
const IPFSService = require('./ipfsService');
const mnemonic = process.env.mnemonic;
const addpatientModel = require('../models/patient/addpatientModel');

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
            
            if (!email || !password) {
                throw new Error("Email and password are required");
            }

            const patient = await patientSignup.findOne({ email });
            if (!patient) {
                throw new Error("Invalid email or password");
            }

            console.log("2. Patient found, retrieving sensitive data...");
            if (!patient.ipfsCID || !patient.ipfsIV) {
                throw new Error("Patient data is incomplete - missing IPFS information");
            }

            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            if (!sensitiveData || !sensitiveData.password) {
                throw new Error("Failed to retrieve or decrypt sensitive data");
            }

            console.log("3. Sensitive data retrieved successfully");
            const isPasswordValid = await bcrypt.compare(password, sensitiveData.password);
            if (!isPasswordValid) {
                throw new Error("Invalid email or password");
            }

            // Generate JWT token with role
            const token = jwt.sign(
                { 
                    id: patient._id,
                    role: 'patient'  // Add role to token
                },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            // Store token in cookie
            Cookies.set('patientToken', token, { 
                expires: 30, // 30 days
                sameSite: 'strict'
            });

            return {
                patient,
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
                fullName: patientData.fullName,
                email: patientData.email
            });

            // For non-admin roles, require patient to exist in signup
            if (userRole !== 'admin' && !signedUpPatient) {
                throw new Error("Patient must be signed up first with same full name and email");
            }

            // Check if already added to addpatientModel
            const existingPatient = await addpatientModel.findOne({ email: patientData.email });
            if (existingPatient) {
                throw new Error("Patient profile already exists");
            }

            // Validate required fields and their types
            const requiredFields = {
                medicalCondition: 'string',
                admitDate: 'date',
                medicalDocument: 'string',
                roomNumber: 'number',
                assignedDoctor: 'string',
                medicalHistory: 'string',
                insuranceInformation: 'string'
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
                throw new Error(`AddPatient validation failed: ${errors.join(', ')}`);
            }

            // Basic data that will always be included
            let returnData = {
                fullName: patientData.fullName,
                email: patientData.email,
                medicalCondition: patientData.medicalCondition,
                admitDate: patientData.admitDate,
                medicalDocument: patientData.medicalDocument,
                roomNumber: parseInt(patientData.roomNumber),
                assignedDoctor: patientData.assignedDoctor,
                medicalHistory: patientData.medicalHistory,
                insuranceInformation: patientData.insuranceInformation
            };

            // Only include signup data if patient exists in signup database
            if (signedUpPatient) {
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

            return returnData;
        } catch (error) {
            throw error;
        }
    },

    savePatient: async (addpatientRequest) => {
        try {
            // Prepare data for IPFS
            const ipfsData = {
                medicalHistory: addpatientRequest.medicalHistory,
                medicalDocument: addpatientRequest.medicalDocument,
                admitDate: addpatientRequest.admitDate,
                medicalCondition: addpatientRequest.medicalCondition,
                roomNumber: addpatientRequest.roomNumber,
                assignedDoctor: addpatientRequest.assignedDoctor,
                insuranceInformation: addpatientRequest.insuranceInformation
            };
    
            // Include signupData fields only if signupData exists
            if (addpatientRequest.signupData) {
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
                insuranceInformation: addpatientRequest.insuranceInformation,
                ipfsCID: cid,
                ipfsIV: iv
            });
    
            // Save patient
            const savedPatient = await patient.save();
            return savedPatient;
        } catch (error) {
            console.error("Service: Error in savePatient:", error);
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
                query.fullName = { $regex: new RegExp(filters.fullName, 'i') }; // Case-insensitive search
            }

            console.log('Filter Query:', query);

            // Get all patients from addpatientModel with filters
            const patients = await addpatientModel.find(query);
            if (!patients || patients.length === 0) {
                console.log('No patients found with the given filters');
                throw new Error("No patients found");
            }

            console.log(`Found ${patients.length} patients`);

            // Get IPFS data for each patient
            const patientsWithData = await Promise.all(patients.map(async (patient) => {
                const ipfsData = await IPFSService.retrieveAndDecrypt(
                    patient.ipfsCID,
                    patient.ipfsIV
                );
                return {
                    patient,
                    ipfsData
                };
            }));

            return patientsWithData;
        } catch (error) {
            console.error("Service: Error in readAllpatientdata:", error);
            throw error;
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

module.exports = {
    patientSignupService,
    patientLoginService,
    addpatientService,
    readpatientdataByName,
    readAllpatientdata,
    updatePatientService,
    deletePatientService
};