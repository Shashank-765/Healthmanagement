const express = require('express');
const { patientSignupService, patientLoginService, addpatientService, readpatientdataByName, readAllpatientdata, updatePatientService, deletePatientService, createAppointment, patientService } = require('../../services/patientservices');
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
            const { email, password } = req.body;

            // Login validate karo
            const { patient, sensitiveData, token } = await patientLoginService.validateLogin(email, password);

            // Login data save karo
            const loginData = {
                email: patient.email,
                password: sensitiveData.password,
                token: token,
                lastLogin: new Date()
            };

            // Login record update karo
            const savedLogin = await patientLogin.findOneAndUpdate(
                { email: patient.email },
                loginData,
                { upsert: true, new: true }
            );

            // Response bhejo
            res.status(200).json({
                statusCode: 200,
                message: "Patient login successful",
                data: {
                    _id: patient._id,
                    email: patient.email,
                    token: savedLogin.token
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
            let userRole = 'patient'; // Default role

            // Check for token (optional now)
            const token = req.headers.authorization?.split(' ')[1] || 
                         req.cookies?.adminToken || 
                         req.cookies?.patientToken;

            // If token exists, verify it to get role
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    userRole = decoded.role;
                    console.log("Token verified, user role:", userRole);
                } catch (error) {
                    console.log("Token verification failed, proceeding as patient");
                }
            }

            console.log("Processing request with role:", userRole);

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
                // profileimage: req.file.path // Use the uploaded file path
            };

            // Add profile image if uploaded
            if (req.file) {
                patientData.profileimage = req.file.path;
            }

            console.log("Validating patient data...");
            // Validate and create patient with user role
            const validatedData = await addpatientService.validatePatientData(patientData, userRole);
            console.log("Data validated, saving patient...");
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

            // Handle token errors - but don't return 401 since token is optional
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                console.log("Token error, proceeding as regular patient");
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
            const result = await readAllpatientdata.readAllpatientdata(filters);

            // Check if the operation was successful
            if (!result.success) {
                return res.status(400).json(result);
            }

            // Return the result directly since it's already formatted in the service
            return res.status(200).json({
                success: true,
                message: result.message,
                count: result.data.length,
                data: result.data
            });

        } catch (error) {
            console.error("Controller: Error in readAllpatientdata:", error);
            
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
    },
    assignPrimaryDoctor: async (req, res) => {
        try {
            const { patientId, doctorId } = req.body;
            
            const result = await patientService.addPrimaryDoctor(patientId, doctorId);
            
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    }, 
    getPatientDashboard: async (req, res) => {
        try {
            const patientId = req.user.id;
            const dashboardData = await patientService.getPatientDashboardData(patientId);

            res.status(200).json({
                success: true,
                message: "Patient dashboard data fetched successfully",
                data: dashboardData
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch dashboard data"
            });
        }
    }
};