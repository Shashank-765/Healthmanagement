const express = require('express');
const { patientSignupService, patientLoginService } = require('../../services/patientservices');
const upload = require('../../utils/multer');
const patientLogin = require('../../models/patient/loginModel');
const IPFSService = require('../../services/ipfsService');
const patientSignup = require('../../models/patient/signupModel');
const doctorSignup = require('../../models/doctor/signupModel');
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
            const { patient, sensitiveData, token } = await patientLoginService.validateLogin(email, password);
            console.log("Controller: Login validation successful");

            console.log("Controller: Sending response...");
            res.status(200).json({
                statusCode: 200,
                message: "Patient login successful",
                data: {
                    _id: patient._id,
                    email: patient.email,
                    fullName: patient.fullName,
                    password: sensitiveData.password,
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

    getSensitiveData: async (req, res) => {
        try {
            const { cid } = req.params;
            const userRole = req.user.role; // Get role from JWT token

            let user;
            let sensitiveData;

            // Find user based on role
            if (userRole === 'patient') {
                user = await patientSignup.findOne({ ipfsCID: cid });
            } else if (userRole === 'doctor') {
                user = await doctorSignup.findOne({ ipfsCID: cid });
            } else {
                throw new Error("Invalid user role");
            }

            if (!user) {
                throw new Error(`${userRole} not found`);
            }

            if (!user.ipfsCID || !user.ipfsIV) {
                throw new Error(`${userRole} IPFS data is incomplete`);
            }

            // Retrieve and decrypt sensitive data
            sensitiveData = await IPFSService.retrieveAndDecrypt(
                user.ipfsCID,
                user.ipfsIV
            );

            if (!sensitiveData) {
                throw new Error("Failed to retrieve sensitive data from IPFS");
            }

            res.status(200).json({
                statusCode: 200,
                message: "Sensitive data retrieved successfully",
                data: {
                    [userRole]: {
                        _id: user._id,
                        fullName: user.fullName,
                        email: user.email,
                        ...(userRole === 'doctor' && { specialization: user.specialization })
                    },
                    sensitiveData: sensitiveData
                }
            });
            console.log("Controller: Response sent successfully");

        } catch (error) {
            console.error('Controller: Error fetching sensitive data:', error);
            const statusCode = error.message.includes("not found") ? 404 : 500;
            res.status(statusCode).json({
                statusCode,
                message: error.message || "Failed to retrieve sensitive data"
            });
        }
    }
};