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
const getPatientSensitiveData = require('../../services/patientSensitiveDataService');

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
                medicalDocument: req.file.path
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
                    email: patient.email,
                    ipfsCID: patient.ipfsCID,
                    ipfsIV: patient.ipfsIV,
                    createdAt: patient.createdAt,
                    updatedAt: patient.updatedAt
                }
            });

        } catch (error) {
            console.error("\n=== ERROR IN PATIENT SIGNUP ===", error.message);
            return res.status(error.message.includes("required") ? 400 : 500).json({
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
            let userRole = 'patient';

            const token = req.headers.authorization?.split(' ')[1] || 
                         req.cookies?.adminToken || 
                         req.cookies?.patientToken;

            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    userRole = decoded.role;
                } catch (error) {
                    console.log("Token verification failed, proceeding as patient");
                }
            }

            // Create patient data object
            const patientData = {
                fullName: req.body.fullName,
                email: req.body.email,
                medicalCondition: req.body.medicalCondition,
                admitDate: req.body.admitDate,
                medicalDocument: req.body.medicalDocument,
                roomNumber: req.body.roomNumber,
                assignedDoctor: req.body.assignedDoctor,
                medicalHistory: req.body.medicalHistory
            };

            // Validate and save patient
            const validatedData = await addpatientService.validatePatientData(patientData, userRole);
            const result = await addpatientService.savePatient(validatedData);

            return res.status(201).json(result);

        } catch (error) {
            console.error("\n=== ERROR IN ADD PATIENT ===", error.message);
            return res.status(error.message.includes("required") ? 400 : 500).json({
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

            // Format response with data from IPFS
            return res.status(200).json({
                success: true,
                message: "Patient data retrieved successfully",
                data: {
                    _id: patient._id,
                    fullName: patient.fullName,
                    email: patient.email,
                    // Include data from IPFS
                    admitDate: ipfsData.admitDate,
                    medicalCondition: ipfsData.medicalCondition,
                    roomNumber: ipfsData.roomNumber,
                    assignedDoctor: ipfsData.assignedDoctor,
                    medicalHistory: ipfsData.medicalHistory,
                    medicalDocument: ipfsData.medicalDocument,
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
            const filters = {
                fullName: req.query.fullName
            };
            
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;

            const result = await readAllpatientdata.readAllpatientdata(filters, page, limit);

            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.status(200).json({
                success: true,
                message: result.message,
                count: result.data.length,
                data: result.data,
                pagination: result.pagination
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

            if (!fullName) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name is required"
                });
            }

            // Validate update data - only allow specific fields
            const allowedFields = ['medicalCondition', 'roomNumber', 'assignedDoctor'];
            const updateFields = Object.keys(updateData);
            const invalidFields = updateFields.filter(field => !allowedFields.includes(field));

            if (invalidFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid fields: ${invalidFields.join(', ')}. Only medicalCondition, roomNumber, and assignedDoctor can be updated.`
                });
            }

            // Update patient data
            const { patient, ipfsData } = await updatePatientService.updatePatientData(fullName, updateData);

            // Format response with data from IPFS
            return res.status(200).json({
                success: true,
                message: "Patient data updated successfully",
                data: {
                    patientId: patient.patientId,
                    _id: patient._id,
                    fullName: patient.fullName,
                    email: patient.email,
                    ipfsCID: patient.ipfsCID,
                    ipfsIV: patient.ipfsIV,
                    version: patient.version,
                    medicalCondition: ipfsData.medicalCondition,
                    roomNumber: ipfsData.roomNumber,
                    assignedDoctor: ipfsData.assignedDoctor,
                    createdAt: patient.createdAt,
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
    },
    getPatientSensitiveData: async (req, res) => {
        try {
            const { cid } = req.params;

            if (!cid) {
                return res.status(400).json({
                    success: false,
                    message: "CID is required"
                });
            }

            // Get sensitive data from IPFS using only CID
            const result = await getPatientSensitiveData.getPatientSensitiveData(cid);

            return res.status(200).json({
                success: true,
                message: "Patient sensitive data retrieved successfully",
                data: result.data
            });

        } catch (error) {
            console.error("Error in getPatientSensitiveData:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Error retrieving patient sensitive data"
            });
        }
    },
    transferPatientByEmail: async (req, res) => {
        try {
            const { email } = req.params;
            const signupPatient = await patientSignup.findOne({ email });
            const existingAddPatient = await addpatientModel.findOne({ email });

            if (!signupPatient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found in signup collection"
                });
            }

            // If patient already exists in addpatientModel, return existing data
            if (existingAddPatient) {
                return res.status(200).json({
                    success: true,
                    message: "Patient already exists in addpatient collection",
                    data: existingAddPatient
                });
            }

            // Fields to keep in main document
            const publicFields = ['UUID', 'patientId', 'ipfsCID', 'ipfsIV', 'email', 'fullName'];
            
            // Prepare sensitive data (everything except public fields)
            const sensitiveData = {};
            const signupData = signupPatient.toObject();
            
            for (const key in signupData) {
                if (!publicFields.includes(key) && key !== '__v') {
                    sensitiveData[key] = signupData[key];
                }
            }

            // Encrypt sensitive data
            const encrypted = await encryptionService.encrypt(sensitiveData);

            // Get IPFS CID from signup patient if it exists
            const ipfsCID = signupPatient.ipfsCID || null;
            const ipfsIV = signupPatient.ipfsIV || encrypted.iv;

            // Create new patient document
            const newPatient = {
                UUID: signupPatient._id, // Keep the same UUID
                patientId: signupPatient._id, // Use signup _id as patientId
                fullName: signupPatient.fullName,
                email: signupPatient.email,
                contactNumber: signupPatient.contactNumber,
                specialization: signupPatient.specialization,
                ipfsCID: ipfsCID,
                ipfsIV: ipfsIV,
                sensitiveData: {
                    encryptedData: encrypted.encryptedData,
                    iv: encrypted.iv
                },
                version: 1 // Add version tracking
            };

            // Save to addpatientModel
            const savedPatient = await addpatientModel.create(newPatient);

            return res.status(200).json({
                success: true,
                message: "Patient data transferred successfully",
                data: {
                    ...savedPatient.toObject(),
                    sensitiveData: sensitiveData // Include decrypted sensitive data in response
                }
            });

        } catch (error) {
            console.error('Error in transferPatientByEmail:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },
    profileview: async (req, res) => {
        try {
            console.log('Profile View Request - User Data:', req.user);
            const { role, id } = req.user;
            let userData;
            let ipfsData;

            if (!id) {
                console.error('No user ID found in request');
                return res.status(401).json({
                    success: false,
                    message: "User ID not found in request"
                });
            }

            if (role === 'patient') {
                // Fetch patient data
                console.log('Fetching patient data for ID:', id);
                userData = await patientSignup.findById(id);
                
                if (!userData) {
                    console.log('Patient not found in patientSignup, trying addpatientModel');
                    userData = await addpatientModel.findById(id);
                }

                if (!userData) {
                    console.error('Patient not found in both collections');
                    return res.status(404).json({
                        success: false,
                        message: "Patient not found"
                    });
                }

                console.log('Found patient data:', userData);

                // Fetch IPFS data if CID exists
                if (userData.ipfsCID) {
                    try {
                        console.log('Fetching IPFS data for CID:', userData.ipfsCID);
                        ipfsData = await IPFSService.retrieveAndDecrypt(userData.ipfsCID, userData.ipfsIV);
                        console.log('IPFS data fetched:', ipfsData);
                    } catch (ipfsError) {
                        console.error('Error fetching IPFS data:', ipfsError);
                        // Continue without IPFS data
                        ipfsData = null;
                    }
                }

                // Get contact number from either model or IPFS data
                const contactNumber = userData.phoneNumber || 
                                    userData.contactNumber || 
                                    ipfsData?.contactNumber || 
                                    ipfsData?.phoneNumber;

                // Get date of birth from either model or IPFS data
                const dateOfBirth = userData.dateOfBirth || ipfsData?.dateOfBirth;

                return res.status(200).json({
                    success: true,
                    message: "Patient profile data fetched successfully",
                    data: {
                        fullName: userData.fullName,
                        age: dateOfBirth ? calculateAge(dateOfBirth) : null,
                        contact: contactNumber,
                        email: userData.email,
                        bloodGroup: ipfsData?.bloodGroup || null
                    }
                });
            } else if (role === 'doctor') {
                // Fetch doctor data
                console.log('Fetching doctor data for ID:', id);
                userData = await doctorSignup.findById(id);
                
                if (!userData) {
                    console.error('Doctor not found');
                    return res.status(404).json({
                        success: false,
                        message: "Doctor not found"
                    });
                }

                console.log('Found doctor data:', userData);

                // Fetch IPFS data if CID exists
                if (userData.ipfsCID) {
                    try {
                        console.log('Fetching IPFS data for CID:', userData.ipfsCID);
                        ipfsData = await IPFSService.retrieveAndDecrypt(userData.ipfsCID, userData.ipfsIV);
                        console.log('IPFS data fetched:', ipfsData);
                    } catch (ipfsError) {
                        console.error('Error fetching IPFS data:', ipfsError);
                        // Continue without IPFS data
                        ipfsData = null;
                    }
                }

                // Get contact number from either model or IPFS data
                const contactNumber = userData.phoneNumber || 
                                    userData.contactNumber || 
                                    ipfsData?.contactNumber || 
                                    ipfsData?.phoneNumber;

                // Get date of birth from either model or IPFS data
                const dateOfBirth = userData.dateOfBirth || ipfsData?.dateOfBirth;

                return res.status(200).json({
                    success: true,
                    message: "Doctor profile data fetched successfully",
                    data: {
                        fullName: userData.fullName,
                        age: dateOfBirth ? calculateAge(dateOfBirth) : null,
                        contact: contactNumber,
                        email: userData.email,
                        specialization: userData.specialization
                    }
                });
            } else {
                console.error('Invalid role:', role);
                return res.status(403).json({
                    success: false,
                    message: "Invalid role"
                });
            }
        } catch (error) {
            console.error("Error in profileview:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }
};
 
function calculateAge(dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}