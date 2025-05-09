const express = require('express');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../../models/doctor/signupModel');
const doctorLogin = require('../../models/doctor/loginModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const appointmentModel = require('../../models/appointment/appointmentModel');
const { doctorSignupService, doctorLoginService, createdDoctor, doctorManagementService, getDoctorDashboardData } = require('../../services/doctorservice');
const fs = require('fs');
const jwt = require('jsonwebtoken');

module.exports = {
    doctorSignup: async (req, res) => {
        try {
            // Handle file upload if present
            let fileInfo = null;
            if (req.file) {
                fileInfo = {
                    filename: req.file.filename,
                    path: req.file.path,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                };
                req.body.medicalDocument = req.file.path;
            }

            // Process and validate data
            if (req.body.dateOfBirth) {
                req.body.dateOfBirth = new Date(req.body.dateOfBirth);
            }
            if (req.body.yearsOfExperience) {
                req.body.yearsOfExperience = Number(req.body.yearsOfExperience);
            }

            // Validate and process doctor data
            const validatedData = await doctorSignupService.validateDoctorData(req.body);
            
            // Create doctor with sensitive data in IPFS
            const doctor = await doctorSignupService.createDoctor(validatedData);

            // Send success response with only non-sensitive data
            res.status(201).json({
                statusCode: 201,
                message: "Doctor signup successful",
                data: {
                    _id: doctor._id,
                    fullName: doctor.fullName,
                    email: doctor.email,
                    ipfsCID: doctor.ipfsCID,
                    ipfsIV: doctor.ipfsIV,
                    createdAt: doctor.createdAt,
                    updatedAt: doctor.updatedAt
                }
            });

        } catch (error) {
            // Clean up uploaded file if there was an error
            if (req.file) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (err) {
                    console.error("Error deleting file:", err);
                }
            }

            const statusCode = error.message.includes("required") || 
                             error.message.includes("exists") || 
                             error.message.includes("valid") ? 400 : 500;

            res.status(statusCode).json({
                statusCode,
                message: error.message || "Internal server error"
            });
        }
    },

    doctorLogin: async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    statusCode: 400,
                    message: "Please provide both email and password"
                });
            }

            // Validate login credentials
            const doctor = await doctorLoginService.validateLogin(email, password);
            
            // Generate token
            const token = jwt.sign(
                { 
                    id: doctor._id,
                    role: 'doctor'
                },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            // Create or update login record
            const loginData = {
                email: doctor.email,
                token: token,
                lastLogin: new Date()
            };

            await doctorLogin.findOneAndUpdate(
                { email: doctor.email },
                loginData,
                { upsert: true, new: true }
            );

            // Send success response
            res.status(200).json({
                statusCode: 200,
                message: "Doctor login successful",
                data: {
                    _id: doctor._id,
                    fullName: doctor.fullName,
                    email: doctor.email,
                    specialization: doctor.specialization,
                    isProfileComplete: doctor.isProfileComplete,
                    token
                }
            });

        } catch (error) {
            console.error('Doctor login error:', error);
            const statusCode = error.message.includes("Invalid") ? 401 : 500;
            res.status(statusCode).json({
                statusCode,
                message: error.message || "Internal server error"
            });
        }
    },
    createDoctor: async (req, res) => {
        try {
            // Get token from header
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: "No token provided"
                });
            }

            // Verify token and get user role
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userRole = decoded.role;

            const doctorData = req.body;
            
            // Handle file upload if present
            let fileInfo = null;
            if (req.file) {
                fileInfo = {
                    filename: req.file.filename,
                    path: req.file.path,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                };
                doctorData.profileimage = req.file.path;
            }
            
            // Validate and process data using service with user role
            const validatedData = await createdDoctor.validateDoctorData(doctorData, userRole);
            const newDoctor = await createdDoctor.saveDoctor(validatedData);

            return res.status(201).json({
                success: true,
                message: "Doctor created successfully",
                data: {
                    doctor: newDoctor,
                    fileInfo
                }
            });
        } catch (error) {
            // Clean up uploaded file if there was an error
            if (req.file) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (err) {
                    console.error("Error deleting file:", err);
                }
            }

            console.log("Error in createDoctor:", error);
            
            // Handle specific error cases
            let statusCode = 500;
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                statusCode = 401;
            } else if (error.message.includes("must be signed up first")) {
                statusCode = 403;
            } else if (error.message.includes("already exists") || 
                      error.message.includes("Missing required fields") ||
                      error.message.includes("10 digits")) {
                statusCode = 400;
            }

            return res.status(statusCode).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    getDoctors: async (req, res) => {
        try {
            const filters = {
                specialization: req.query.specialization,
                fullName: req.query.fullName
            };

            // Pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            console.log('Received filters:', filters);

            // Count total matching docs
            const totalCount = await adddoctorModel.countDocuments({
                ...(filters.specialization ? { specialization: { $regex: new RegExp(filters.specialization, 'i') } } : {}),
                ...(filters.fullName ? { fullName: { $regex: new RegExp(filters.fullName, 'i') } } : {})
            });

            // Fetch paginated docs
            const doctors = await adddoctorModel.find({
                ...(filters.specialization ? { specialization: { $regex: new RegExp(filters.specialization, 'i') } } : {}),
                ...(filters.fullName ? { fullName: { $regex: new RegExp(filters.fullName, 'i') } } : {})
            })
                .select('profileimage fullName specialization experience availability contactnumber email qualification address bio')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            if (doctors.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: "No doctors found with the given filters",
                    data: [],
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    page
                });
            }

            return res.status(200).json({
                success: true,
                message: "Doctors fetched successfully",
                count: doctors.length,
                data: doctors,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                page
            });
        } catch (error) {
            console.error('Error in getDoctors controller:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    updateDoctor: async (req, res) => {
        try {
            const { email } = req.params;
            const updateData = req.body;
            delete updateData.email; // Prevent email change
            let fileInfo = null;

            // Handle file upload if present
            if (req.file) {
                fileInfo = {
                    filename: req.file.filename,
                    path: req.file.path,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                };
                updateData.profileimage = req.file.path;
            }

            const updatedDoctor = await doctorManagementService.updateDoctor(email, updateData);

            return res.status(200).json({
                success: true,
                message: "Doctor updated successfully",
                data: {
                    doctor: updatedDoctor,
                    fileInfo
                }
            });
        } catch (error) {
            // Clean up uploaded file if there was an error
            if (req.file) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch (err) {
                    console.error("Error deleting file:", err);
                }
            }

            console.error('Error in updateDoctor controller:', error);
            const statusCode = error.message.includes("not found") ? 404 : 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    deleteDoctor: async (req, res) => {
        try {
            const { email } = req.params;
            const deletedDoctor = await adddoctorModel.findOneAndDelete({ email: email.toLowerCase().trim() });

            // Delete profile image if exists
            if (deletedDoctor.profileimage) {
                try {
                    fs.unlinkSync(deletedDoctor.profileimage);
                } catch (err) {
                    console.error("Error deleting profile image:", err);
                }
            }

            return res.status(200).json({
                success: true,
                message: "Doctor deleted successfully"
            });
        } catch (error) {
            console.error('Error in deleteDoctor controller:', error);
            const statusCode = error.message.includes("not found") ? 404 : 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    assignPatientToDoctor: async (req, res) => {
        try {
            const { doctorId, patientId } = req.body;
            
            const result = await doctorManagementService.addPatientToDoctor(doctorId, patientId);
            
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    getDoctorDashboard: async (req, res) => {
        try {
            // Get doctor email from params or user (token)
            const doctorEmail = req.params.doctorEmail || req.user?.email;

            // Check if doctorEmail is provided
            if (!doctorEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Doctor email is required"
                });
            }

            // Try to find doctor in adddoctorModel
            let doctor = await adddoctorModel.findOne({ email: doctorEmail.toLowerCase().trim() });
            if (!doctor) {
                // If not found, try to find in signup
                const signupDoctor = await doctorSignup.findOne({ email: doctorEmail.toLowerCase().trim() });
                if (signupDoctor) {
                    // Prepare data for adddoctorModel (map fields as needed)
                    const addDoctorData = {
                        fullName: signupDoctor.fullName,
                        email: signupDoctor.email,
                        specialization: signupDoctor.specialization,
                        experience: signupDoctor.yearsOfExperience,
                        availability: "Available",
                        contactnumber: signupDoctor.contactNumber,
                        qualification: "MBBS",
                        address: "Not provided",
                        bio: "",
                        profileimage: "",
                        // Add other fields as needed
                    };
                    await adddoctorModel.create(addDoctorData);
                    // Now fetch the doctor again from adddoctorModel
                    doctor = await adddoctorModel.findOne({ email: doctorEmail.toLowerCase().trim() });
                } else {
                    return res.status(404).json({
                        success: false,
                        message: "Doctor not found in signup"
                    });
                }
            }

            // Fetch dashboard data by email
            const dashboardData = await getDoctorDashboardData(doctorEmail || req.user.email);
            res.status(200).json(dashboardData);
        } catch (error) {
            console.error('Error in getDoctorDashboard:', error);
            // Handle specific MongoDB ObjectId casting error
            if (error.name === 'CastError' && error.kind === 'ObjectId') {
                return res.status(400).json({
                    success: false,
                    message: "Invalid doctor email format"
                });
            }
            res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    addAppointmentToDoctor: async (req, res) => {
        try {
            const { doctorId, appointmentId } = req.body;
            
            const result = await doctorManagementService.addAppointmentToDoctor(doctorId, appointmentId);
            
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    },

    readDoctorsByEmail: async (req, res) => {
        try {
            const { email } = req.params;

            // First check in signup collection
            const signupDoctor = await doctorSignup.findOne({ email });
            
            // Then check in adddoctor collection
            const addDoctor = await adddoctorModel.findOne({ email });

            if (!signupDoctor && !addDoctor) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found in any collection"
                });
            }

            // Return the doctor data
            return res.status(200).json({
                success: true,
                data: signupDoctor || addDoctor
            });
        } catch (error) {
            console.error('Error in readDoctorsByEmail:', error);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }
};


// add :- fullname,specialization,experience,avaiability,contactnumber,email,password,qualification,address,bio,profileimage
// read on :- what to show, profileimage, fullname, specialization, experience, avaiability, contactnumber, email
//schedule appointment:- profileimage, fullname(doctor), specialization, prefered date and perfered time, full name (patient),phonenumber(patient),email address and reason for visit both patient.
//doctor view profile:- profileimage, fullname,specalization,experience,avaiability,contactnumber,email,rating,patientsin numbers. and about(bio).

