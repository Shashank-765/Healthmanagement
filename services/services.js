const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const patientSignup = require('../models/patient/signupModel');
const patientLogin = require('../models/patient/loginModel');
const IPFSService = require('../services/ipfsService');
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
            // Create patient in MongoDB with all required fields
            const patient = await patientSignup.create(validatedData);

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
            if (!email || !password) {
                throw new Error("Email and password are required");
            }

            // Find patient by email
            const patient = await patientSignup.findOne({ email });
            if (!patient) {
                throw new Error("Invalid email or password");
            }

            // Get sensitive data from IPFS
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            // Compare passwords
            const isPasswordValid = await bcrypt.compare(password, sensitiveData.password);
            if (!isPasswordValid) {
                throw new Error("Invalid email or password");
            }

            return patient;
        } catch (error) {
            throw new Error(error.message || "Login validation failed");
        }
    },

    generateToken: (id) => {
        return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
    }
};

module.exports = {
    patientSignupService,
    patientLoginService
};