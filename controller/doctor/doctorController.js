const express = require('express');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../../models/doctor/signupModel');
const doctorLogin = require('../../models/doctor/loginModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const appointmentModel = require('../../models/appointment/appointmentModel');
const { doctorSignupService, doctorLoginService, createdDoctor, doctorManagementService, getDoctorDashboardData } = require('../../services/doctorservice');
const encryptionService = require('../../utils/encryptdecrypt');
const IPFSService = require('../../services/ipfsService');
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
            console.log('Pagination params:', { page, limit, skip });

            // Build query
            let query = {};
            if (filters.specialization) {
                query.specialization = { $regex: new RegExp(filters.specialization, 'i') };
            }
            if (filters.fullName) {
                query.fullName = { $regex: new RegExp(filters.fullName, 'i') };
            }

            // Count total matching docs
            const totalCount = await adddoctorModel.countDocuments(query);
            console.log('Total count of matching doctors:', totalCount);

            // Fetch all doctor data including IPFS references
            const doctors = await adddoctorModel.find(query)
                .select('profileimage fullName specialization experience availability contactnumber email qualification address bio ipfsCID ipfsIV')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            console.log('Raw doctors data from DB:', doctors);

            if (doctors.length === 0) {
                console.log('No doctors found with the given filters');
                return res.status(200).json({
                    success: true,
                    message: "No doctors found with the given filters",
                    data: [],
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    page
                });
            }

            // Process each doctor and get missing data from IPFS if needed
            const processedDoctors = await Promise.all(doctors.map(async (doctor) => {
                try {
                    // Check if important fields are missing
                    const needsIPFSData = !doctor.specialization || !doctor.contactnumber || doctor.experience === undefined;
                    
                    if (needsIPFSData && doctor.ipfsCID && doctor.ipfsIV) {
                        console.log(`Retrieving IPFS data for doctor: ${doctor.fullName}`);
                        
                        try {
                            const ipfsData = await IPFSService.retrieveAndDecrypt(
                                doctor.ipfsCID,
                                doctor.ipfsIV
                            );
                            
                            // Merge IPFS data with existing data
                            return {
                                _id: doctor._id,
                                fullName: doctor.fullName,
                                email: doctor.email,
                                specialization: doctor.specialization || ipfsData.specialization || 'Not Available',
                                experience: doctor.experience !== undefined ? doctor.experience : (ipfsData.yearsOfExperience || 0),
                                availability: doctor.availability || 'Available',
                                contactnumber: doctor.contactnumber || ipfsData.contactNumber || 'Not Available',
                                qualification: doctor.qualification || ipfsData.qualification || 'MBBS',
                                address: doctor.address || ipfsData.address || 'Not provided',
                                bio: doctor.bio || ipfsData.bio || '',
                                profileimage: doctor.profileimage || ipfsData.profileimage || ''
                            };
                        } catch (ipfsError) {
                            console.error(`Error retrieving IPFS data for doctor ${doctor._id}:`, ipfsError);
                            // Return with default values if IPFS fails
                            return {
                                _id: doctor._id,
                                fullName: doctor.fullName,
                                email: doctor.email,
                                specialization: doctor.specialization || 'Not Available',
                                experience: doctor.experience !== undefined ? doctor.experience : 0,
                                availability: doctor.availability || 'Available',
                                contactnumber: doctor.contactnumber || 'Not Available',
                                qualification: doctor.qualification || 'MBBS',
                                address: doctor.address || 'Not provided',
                                bio: doctor.bio || '',
                                profileimage: doctor.profileimage || ''
                            };
                        }
                    } else {
                        // Doctor has all required data in MongoDB
                        return {
                            _id: doctor._id,
                            fullName: doctor.fullName,
                            email: doctor.email,
                            specialization: doctor.specialization || 'Not Available',
                            experience: doctor.experience !== undefined ? doctor.experience : 0,
                            availability: doctor.availability || 'Available',
                            contactnumber: doctor.contactnumber || 'Not Available',
                            qualification: doctor.qualification || 'MBBS',
                            address: doctor.address || 'Not provided',
                            bio: doctor.bio || '',
                            profileimage: doctor.profileimage || ''
                        };
                    }
                } catch (error) {
                    console.error(`Error processing doctor ${doctor._id}:`, error);
                    return {
                        _id: doctor._id,
                        fullName: doctor.fullName,
                        email: doctor.email,
                        specialization: 'Error Loading',
                        experience: 0,
                        availability: 'Available',
                        contactnumber: 'Error Loading',
                        qualification: 'Error Loading',
                        address: 'Error Loading',
                        bio: 'Error Loading',
                        profileimage: ''
                    };
                }
            }));

            return res.status(200).json({
                success: true,
                message: "Doctors fetched successfully",
                count: processedDoctors.length,
                data: processedDoctors,
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
            const existingAddDoctor = await adddoctorModel.findOne({ email });

            if (!signupDoctor) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found in signup collection"
                });
            }

            // If doctor already exists in adddoctorModel, return existing data
            if (existingAddDoctor) {
                return res.status(200).json({
                    success: true,
                    message: "Doctor already exists in adddoctor collection",
                    data: existingAddDoctor
                });
            }

            // Get sensitive data from IPFS
            let sensitiveData = {};
            if (signupDoctor.ipfsCID && signupDoctor.ipfsIV) {
                try {
                    sensitiveData = await IPFSService.retrieveAndDecrypt(
                        signupDoctor.ipfsCID,
                        signupDoctor.ipfsIV
                    );
                    console.log('Retrieved IPFS data:', sensitiveData); // Debug log
                } catch (error) {
                    console.error('Error retrieving IPFS data:', error);
                }
            }

            // Create new doctor document with data from both signup and IPFS
            const newDoctor = {
                UUID: signupDoctor._id,
                doctorId: signupDoctor._id,
                fullName: signupDoctor.fullName,
                email: signupDoctor.email,
                // Extract these important fields from IPFS data and store in main document
                specialization: sensitiveData.specialization || "NA",
                experience: sensitiveData.yearsOfExperience || 0,
                contactnumber: sensitiveData.contactNumber || "",
                // Set default values for other required fields
                availability: "Available",
                qualification: sensitiveData.qualification || "MBBS",
                address: sensitiveData.address || "Not provided",
                bio: "",
                profileimage: "",
                ipfsCID: signupDoctor.ipfsCID,
                ipfsIV: signupDoctor.ipfsIV,
                patients: [],
                appointments: []
            };

            // Save to adddoctorModel
            const savedDoctor = await adddoctorModel.create(newDoctor);

            return res.status(200).json({
                success: true,
                message: "Doctor data transferred successfully",
                data: savedDoctor
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
//profileimage, fullname,specalization,experience,avaiability,contactnumber,email,rating,patientsin numbers. and about(bio).

