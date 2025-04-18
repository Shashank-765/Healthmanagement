const express = require('express');
const { patientSignupService, patientLoginService } = require('../../services/patientservices');
const upload = require('../../utils/multer');
const patientLogin = require('../../models/patient/loginModel');
const IPFSService = require('../../services/ipfsService');
const patientSignup = require('../../models/patient/signupModel');
const encryptionService = require('../../utils/encryptdecrypt');
const patientSensitiveDataService = require('../../services/patientSensitiveDataService');

module.exports = {
    patientSignup: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Please upload a medical document"
                });
            }

            // Create patient data object
            const patientData = {
                fullName: req.body.fullName,
                gender: req.body.gender,
                dateOfBirth: req.body.dateOfBirth,
                phoneNumber: req.body.phoneNumber,
                email: req.body.email,
                password: req.body.password,
                bloodGroup: req.body.bloodGroup,
                emergencyContactNumber: req.body.emergencyContactNumber,
                knownAllergies: req.body.knownAllergies,
                currentMedication: req.body.currentMedication,
                medicalHistory: req.body.medicalHistory,
                medicalDocument: req.file.path // Add the uploaded file path
            };

            // Validate and create patient
            const validatedData = await patientSignupService.validatePatientData(patientData);
            const patient = await patientSignupService.createPatient(validatedData);

            // Send success response
            return res.status(201).json({
                success: true,
                message: "Patient signup successful",
                data: {
                    _id: patient._id,
                    fullName: patient.fullName,
                    gender: patient.gender,
                    email: patient.email,
                    ipfsCID: patient.ipfsCID,
                    age: patient.age,
                    createdAt: patient.createdAt,
                    updatedAt: patient.updatedAt
                }
            });

        } catch (error) {
            console.error("\n=== ERROR IN PATIENT SIGNUP ===", error.message);
            console.error("Error details:", {
                message: error.message,
                stack: error.stack
            });
            
            // Handle validation errors
            if (error.message.includes("Validation failed")) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            // Handle other errors
            const statusCode = error.message.includes("required") || 
               error.message.includes("exists") ? 400 : 500;
            
            return res.status(statusCode).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    patientLogin: async (req, res) => {
        try {
            console.log("Controller: Starting login process...");
            const { email, password } = req.body;

            if (!email || !password) {
                console.log("Controller: Missing email or password");
                return res.status(400).json({
                    statusCode: 400,
                    message: "Email and password are required"
                });
            }

            console.log("Controller: Calling validateLogin service...");
            const { patient, loginData, token } = await patientLoginService.validateLogin(email, password);
            console.log("Controller: Login validation successful");

            console.log("Controller: Sending response...");
            res.status(200).json({
                statusCode: 200,
                message: "Patient login successful",
                data: {
                    _id: patient._id,
                    email: patient.email,
                    fullName: patient.fullName,
                    hashedPassword: loginData.password,
                    token
                }
            });

        } catch (error) {
            console.error('Controller: Login error:', error);
            const statusCode = error.message.includes("Invalid") ? 401 : 500;
            res.status(statusCode).json({
                statusCode,
                message: error.message || "Internal server error"
            });
        }
    },

    // New endpoint to get sensitive data
    getPatientSensitiveData: async (req, res) => {
        try {
            const patientId = req.params.id;
            const patient = await patientSignup.findById(patientId);

            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Use IPFSService's retrieveAndDecrypt method
            const decryptedData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );
            console.log('Decrypted data:', decryptedData);

            res.status(200).json({
                success: true,
                data: decryptedData
            });
        } catch (error) {
            console.error("Error retrieving sensitive data:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }
};