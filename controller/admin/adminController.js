const express = require('express');
const { adminSignupService, adminLoginService } = require('../../services/adminservice');
const adminSignupModel = require('../../models/admin/adminSignupModel');
const patientSignupModel = require("../../models/patient/signupModel")
const doctorSignupModel = require("../../models/doctor/signupModel");
const addpatientModel = require("../../models/patient/addpatientModel");
const adddoctorModel = require("../../models/doctor/adddoctorModel");
const appointmentModel = require("../../models/appointment/appointmentModel");
const IPFSService = require('../../services/ipfsService');
const InsurancePatient = require('../../models/insurance/insurancePatientModel');
const AddPatient = require('../../models/patient/addpatientModel');
const MedicalHistory = require('../../models/medicalHistory/medicalHistoryModel');
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

            // Return success response with token
            return res.status(200).json({
                success: true,
                message: "Admin login successful",
                data: {
                    _id: admin._id,
                    email: admin.email,
                    role: 'admin', // Add role explicitly
                    token: token
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
    // Get all pending access requests
    getInsuranceAccessRequests: async (req, res) => {
        try {
            // Find all insurance patient records with pending access requests
            const pendingRequests = await InsurancePatient.find({
                'accessRequest.status': 'pending'
            }).populate('patientId', 'fullName email contactnumber');

            // Format the response
            const formattedRequests = pendingRequests.map(request => ({
                requestId: request._id,
                patientDetails: {
                    _id: request.patientId._id,
                    name: request.patientId.fullName,
                    email: request.patientId.email,
                    phone: request.patientId.contactnumber
                },
                insuranceDetails: {
                    name: request.accessRequest.insuranceName,
                    requestDate: request.accessRequest.requestDate
                },
                status: request.accessRequest.status
            }));

            res.status(200).json({
                success: true,
                message: "Access requests retrieved successfully",
                data: formattedRequests
            });
        } catch (error) {
            console.error('Error fetching access requests:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching access requests",
                error: error.message
            });
        }
    },

    // Handle access request (approve/deny)
    handleInsuranceRequest: async (req, res) => {
        try {
            const { requestId, action } = req.body;

            // Validate required fields
            if (!requestId) {
                return res.status(400).json({
                    success: false,
                    message: "Request ID is required"
                });
            }

            if (!action || !['approve', 'deny'].includes(action)) {
                return res.status(400).json({
                    success: false,
                    message: "Valid action (approve/deny) is required"
                });
            }

            // Find the insurance patient record
            const insurancePatient = await InsurancePatient.findById(requestId);
            if (!insurancePatient) {
                return res.status(404).json({
                    success: false,
                    message: "Access request not found"
                });
            }

            // Update the access request status
            insurancePatient.accessRequest.status = action === 'approve' ? 'approved' : 'denied';
            insurancePatient.hasAccess = action === 'approve';
            insurancePatient.accessRequest.processedDate = new Date();

            await insurancePatient.save();

            res.status(200).json({
                success: true,
                message: `Access request ${action}d successfully`,
                data: {
                    requestId: insurancePatient._id,
                    status: insurancePatient.accessRequest.status,
                    hasAccess: insurancePatient.hasAccess
                }
            });
        } catch (error) {
            console.error('Error handling insurance request:', error);
            res.status(500).json({
                success: false,
                message: "Error handling insurance request",
                error: error.message
            });
        }
    },

    // Get all processed requests (approved/denied)
    getProcessedAccessRequests: async (req, res) => {
        try {
            const processedRequests = await InsurancePatient.find({
                'accessRequest.status': { $in: ['approved', 'denied'] }
            }).populate('patientId', 'fullName email contactnumber')
              .populate('accessRequest.insuranceId', 'name email companyName')
              .populate('accessRequest.approvedBy', 'name')
              .populate('accessRequest.deniedBy', 'name');

            const formattedRequests = processedRequests.map(request => ({
                requestId: request._id,
                patientDetails: {
                    name: request.patientId.fullName,
                    email: request.patientId.email,
                    phone: request.patientId.contactnumber
                },
                insuranceDetails: {
                    name: request.accessRequest.insuranceName,
                    companyName: request.accessRequest.insuranceId.companyName,
                    email: request.accessRequest.insuranceId.email
                },
                requestDate: request.accessRequest.requestDate,
                status: request.accessRequest.status,
                processedBy: request.accessRequest.status === 'approved' 
                    ? request.accessRequest.approvedBy.name 
                    : request.accessRequest.deniedBy.name,
                processedDate: request.accessRequest.status === 'approved'
                    ? request.accessRequest.approvalDate
                    : request.accessRequest.denialDate
            }));

            res.status(200).json({
                success: true,
                message: "Processed requests retrieved successfully",
                data: formattedRequests
            });
        } catch (error) {
            console.error('Error fetching processed requests:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching processed requests",
                error: error.message
            });
        }
    },

    // Get all patients with basic information who have medical history
    getAllPatientsforAdmin: async (req, res) => {
        try {
            // First get all medical history records
            const medicalHistories = await MedicalHistory.find({})
                .populate({
                    path: 'patientId',
                    select: 'fullName email contactnumber',
                    model: 'AddPatient'
                });

            // Create a map to store unique patients
            const patientsMap = new Map();

            // Process each medical history record
            medicalHistories.forEach(history => {
                if (history.patientId) {
                    const patientId = history.patientId._id.toString();
                    if (!patientsMap.has(patientId)) {
                        patientsMap.set(patientId, {
                            _id: history.patientId._id,
                            name: history.patientId.fullName,
                            email: history.patientId.email,
                            phone: history.patientId.contactnumber
                        });
                    }
                }
            });

            // Convert map to array and sort by name
            const formattedPatients = Array.from(patientsMap.values())
                .sort((a, b) => a.name.localeCompare(b.name));

            res.status(200).json({
                success: true,
                message: "Patients with medical history retrieved successfully",
                data: formattedPatients
            });
        } catch (error) {
            console.error('Error fetching patients:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching patients",
                error: error.message
            });
        }
    },

    // Get medical history for a specific patient
    getPatientMedicalHistoryAdmin: async (req, res) => {
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

            // Get medical history with doctor details
            const medicalHistory = await MedicalHistory.find({ patientId: patient._id })
                .populate({
                    path: 'doctorId',
                    select: 'fullName',
                    model: 'adddoctor'
                })
                .sort({ date: -1 });

            // Format the response with null checks
            const formattedHistory = medicalHistory.map(record => ({
                doctorName: record.doctorId?.fullName || 'Unknown Doctor',
                condition: record.condition || 'No condition specified',
                notes: record.notes || 'No notes available',
                date: record.date || new Date()
            }));

            res.status(200).json({
                success: true,
                message: "Patient medical history retrieved successfully",
                data: {
                    patientName: patient.fullName,
                    medicalHistory: formattedHistory
                }
            });
        } catch (error) {
            console.error('Error fetching patient medical history:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching patient medical history",
                error: error.message
            });
        }
    }
};
