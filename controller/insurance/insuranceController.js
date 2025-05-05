const express=require("express");
const router=express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Login = require("../../models/insurance/loginModel");
const Signup = require("../../models/insurance/signupModel");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const upload = require('../../utils/multer');
const InsurancePatient = require('../../models/insurance/insurancePatientModel');
const AddPatient = require('../../models/patient/addpatientModel');
const MedicalHistory = require('../../models/medicalHistory/medicalHistoryModel');

module.exports = {
    insuranceSignup: async (req, res) => {
        const { name, phone, email, password, companyName, role } = req.body;
        const image = req.file ? req.file.path : null;

        // Basic manual validation
        if (!name || !phone || !email || !password || !companyName || !role || !image) {
            return res.status(400).json({ message: "All fields are required" });
        }

        try {
            const existingUser = await Signup.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User already exists" });
            }
            if (password.length < 8) {
                return res.status(400).json({ message: "Password must be at least 8 characters long" });
            }
            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new Signup({
                name,
                phone,
                email,
                password: hashedPassword,
                companyName,
                role,
                image,
            });

            // Save user data in Signup model
            await newUser.save(); // Mongoose validation will run here

            res.status(201).json({ message: "Insurance registered successfully", Data: newUser });
        } catch (error) {
            console.error(error);

            // Handle Mongoose validation errors
            if (error.name === 'ValidationError') {
                const errors = {};
                for (let field in error.errors) {
                    errors[field] = error.errors[field].message;
                }
                return res.status(400).json({ message: "Validation error", errors });
            }

            // Handle any other errors
            res.status(500).json({ message: "Server error" });
        }
    },
  insuranceLogin: async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find user in Signup collection
        const user = await Signup.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Generate JWT token with role
        const token = jwt.sign(
            { 
                id: user._id,
                role: 'insurance', // Add role to token
                email: user.email
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Create or update login record
        const loginData = {
            email: user.email,
            password: user.password,
            token: token,
            userId: user._id
        };

        const existingLogin = await Login.findOne({ email: user.email });

        if (existingLogin) {
            // Update existing login record
            existingLogin.token = token;
            existingLogin.loginTime = new Date();
            await existingLogin.save();
        } else {
            // Create new login record
            const newLogin = new Login(loginData);
            await newLogin.save();
        }

        // Send success response
        res.status(200).json({ 
            message: "Login successful", 
            token, 
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                companyName: user.companyName,
                role: 'insurance' 
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "Server error: " + error.message });
    }
    },
    getPatientsWithMedicalHistory: async (req, res) => {
        try {
            // Get all medical history records with proper error handling
            const totalMedicalHistory = await MedicalHistory.countDocuments();
            const totalInsurancePatients = await InsurancePatient.countDocuments({ hasAccess: true });
            const medicalHistories = await MedicalHistory.find({})
                .populate({
                    path: 'patientId',
                    select: 'fullName email contactnumber',
                    model: 'AddPatient'
                })
                .populate({
                    path: 'doctorId',
                    select: 'fullName',
                    model: 'adddoctor'
                });

            if (!medicalHistories || medicalHistories.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: "No medical history records found",
                    data: []
                });
            }

            // Process and store in InsurancePatient collection
            for (const history of medicalHistories) {
                if (!history.patientId || !history.doctorId) {
                    console.log('Skipping record with missing patient or doctor:', history._id);
                    continue;
                }
               // Create patient data with default values for missing fields
                const patientData = {
                    patientId: history.patientId._id,
                    name: history.patientId.fullName || 'Unknown',
                    email: history.patientId.email || 'No email provided',
                    phone: history.patientId.contactnumber || 'No phone provided',
                    medicalHistory: [{
                        condition: history.condition || 'No condition specified',
                        notes: history.notes || 'No notes available',
                        date: history.date || new Date(),
                        doctorId: history.doctorId._id,
                        doctorName: history.doctorId.fullName || 'Unknown Doctor',
                        totalMedicalHistory,
                        totalInsurancePatients
                    }]
                };

                try {
                    // Check if patient already exists in InsurancePatient collection
                    let insurancePatient = await InsurancePatient.findOne({ patientId: history.patientId._id });

                    if (insurancePatient) {
                        // Update existing record
                        insurancePatient.medicalHistory.push(...patientData.medicalHistory);
                        await insurancePatient.save();
                    } else {
                        // Create new record
                        insurancePatient = new InsurancePatient(patientData);
                        await insurancePatient.save();
                    }
                } catch (error) {
                    console.log('Error processing patient record:', error.message);
                    continue; // Skip to next record if there's an error
                }
            }

            // Fetch all patients from InsurancePatient collection
            const patients = await InsurancePatient.find({})
                .select('name email phone medicalHistory isVerified hasAccess')
                .sort({ createdAt: -1 });

            // Format the response based on access rights
            const formattedPatients = patients.map(patient => {
                const basicInfo = {
                    _id: patient._id,
                    name: patient.name || 'Unknown',
                    email: patient.email || 'No email provided',
                    phone: patient.phone || 'No phone provided',
                    isVerified: patient.isVerified || false,
                    hasAccess: patient.hasAccess || false,
                };

                // If access is granted, include medical history
                if (patient.hasAccess) {
                    return {
                        ...basicInfo,
                        medicalHistory: patient.medicalHistory.map(history => ({
                            condition: history.condition || 'No condition specified',
                            notes: history.notes || 'No notes available',
                            date: history.date || new Date(),
                            doctorName: history.doctorName || 'Unknown Doctor'
                        }))
                    };
                }

                // If no access, only return basic info
                return basicInfo;
            });

            res.status(200).json({
                success: true,
                message: "Patients with medical history fetched successfully",
                totalMedicalHistory: totalMedicalHistory,
                totalInsurancePatients: totalInsurancePatients,
                data: formattedPatients
            });
        } catch (error) {
            console.log('Error fetching patients with medical history:', error.message);
            res.status(500).json({
                success: false,
                message: "Error fetching patients with medical history",
                error: error.message
            });
        }
    },
    requestAccess: async (req, res) => {
        try {
            const { patientName } = req.body;
            const insuranceId = req.user.id; // Get insurance ID from token

            if (!patientName) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name is required"
                });
            }

            // Find patient by name
            const patient = await AddPatient.findOne({ fullName: patientName });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Check if request already exists
            let insurancePatient = await InsurancePatient.findOne({
                patientId: patient._id,
                'accessRequest.insuranceId': insuranceId
            });

            if (insurancePatient) {
                if (insurancePatient.accessRequest.status === 'pending') {
                    return res.status(400).json({
                        success: false,
                        message: "Access request already pending"
                    });
                }
            } else {
                // Create new insurance patient record with all required fields
                insurancePatient = new InsurancePatient({
                    patientId: patient._id,
                    name: patient.fullName,
                    email: patient.email || 'No email provided',
                    phone: patient.contactnumber || 'No phone provided',
                    hasAccess: false,
                    accessRequest: {
                        insuranceId: insuranceId,
                        insuranceName: req.user.name,
                        requestDate: new Date(),
                        status: 'pending'
                    }
                });
            }

            await insurancePatient.save();

            res.status(200).json({
                success: true,
                message: "Access request created successfully",
                data: {
                    requestId: insurancePatient._id,
                    patientName: patient.fullName,
                    status: 'pending'
                }
            });
        } catch (error) {
            console.error('Error creating access request:', error);
            res.status(500).json({
                success: false,
                message: "Error creating access request",
                error: error.message
            });
        }
    },
    verifyPatient: async (req, res) => {
        try {
            const { patientName } = req.params;
            
            // Find patient by name
            const patient = await AddPatient.findOne({ fullName: patientName });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Check if access is granted
            const insurancePatient = await InsurancePatient.findOne({ 
                patientId: patient._id,
                hasAccess: true 
            });

            if (!insurancePatient) {
                return res.status(403).json({
                    success: false,
                    message: "Access not granted for this patient"
                });
            }

            // Update verification status
            insurancePatient.isVerified = true;
            await insurancePatient.save();

            res.status(200).json({
                success: true,
                message: "Patient verified successfully",
                data: {
                    patientName: patient.fullName,
                    isVerified: true
                }
            });
        } catch (error) {
            console.error('Error verifying patient:', error);
            res.status(500).json({
                success: false,
                message: "Error verifying patient",
                error: error.message
            });
        }
    },
    getPatientMedicalHistoryInsurance: async (req, res) => {
        try {
            const { patientName } = req.params;

            // Find patient by name
            const patient = await AddPatient.findOne({ fullName: patientName });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Check if access is granted
            const insurancePatient = await InsurancePatient.findOne({ 
                patientId: patient._id,
                hasAccess: true 
            });

            if (!insurancePatient) {
                return res.status(403).json({
                    success: false,
                    message: "Access not granted for this patient"
                });
            }

            // Get medical history with doctor details
            const medicalHistory = await MedicalHistory.find({ patientId: patient._id })
                .populate({
                    path: 'doctorId',
                    select: 'fullName',
                    model: 'adddoctor'
                })
                .sort({ date: -1 });

            // Format the response
            const formattedHistory = medicalHistory.map(record => ({
                patientName: patient.fullName || 'Unknown Patient',
                doctorName: record.doctorId?.fullName || 'Unknown Doctor',
                condition: record.condition || 'No condition specified',
                notes: record.notes || 'No notes available',
                date: record.date
            }));

            res.status(200).json({
                success: true,
                message: "Patient medical history retrieved successfully",
                data: formattedHistory
            });
        } catch (error) {
            console.error('Error fetching patient medical history:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching patient medical history",
                error: error.message
            });
        }
    },
    handleAccessRequest: async (req, res) => {
        try {
            const { patientName, insuranceName, action } = req.body;
            
            if (!patientName || !insuranceName || !action) {
                return res.status(400).json({
                    success: false,
                    message: "Patient name, insurance name, and action are required"
                });
            }

            // Find patient by name
            const patient = await AddPatient.findOne({ fullName: patientName });
            if (!patient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Find insurance patient record
            const insurancePatient = await InsurancePatient.findOne({ 
                patientId: patient._id,
                'accessRequest.insuranceName': insuranceName,
                'accessRequest.status': 'pending'
            });

            if (!insurancePatient) {
                return res.status(404).json({
                    success: false,
                    message: "No pending access request found"
                });
            }

            // Update based on admin action
            if (action === 'approve') {
                insurancePatient.hasAccess = true;
                insurancePatient.accessRequest.status = 'approved';
                insurancePatient.accessRequest.approvalDate = new Date();
                insurancePatient.accessRequest.approvedBy = req.user.id; // admin's ID
            } else if (action === 'deny') {
                insurancePatient.hasAccess = false;
                insurancePatient.accessRequest.status = 'denied';
                insurancePatient.accessRequest.denialDate = new Date();
                insurancePatient.accessRequest.deniedBy = req.user.id; // admin's ID
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid action. Use 'approve' or 'deny'"
                });
            }

            await insurancePatient.save();

            res.status(200).json({
                success: true,
                message: `Access request ${action}ed successfully`,
                data: {
                    patientName,
                    insuranceName,
                    status: insurancePatient.accessRequest.status,
                    actionDate: action === 'approve' ? insurancePatient.accessRequest.approvalDate : insurancePatient.accessRequest.denialDate
                }
            });
        } catch (error) {
            console.error('Error handling access request:', error);
            res.status(500).json({
                success: false,
                message: "Error handling access request",
                error: error.message
            });
        }
    },
    getPendingAccessRequests: async (req, res) => {
        try {
            const pendingRequests = await InsurancePatient.find({
                'accessRequest.status': 'pending'
            }).select('patientId patientName accessRequest');

            const formattedRequests = await Promise.all(pendingRequests.map(async (request) => {
                const patient = await AddPatient.findById(request.patientId);
                return {
                    patientName: patient.fullName,
                    insuranceName: request.accessRequest.insuranceName,
                    requestDate: request.accessRequest.requestDate,
                    status: request.accessRequest.status
                };
            }));

            res.status(200).json({
                success: true,
                message: "Pending access requests retrieved successfully",
                data: formattedRequests
            });
        } catch (error) {
            console.error('Error fetching pending requests:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching pending requests",
                error: error.message
            });
        }
    }
}