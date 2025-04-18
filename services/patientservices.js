const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const patientSignup = require('../models/patient/signupModel');
const patientLogin = require('../models/patient/loginModel');
const IPFSService = require('./ipfsService');
const mnemonic = process.env.mnemonic;

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
                console.log("Validation failed: Email or password missing");
                throw new Error("Email and password are required");
            }

            console.log("2. Checking patient in signup collection...");
            const patient = await patientSignup.findOne({ email });
            if (!patient) {
                console.log("Patient not found in signup collection");
                throw new Error("Invalid email or password");
            }
            console.log("3. Patient found in signup collection");

            console.log("4. Checking login data...");
            let loginData = await patientLogin.findOne({ email });
            
            if (!loginData) {
                console.log("5. No login data found, creating new login record...");
                const sensitiveData = await IPFSService.retrieveAndDecrypt(
                    patient.ipfsCID,
                    patient.ipfsIV
                );
                console.log("6. Retrieved sensitive data from IPFS");
                
                loginData = await patientLogin.create({
                    email: email,
                    password: sensitiveData.password
                });
                console.log("7. Created new login record");
            } else {
                console.log("5. Found existing login data");
            }

            console.log("8. Comparing passwords...");
            const isPasswordValid = await bcrypt.compare(password, loginData.password);
            if (!isPasswordValid) {
                console.log("Password comparison failed");
                throw new Error("Invalid email or password");
            }
            console.log("9. Password comparison successful");

            console.log("10. Generating token...");
            const token = jwt.sign({ id: patient._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
            console.log("11. Token generated successfully");

            return {
                patient,
                loginData,
                token
            };
        } catch (error) {
            console.error("Login validation error:", error);
            throw new Error(error.message || "Login validation failed");
        }
    }
};

module.exports = {
    patientSignupService,
    patientLoginService
};