const express = require('express');
const { adminSignupService, adminLoginService } = require('../../services/adminservice');
const adminSignupModel = require('../../models/admin/adminSignupModel');
const patientSignupModel = require("../../models/patient/signupModel")
const doctorSignupModel = require("../../models/doctor/signupModel");
const addpatientModel = require("../../models/patient/addpatientModel");
const adddoctorModel = require("../../models/doctor/adddoctorModel");
const appointmentModel = require("../../models/appointment/appointmentModel");
const IPFSService = require('../../services/ipfsService');

// const adminLoginModel = require('../models/admin/adminloginModel');

module.exports = {
    adminSignup: async (req, res) => {
        try {
            // Validate and create admin using service
            const validatedData = await adminSignupService.validateAdminData(req.body);
            const savedAdmin = await adminSignupService.createAdmin(validatedData);

            // Return success response
            return res.status(201).json({
                success: true,
                message: "Admin registered successfully",
                data: {
                    _id: savedAdmin._id,
                    fullName: savedAdmin.fullName,
                    email: savedAdmin.email,
                    hospitalName: savedAdmin.hospitalName,
                    totalHospitals: savedAdmin.totalHospitals,
                    totalBeds: savedAdmin.totalBeds,
                    staffInformation: savedAdmin.staffInformation
                }
            });

        } catch (error) {
            console.error("\n=== ERROR IN ADMIN SIGNUP ===", error);
            
            // Handle validation errors
            if (error.name === 'ValidationError') {
                const validationErrors = Object.values(error.errors).map(err => err.message);
                return res.status(400).json({
                    success: false,
                    message: "Validation failed",
                    errors: validationErrors
                });
            }

            // Handle other errors
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },
    adminLogin: async (req, res) => {
        try {
            // Validate login using service
            const { admin, token } = await adminLoginService.validateLogin(
                req.body.email,
                req.body.password
            );

            if (!token) {
                throw new Error("Token generation failed");
            }

            // Set cookie
            res.cookie('adminToken', token, {
                expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            // Return success response with token
            return res.status(200).json({
                success: true,
                message: "Admin login successful",
                data: {
                    _id: admin._id,
                    email: admin.email,
                    token: token // Ensure token is included in response
                }
            });

        } catch (error) {
            console.error("\n=== ERROR IN ADMIN LOGIN ===", error);
            
            // Handle authentication errors
            if (error.message.includes("Invalid") || error.message.includes("required")) {
                return res.status(401).json({
                    success: false,
                    message: error.message
                });
            }

            // Handle other errors
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },
    getAdminData: async (req, res) => {
        try {
            // Get admin ID from token
            const adminId = req.user?.id;
            
            if (!adminId) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized: No admin ID found in token"
                });
            }

            // Find admin data
            const admin = await adminSignupModel.findById(adminId);
            if (!admin) {
                return res.status(404).json({
                    success: false,
                    message: "Admin not found"
                });
            }

            const totalpatients = await patientSignupModel.countDocuments();
            const totaldoctors = await doctorSignupModel.countDocuments();
            const newPatients = await addpatientModel.countDocuments();
            const newDoctors = await adddoctorModel.countDocuments();
            const totalappointments = await appointmentModel.countDocuments();

            // Get latest confirmed appointments
            const latestConfirmedAppointments = await appointmentModel.find({ status: "confirm" })
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName')
                .sort({ createdAt: -1 })
                .limit(1);

            // Get latest pending appointments
            const latestPendingAppointments = await appointmentModel.find({ status: "pending" })
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName')
                .sort({ createdAt: -1 })
                .limit(1);

            // Format appointments
            const formattedConfirmedAppointments = latestConfirmedAppointments.map(appointment => ({
                _id: appointment._id,
                doctor: {
                    name: appointment.doctorId?.fullName || 'N/A',
                    specialization: appointment.doctorId?.specialization || 'N/A'
                },
                patient: {
                    name: appointment.patientId?.fullName || 'N/A'
                },
                appointmentDate: appointment.appointmentDate,
                appointmentTime: appointment.appointmentTime,
                status: appointment.status
            }));

            const formattedPendingAppointments = latestPendingAppointments.map(appointment => ({
                _id: appointment._id,
                doctor: {
                    name: appointment.doctorId?.fullName || 'N/A',
                    specialization: appointment.doctorId?.specialization || 'N/A'
                },
                patient: {
                    name: appointment.patientId?.fullName || 'N/A'
                },
                appointmentDate: appointment.appointmentDate,
                appointmentTime: appointment.appointmentTime,
                status: appointment.status
            }));

            // Calculate total staff as a number
            const totalStaff = Number(admin.staffInformation.nurses) +
                Number(admin.staffInformation.receptionists) +
                Number(admin.staffInformation.otherStaff);

            // Return admin data with raw numbers
            return res.status(200).json({
                success: true,
                message: "Admin data fetched successfully",
                data: {
                    _id: admin._id,
                    fullName: admin.fullName,
                    email: admin.email,
                    hospitalName: admin.hospitalName,
                    totalHospitals: Number(admin.totalHospitals),
                    totalBeds: Number(admin.totalBeds),
                    totalAppointments: totalappointments,
                    totalPatients: totalpatients,
                    totalDoctors: totaldoctors,
                    newPatients: newPatients,
                    newDoctors: newDoctors,
                    staffInformation: {
                        nurses: Number(admin.staffInformation.nurses),
                        receptionists: Number(admin.staffInformation.receptionists),
                        otherStaff: Number(admin.staffInformation.otherStaff),
                        totalStaff: totalStaff
                    },
                    latestConfirmedAppointments: formattedConfirmedAppointments,
                    latestPendingAppointments: formattedPendingAppointments,
                    createdAt: admin.createdAt,
                    updatedAt: admin.updatedAt
                }
            });

        } catch (error) {
            console.log("Error fetching admin data:", error.message);
            
            // Handle specific error cases
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: "Invalid token"
                });
            }

            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: "Token expired"
                });
            }

            // Handle other errors
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message
            });
        }
    },
    fetchdataConfirmedAppointments: async (req, res) => {
        try {
            const { search, page = 1 } = req.query;
            const limit = 5; // 5 rows per page
            const skip = (page - 1) * limit;
            
            let query = { status: "confirm" };
            
            // First find all confirmed appointments
            const confirmedAppointments = await appointmentModel.find(query)
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName');
            
            if(!confirmedAppointments || confirmedAppointments.length === 0){
                return res.status(404).json({
                    success: false,
                    message: "No confirmed appointments found"
                });
            }

            // Filter the results based on search term
            let filteredAppointments = confirmedAppointments;
            
            if(search) {
                const searchTerm = search.toLowerCase();
                filteredAppointments = filteredAppointments.filter(appointment => 
                    appointment.doctorId?.fullName?.toLowerCase().includes(searchTerm) ||
                    appointment.patientId?.fullName?.toLowerCase().includes(searchTerm)
                );
            }

            if(filteredAppointments.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No matching appointments found"
                });
            }

            // Apply pagination
            const totalAppointments = filteredAppointments.length;
            const totalPages = Math.ceil(totalAppointments / limit);
            const paginatedAppointments = filteredAppointments.slice(skip, skip + limit);

            const formattedAppointments = paginatedAppointments.map(appointment => ({
                _id: appointment._id,
                doctorId: {
                    fullName: appointment.doctorId?.fullName || 'N/A',
                    specialization: appointment.doctorId?.specialization || 'N/A'
                },
                patientId: {
                    fullName: appointment.patientId?.fullName || 'N/A'
                },
                appointmentDate: appointment.appointmentDate,
                appointmentTime: appointment.appointmentTime,
                status: appointment.status || 'Confirmed'
            }));

            return res.status(200).json({
                success: true,
                data: formattedAppointments,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalAppointments,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            });
        } catch (error) {
            console.log("error", error.message);
            return res.status(500).json({
                success: false,
                message: "Internal server error" || error.message
            });
        }
    },
    fetchdataPendingAppointments: async (req, res) => {
        try {
            const { search, page = 1 } = req.query;
            const limit = 5; // 5 rows per page
            const skip = (page - 1) * limit;
            
            let query = { status: "pending" };
            
            // First find all pending appointments
            const pendingAppointments = await appointmentModel.find(query)
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName');
            
            if(!pendingAppointments || pendingAppointments.length === 0){
                return res.status(404).json({
                    success: false,
                    message: "No pending appointments found"
                });
            }

            // Filter the results based on search term
            let filteredAppointments = pendingAppointments;
            
            if(search) {
                const searchTerm = search.toLowerCase();
                filteredAppointments = filteredAppointments.filter(appointment => 
                    appointment.doctorId?.fullName?.toLowerCase().includes(searchTerm) ||
                    appointment.patientId?.fullName?.toLowerCase().includes(searchTerm)
                );
            }

            if(filteredAppointments.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No matching appointments found"
                });
            }

            // Apply pagination
            const totalAppointments = filteredAppointments.length;
            const totalPages = Math.ceil(totalAppointments / limit);
            const paginatedAppointments = filteredAppointments.slice(skip, skip + limit);

            const formattedAppointments = paginatedAppointments.map(appointment => ({
                _id: appointment._id,
                doctorId: {
                    fullName: appointment.doctorId?.fullName || 'N/A',
                    specialization: appointment.doctorId?.specialization || 'N/A'
                },
                patientId: {
                    fullName: appointment.patientId?.fullName || 'N/A'
                },
                appointmentDate: appointment.appointmentDate,
                appointmentTime: appointment.appointmentTime,
                status: appointment.status || 'Pending'
            }));

            return res.status(200).json({
                success: true,
                data: formattedAppointments,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalAppointments,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            });
        } catch (error) {
            console.log("error", error.message);
            return res.status(500).json({
                success: false,
                message: "Internal server error" || error.message
            });
        }
    },
    updateAppointmentStatus: async (req, res) => {
        try {
            const { appointmentId } = req.params;
            const { status } = req.body;

            // Validate status
            if (!['pending', 'confirm'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid status. Must be either 'pending' or 'confirm'"
                });
            }

            // Find and update the appointment
            const updatedAppointment = await appointmentModel.findByIdAndUpdate(
                appointmentId,
                { status },
                { new: true }
            ).populate('doctorId', 'fullName specialization')
             .populate('patientId', 'fullName');

            if (!updatedAppointment) {
                return res.status(404).json({
                    success: false,
                    message: "Appointment not found"
                });
            }

            return res.status(200).json({
                success: true,
                message: "Appointment status updated successfully",
                data: {
                    _id: updatedAppointment._id,
                    doctorId: {
                        fullName: updatedAppointment.doctorId?.fullName || 'N/A',
                        specialization: updatedAppointment.doctorId?.specialization || 'N/A'
                    },
                    patientId: {
                        fullName: updatedAppointment.patientId?.fullName || 'N/A'
                    },
                    appointmentDate: updatedAppointment.appointmentDate,
                    appointmentTime: updatedAppointment.appointmentTime,
                    status: updatedAppointment.status
                }
            });
        } catch (error) {
            console.log("error", error.message);
            return res.status(500).json({
                success: false,
                message: "Internal server error" || error.message
            });
        }
    },
    transferSignupData: async (req, res) => {
        try {
            const { doctorEmail, patientEmail } = req.body;

            // First check if doctor already exists in adddoctor collection
            const existingDoctor = await adddoctorModel.findOne({ email: doctorEmail });
            
            if (existingDoctor) {
                return res.status(400).json({
                    success: false,
                    message: 'Doctor already exists in Add Doctor collection'
                });
            }

            // If doctor doesn't exist, proceed with transfer logic
            if (doctorEmail) {
                // First check if doctor exists in signup collection
                const doctor = await doctorSignupModel.findOne({ email: doctorEmail });
                if (!doctor) {
                    return res.status(404).json({
                        success: false,
                        message: "Doctor not found in signup collection"
                    });
                }

                // Create new doctor in adddoctor collection
                const newDoctor = await adddoctorModel.create({
                    fullName: doctor.fullName,
                    specialization: doctor.specialization || "General Medicine",
                    department: doctor.specialization || "General Medicine",
                    experience: 0,
                    availability: doctor.availability || "Mon-Fri",
                    contactnumber: "1234567890",
                    email: doctor.email,
                    password: doctor.password || "defaultPassword123",
                    address: doctor.address || "Not provided",
                    qualification: doctor.qualification || "MBBS",
                    bio: doctor.bio || "No bio provided",
                    profileImage: doctor.profileImage
                });

                if (!newDoctor) {
                    return res.status(500).json({
                        success: false,
                        message: "Failed to create doctor in adddoctor collection"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Doctor transferred successfully",
                    data: {
                        doctor: {
                            email: newDoctor.email,
                            fullName: newDoctor.fullName,
                            specialization: newDoctor.specialization
                        }
                    }
                });
            }

            // If specific patient email is provided, transfer that patient
            if (patientEmail) {
                const patient = await patientSignupModel.findOne({ email: patientEmail });
                if (!patient) {
                    return res.status(404).json({
                        success: false,
                        message: "Patient not found in signup collection"
                    });
                }

                const existingPatient = await addpatientModel.findOne({ email: patientEmail });
                if (existingPatient) {
                    return res.status(400).json({
                        success: false,
                        message: "Patient already exists in addpatient collection"
                    });
                }

                // Get a default doctor for assignment
                const defaultDoctor = await adddoctorModel.findOne({});

                // Create new patient in addpatient collection
                await addpatientModel.create({
                    fullName: patient.fullName,
                    age: patient.age,
                    gender: patient.gender,
                    contactnumber: patient.contactnumber,
                    email: patient.email,
                    address: patient.address,
                    medicalHistory: patient.medicalHistory || "No medical history provided",
                    ipfsIV: "defaultIV",
                    ipfsCID: "defaultCID",
                    assignedDoctor: defaultDoctor?._id || "defaultDoctorId",
                    roomNumber: "101",
                    medicalDocument: "defaultDocument",
                    admitDate: new Date(),
                    medicalCondition: "Under Observation"
                });

                return res.status(200).json({
                    success: true,
                    message: "Patient transferred successfully",
                    data: {
                        patient: {
                            email: patient.email,
                            fullName: patient.fullName
                        }
                    }
                });
            }

        } catch (error) {
            console.error("Error transferring data:", error);
            return res.status(500).json({
                success: false,
                message: "Internal server error",
                error: error.message
            });
        }
    },
    transferPatientSignup: async (req, res) => {
        try {
            const { patientEmail } = req.body;

            // Find patient in signup collection
            const signupPatient = await patientSignupModel.findOne({ email: patientEmail });
            if (!signupPatient) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found in signup records"
                });
            }

            // Check if patient already exists in addpatient collection
            const existingPatient = await addpatientModel.findOne({ email: patientEmail });
            if (existingPatient) {
                return res.status(400).json({
                    success: false,
                    message: "Patient already exists in hospital records"
                });
            }

            // Get sensitive data from IPFS
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                signupPatient.ipfsCID,
                signupPatient.ipfsIV
            );

            // Create new patient record with default values
            const newPatient = new addpatientModel({
                fullName: signupPatient.fullName,
                email: signupPatient.email,
                medicalCondition: "Initial checkup required",
                admitDate: new Date(),
                medicalDocument: sensitiveData.medicalDocument || "Initial documentation pending",
                roomNumber: 0, // Default room number
                assignedDoctor: "To be assigned",
                medicalHistory: sensitiveData.medicalHistory || "No prior history",
                insuranceInformation: "Pending",
                ipfsCID: signupPatient.ipfsCID,
                ipfsIV: signupPatient.ipfsIV,
                gender: signupPatient.gender,
                dateOfBirth: signupPatient.dateOfBirth
            });

            await newPatient.save();

            return res.status(200).json({
                success: true,
                message: "Patient transferred successfully",
                data: newPatient
            });

        } catch (error) {
            console.error("Error in transferPatientSignup:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Error transferring patient"
            });
        }
    },
};
