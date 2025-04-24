const express = require('express');
const { patientSignupService, patientLoginService, addpatientService, readpatientdataByName, readAllpatientdata, updatePatientService, deletePatientService } = require('../../services/patientservices');
const upload = require('../../utils/multer');
const patientLogin = require('../../models/patient/loginModel');
const IPFSService = require('../../services/ipfsService');
const patientSignup = require('../../models/patient/signupModel');
const doctorSignup = require('../../models/doctor/signupModel');
const encryptionService = require('../../utils/encryptdecrypt');
const patientSensitiveDataService = require('../../services/patientSensitiveDataService');
const addpatientModel = require('../../models/patient/addpatientModel');
const jwt = require('jsonwebtoken');

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

            // Save login data with token
            const loginData = {
                email: patient.email,
                password: sensitiveData.password,
                token: token,
                lastLogin: new Date()
            };

            // Save or update login record with token
            const savedLogin = await patientLogin.findOneAndUpdate(
                { email: patient.email },
                loginData,
                { upsert: true, new: true }
            );

            console.log("Controller: Login data saved successfully");

            console.log("Controller: Sending response...");
            res.status(200).json({
                statusCode: 200,
                message: "Patient login successful",
                data: {
                    _id: patient._id,
                    email: patient.email,
                    token: savedLogin.token // Use the saved token
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
    //after signup
    getSensitiveData: async (req, res) => {
        try {
            const { cid } = req.params;

            // Use the service to get sensitive data
            const { user, sensitiveData, userRole } = await patientSensitiveDataService.getSensitiveDataByCID(cid, req);

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
    },

    addPatient: async (req, res) => {
        try {
            // Get token from header or cookies
            let token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                // Check for token in cookies
                token = req.cookies?.adminToken || req.cookies?.patientToken;
            }

            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: "No token provided"
                });
            }

            // Verify token and get user role
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userRole = decoded.role;

            // Create patient data object
            const patientData = {
                fullName: req.body.fullName,
                email: req.body.email,
                medicalCondition: req.body.medicalCondition,
                admitDate: req.body.admitDate,
                medicalDocument: req.body.medicalDocument,
                roomNumber: req.body.roomNumber,
                assignedDoctor: req.body.assignedDoctor,
                medicalHistory: req.body.medicalHistory,
                insuranceInformation: req.body.insuranceInformation,
                // profileimage: req.file.path // Use the uploaded file path
            };

            // Validate and create patient with user role
            const validatedData = await addpatientService.validatePatientData(patientData, userRole);
            const patient = await addpatientService.savePatient(validatedData);

            // Send success response
            return res.status(201).json({
                success: true,
                message: "Patient added successfully",
                data: {
                    _id: patient._id,
                    fullName: patient.fullName,
                    age: patient.age,
                    gender: patient.gender,
                    bloodGroup: patient.bloodGroup,
                    admitDate: patient.admitDate,
                    email: patient.email,
                    // dateOfBirth: patient.dateOfBirth,
                    roomNumber: patient.roomNumber,
                    contactNumber: patient.contactNumber,
                    medicalCondition: patient.medicalCondition,
                    ipfsCID: patient.ipfsCID,
                    ipfsIV: patient.ipfsIV,
                    createdAt: patient.createdAt,
                    updatedAt: patient.updatedAt
                }
            });

        } catch (error) {
            console.error("\n=== ERROR IN ADD PATIENT ===", error.message);
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

            // Handle token errors
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: "Invalid or expired token"
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

    getPatientCompleteData: async (req, res) => {
        try {
            const { email } = req.params;

            // Get patient data using the service
            const patientData = await patientSensitiveDataService.getPatientDataByEmail(email);

            return res.status(200).json({
                success: true,
                message: "Patient data retrieved successfully",
                data: patientData
            });

        } catch (error) {
            console.error('Error in getPatientCompleteData:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to retrieve patient data"
            });
        }
    },
    readpatientdataByName: async (req, res) => {
        try {
            const { fullName } = req.params;
            
            // Input validation
            if (!fullName) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name is required"
                });
            }

            // Check if patient exists
            const notExist = await addpatientModel.findOne({ fullName: fullName });
            if (!notExist) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Get patient data from service
            const { patient, ipfsData } = await readpatientdataByName.readpatientdataByName(fullName);

            // Format response
            return res.status(200).json({
                success: true,
                message: "Patient data retrieved successfully",
                data: {
                    _id: patient._id,
                    fullName: patient.fullName,
                    email: patient.email,
                    medicalDocument: patient.medicalDocument,
                    // Include sensitive data from IPFS
                    admitDate: ipfsData.admitDate,
                    medicalCondition: ipfsData.medicalCondition,
                    roomNumber: ipfsData.roomNumber,
                    assignedDoctor: ipfsData.assignedDoctor,
                    insuranceInformation: ipfsData.insuranceInformation,
                    profileimage: ipfsData.profileimage,
                    createdAt: patient.createdAt,
                    updatedAt: patient.updatedAt
                }
            });
        } catch (error) {
            console.error("Controller: Error in readpatientdataByName:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Error retrieving patient data"
            });
        }
    },
    readAllpatientdata: async (req, res) => {
        try {
            // Extract filters from query parameters
            const filters = {
                fullName: req.query.fullName
            };

            console.log('Received filters:', filters);

            // Get all patients data from service with filters
            const patientsData = await readAllpatientdata.readAllpatientdata(filters);

            // Format the response
            const formattedPatients = patientsData.map(({ patient, ipfsData }) => ({
                _id: patient._id,
                fullName: patient.fullName,
                email: patient.email,
                medicalDocument: patient.medicalDocument,
                // Include sensitive data from IPFS
                admitDate: ipfsData.admitDate,
                medicalCondition: ipfsData.medicalCondition,
                roomNumber: ipfsData.roomNumber,
                assignedDoctor: ipfsData.assignedDoctor,
                insuranceInformation: ipfsData.insuranceInformation,
                profileimage: ipfsData.profileimage,
                createdAt: patient.createdAt,
                updatedAt: patient.updatedAt
            }));

            return res.status(200).json({
                success: true,
                message: "All patients data retrieved successfully",
                count: formattedPatients.length,
                data: formattedPatients
            });
        } catch (error) {
            console.error("Controller: Error in readAllpatientdata:", error);
            
            // Handle specific error cases
            if (error.message === "No patients found") {
                return res.status(200).json({
                    success: true,
                    message: "No patients found with the given filters",
                    count: 0,
                    data: []
                });
            }

            return res.status(500).json({
                success: false,
                message: error.message || "Error retrieving patients data"
            });
        }
    },
    updatePatientData: async (req, res) => {
        try {
            const { fullName } = req.params;
            const updateData = req.body;

            // Validate input
            if (!fullName) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name is required"
                });
            }

            // Validate update data
            const allowedFields = ['age', 'gender', 'bloodGroup', 'medicalCondition', 'admitDate', 'assignedDoctor', 'roomNumber', 'contactNumber'];
            const updateFields = Object.keys(updateData);
            const invalidFields = updateFields.filter(field => !allowedFields.includes(field));

            if (invalidFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid fields: ${invalidFields.join(', ')}`
                });
            }

            // Update patient data
            const { patient, ipfsData } = await updatePatientService.updatePatientData(fullName, updateData);

            // Format response
            return res.status(200).json({
                success: true,
                message: "Patient data updated successfully",
                data: {
                    _id: patient._id,
                    fullName: patient.fullName,
                    email: patient.email,
                    admitDate: ipfsData.admitDate,
                    medicalCondition: ipfsData.medicalCondition,
                    roomNumber: ipfsData.roomNumber,
                    assignedDoctor: ipfsData.assignedDoctor,
                    bloodGroup: ipfsData.bloodGroup,
                    phoneNumber: ipfsData.phoneNumber,
                    updatedAt: patient.updatedAt
                }
            });
        } catch (error) {
            console.error("Controller: Error in updatePatientData:", error);
            return res.status(error.message === "Patient not found" ? 404 : 500).json({
                success: false,
                message: error.message || "Error updating patient data"
            });
        }
    },
    deletePatientData: async (req,res)=>{
        try {
            const { fullName } = req.params;
            const result = await deletePatientService.deletePatientData(fullName);
            return res.status(200).json(result);
        } catch (error) {
            console.error("Controller: Error in deletePatientData:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Error deleting patient data"
            });
        }
    }
};