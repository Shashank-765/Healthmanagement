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
const jwt = require('jsonwebtoken');
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
                    email: savedAdmin.email,
                    ipfsCID: savedAdmin.ipfsCID,
                    ipfsIV: savedAdmin.ipfsIV
                }
            });

        } catch (error) {
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
            const { admin, adminData, token } = await adminLoginService.validateLogin(
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

            // Get IPFS data if CID exists
            let ipfsData = {};
            if (admin.ipfsCID && admin.ipfsIV) {
                try {
                    console.log('Fetching IPFS data for admin:', admin.ipfsCID);
                    ipfsData = await IPFSService.retrieveAndDecrypt(admin.ipfsCID, admin.ipfsIV);
                    console.log('IPFS data fetched:', ipfsData);
                } catch (ipfsError) {
                    console.error('Error fetching IPFS data:', ipfsError);
                    // Continue with default values if IPFS fetch fails
                }
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

            // Get staff information from IPFS data with fallbacks
            const staffInfo = {
                nurses: Number(ipfsData?.staffInformation?.nurses || ipfsData?.nurses || admin.staffInformation?.nurses || 0),
                receptionists: Number(ipfsData?.staffInformation?.receptionists || ipfsData?.receptionists || admin.staffInformation?.receptionists || 0),
                otherStaff: Number(ipfsData?.staffInformation?.otherStaff || ipfsData?.otherStaff || admin.staffInformation?.otherStaff || 0)
            };

            // Calculate total staff
            const totalStaff = staffInfo.nurses + staffInfo.receptionists + staffInfo.otherStaff;

            // Return admin data with IPFS data
            return res.status(200).json({
                success: true,
                message: "Admin data fetched successfully",
                data: {
                    _id: admin._id,
                    fullName: admin.fullName,
                    email: admin.email,
                    hospitalName: ipfsData?.hospitalName || admin.hospitalName,
                    totalHospitals: Number(ipfsData?.totalHospitals || admin.totalHospitals || 0),
                    totalBeds: Number(ipfsData?.totalBeds || admin.totalBeds || 0),
                    totalAppointments: totalappointments,
                    totalPatients: totalpatients,
                    totalDoctors: totaldoctors,
                    newPatients: newPatients,
                    newDoctors: newDoctors,
                    staffInformation: {
                        nurses: staffInfo.nurses,
                        receptionists: staffInfo.receptionists,
                        otherStaff: staffInfo.otherStaff,
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
            const limit = 10; // 50 rows per page
            const skip = (page - 1) * limit;
            
            // Find appointments with status "confirm" directly from MongoDB
            const appointments = await appointmentModel.find({ status: "confirm" })
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName');
            
            if(!appointments || appointments.length === 0){
                return res.status(404).json({
                    success: false,
                    message: "No confirmed appointments found"
                });
            }

            // Filter the results based on search term
            let filteredAppointments = appointments;
            
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
                status: appointment.status
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
            const limit = 10; // 10 rows per page
            const skip = (page - 1) * limit;
            
            // First find all appointments
            const appointments = await appointmentModel.find()
                .populate('doctorId', 'fullName specialization')
                .populate('patientId', 'fullName');
            
            if(!appointments || appointments.length === 0){
                return res.status(404).json({
                    success: false,
                    message: "No appointments found"
                });
            }

            // Process appointments to get status from IPFS
            const processedAppointments = await Promise.all(appointments.map(async (appointment) => {
                let status = 'pending'; // default status
                
                // Try to get status from IPFS if available
                if (appointment.ipfsCID && appointment.ipfsIV) {
                    try {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(
                            appointment.ipfsCID,
                            appointment.ipfsIV
                        );
                        status = ipfsData.status || 'pending';
                    } catch (error) {
                        console.error(`Error retrieving IPFS data for appointment ${appointment._id}:`, error);
                        // Keep default status if IPFS retrieval fails
                    }
                }

                return {
                    ...appointment.toObject(),
                    status: status
                };
            }));

            // Filter pending appointments
            let pendingAppointments = processedAppointments.filter(app => app.status === "pending");
            
            if(pendingAppointments.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No pending appointments found"
                });
            }

            // Apply search filter if provided
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

            // Format the appointments
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
                status: appointment.status
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
                    _id: request.patientId ? request.patientId._id : null,
                    name: request.patientId ? request.patientId.fullName : 'Unknown',
                    email: request.patientId ? request.patientId.email : 'Unknown',
                    phone: request.patientId ? request.patientId.contactnumber : 'Unknown'
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
                    select: 'fullName email contactnumber ipfsCID ipfsIV',
                    model: 'AddPatient'
                });
            
            if (!medicalHistories || medicalHistories.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No medical histories found"
                });
            }
            
            // Create a map to store unique patients
            const patientsMap = new Map();

            // Process each medical history record
            for (const history of medicalHistories) {
                if (history.patientId) {
                    const patientId = history.patientId._id.toString();
                    
                    // Initialize patient data if not exists
                    if (!patientsMap.has(patientId)) {
                        let contactNumber = 'Not Available';
                        
                        // Try to get contact number from MongoDB first
                        if (history.patientId.contactnumber) {
                            contactNumber = history.patientId.contactnumber;
                        } 
                        // If not available in MongoDB, get from IPFS
                        else if (history.patientId.ipfsCID && history.patientId.ipfsIV) {
                            try {
                                const ipfsData = await IPFSService.retrieveAndDecrypt(
                                    history.patientId.ipfsCID,
                                    history.patientId.ipfsIV
                                );
                                
                                // Get contact number from IPFS
                                contactNumber = ipfsData.contactNumber || 
                                             ipfsData.phoneNumber || 
                                             ipfsData.contactnumber || 
                                             'Not Available';
                            } catch (error) {
                                console.error(`Error retrieving IPFS data for patient ${patientId}:`, error);
                                contactNumber = 'Error Loading';
                            }
                        }

                        patientsMap.set(patientId, {
                            _id: history.patientId._id,
                            name: history.patientId.fullName,
                            email: history.patientId.email,
                            phone: contactNumber,
                            medicalHistory: [] // Add medical history array
                        });
                    }

                    // Now fetch notes and condition from medical history IPFS
                    const patient = patientsMap.get(patientId);
                    let condition = 'No condition specified';
                    let notes = 'No notes available';

                    // Try to get condition and notes from medical history IPFS
                    if (history.ipfsCID && history.ipfsIV) { 
                        try {
                            const medicalIPFSData = await IPFSService.retrieveAndDecrypt(
                                history.ipfsCID,
                                history.ipfsIV
                            );
                            
                            condition = medicalIPFSData.condition || 'No condition in IPFS';
                            notes = medicalIPFSData.notes || 'No notes in IPFS';
                        } catch (error) {
                            console.error(`Error retrieving medical IPFS data for history ${history._id}:`, error);
                            condition = history.condition || 'IPFS error - no MongoDB condition';
                            notes = history.notes || 'IPFS error - no MongoDB notes';
                        }
                    } else {
                        condition = history.condition || 'No condition specified';
                        notes = history.notes || 'No notes available';
                    }

                    // Add medical history to patient
                    patient.medicalHistory.push({
                        _id: history._id,
                        condition: condition,
                        notes: notes,
                        date: history.date || new Date(),
                        doctorName: history.doctorName || 'Unknown Doctor'
                    });
                }
            }

            // Convert map to array and sort by name
            const formattedPatients = Array.from(patientsMap.values())
                .sort((a, b) => a.name.localeCompare(b.name));
                
            if (formattedPatients.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "No patients with medical history found"
                });
            }

            res.status(200).json({
                success: true,
                message: "Patients with medical history retrieved successfully",
                data: formattedPatients
            });
        } catch (error) {
            console.error("Error in getAllPatientsforAdmin:", error);
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
            // Get medical history with doctor details
            const medicalHistory = await MedicalHistory.find({ patientId: patient._id })
                .populate({
                    path: 'doctorId',
                    select: 'fullName',
                    model: 'adddoctor'
                })
                .sort({ date: -1 });
            if (!medicalHistory || medicalHistory.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: "No medical history found for this patient",
                    data: { patientName: patient.fullName, medicalHistory: [] }
                });
            }

            // Process each medical history record to get IPFS data
            const formattedHistory = await Promise.all(medicalHistory.map(async (record) => {
                let condition = 'No condition specified';
                let notes = 'No notes available';
                let fileInfo = null;

                // Try to get condition and notes from IPFS
                if (record.ipfsCID && record.ipfsIV) {
                    
                    try {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(
                            record.ipfsCID,
                            record.ipfsIV
                        );
                        
                        condition = ipfsData.condition || 'No condition in IPFS';
                        notes = ipfsData.notes || 'No notes in IPFS';
                        
                        // Add file information if it exists in IPFS data
                        if (ipfsData.file) {
                            fileInfo = {
                                originalName: ipfsData.file.originalName,
                                mimeType: ipfsData.file.mimeType,
                                size: ipfsData.file.size
                            };
                        }
                    } catch (ipfsError) {
                            // Fallback to MongoDB data if available
                        condition = record.condition || 'IPFS error - no MongoDB condition';
                        notes = record.notes || 'IPFS error - no MongoDB notes';
                    }
                } else {
                    // Use MongoDB data if available
                    condition = record.condition || 'No condition specified';
                    notes = record.notes || 'No notes available';
                }

                return {
                    _id: record._id,
                    doctorName: record.doctorId?.fullName || 'Self',
                    condition: condition,
                    notes: notes,
                    date: record.date || new Date(),
                    createdAt: record.createdAt,
                    updatedAt: record.updatedAt,
                    fileInfo: fileInfo, // Include file information in the response
                    ipfsData: {
                        cid: record.ipfsCID,
                        iv: record.ipfsIV
                    }
                };
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
            console.error(' Error fetching patient medical history:', error);
            res.status(500).json({
                success: false,
                message: "Error fetching patient medical history",
                error: error.message
            });
        }
    },
    syncMedicalHistoryData: async (req, res) => {
        try {
            // Get all medical history records with proper error handling
            const medicalHistories = await MedicalHistory.find({})
                .populate({
                    path: 'patientId',
                    select: 'fullName email contactnumber ipfsCID ipfsIV',
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
                    message: "No medical history records found to sync",
                });
            }

            let processedCount = 0;
            let skippedCount = 0;

            // Process and store in InsurancePatient collection
            for (const history of medicalHistories) {
                if (!history.patientId || !history.doctorId) {
                    skippedCount++;
                    continue;
                }
                
                // Get contact number with IPFS fallback
                let contactNumber = history.patientId.contactnumber || 'Not Available';
                
                // Try IPFS if contactnumber not available in MongoDB
                if (!contactNumber && history.patientId.ipfsCID && history.patientId.ipfsIV) {
                    try {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(
                            history.patientId.ipfsCID,
                            history.patientId.ipfsIV
                        );
                        
                        // Get contact number from IPFS
                        contactNumber = ipfsData.contactNumber || 
                                     ipfsData.phoneNumber || 
                                     ipfsData.contactnumber || 
                                     'Not Available';
                    } catch (error) {
                        console.error(`Error retrieving IPFS data for patient ${history.patientId._id}:`, error);
                    }
                }
                
                // Create patient data with default values for missing fields
                const patientData = {
                    patientId: history.patientId._id,
                    name: history.patientId.fullName || 'Unknown',
                    email: history.patientId.email || 'No email provided',
                    phone: contactNumber,
                    medicalHistory: [{
                        condition: history.condition || 'No condition specified',
                        notes: history.notes || 'No notes available',
                        date: history.date || new Date(),
                        doctorId: history.doctorId._id,
                        doctorName: history.doctorId.fullName || 'Unknown Doctor'
                    }]
                };

                try {
                    // Check if patient already exists in InsurancePatient collection
                    let insurancePatient = await InsurancePatient.findOne({ patientId: history.patientId._id });

                    if (insurancePatient) {
                        // Update contact info if needed
                        if (contactNumber && contactNumber !== 'Not Available' && 
                            (!insurancePatient.phone || insurancePatient.phone === 'Not Available' || 
                             insurancePatient.phone === 'No phone provided')) {
                            insurancePatient.phone = contactNumber;
                        }
                        
                        // Check if this medical history is already included
                        const historyExists = insurancePatient.medicalHistory.some(
                            h => h.doctorId && 
                                 h.doctorId.equals(history.doctorId._id) && 
                                 new Date(h.date).toDateString() === new Date(history.date).toDateString()
                        );

                        if (!historyExists) {
                            // Only add if not already exists
                            insurancePatient.medicalHistory.push(...patientData.medicalHistory);
                            await insurancePatient.save();
                            processedCount++;
                        }
                    } else {
                        // Create new record
                        insurancePatient = new InsurancePatient(patientData);
                        await insurancePatient.save();
                        processedCount++;
                    }
                } catch (error) {
                    console.log('Error processing patient record:', error.message);
                    skippedCount++;
                    continue; // Skip to next record if there's an error
                }
            }

            res.status(200).json({
                success: true,
                message: "Medical history sync completed",
                stats: {
                    totalRecords: medicalHistories.length,
                    processedCount,
                    skippedCount
                }
            });
        } catch (error) {
            console.log('Error syncing medical history data:', error.message);
            res.status(500).json({
                success: false,
                message: "Error syncing medical history data",
                error: error.message
            });
        }
    },
    getPatientsWithMedicalHistory: async (req, res) => {
        try {
            console.log("Fetching patients with medical history...");
            
            // Instead of processing all medical histories each time, just fetch the already processed data
            const patients = await InsurancePatient.find({})
                .select('patientId name email phone medicalHistory isVerified hasAccess accessRequest')
                .populate({
                    path: 'patientId',
                    select: 'fullName email contactnumber ipfsCID ipfsIV',
                    model: 'AddPatient'
                })
                .sort({ createdAt: -1 });
            
            const totalMedicalHistory = await MedicalHistory.countDocuments();
            const totalInsurancePatients = await InsurancePatient.countDocuments({ hasAccess: true });
            
            // Format the response based on access rights
            const formattedPatients = await Promise.all(patients.map(async patient => {
                // Get contact number from multiple sources
                let contactNumber = patient.phone || 'Not Available';
                if (patient.patientId && patient.patientId.contactnumber) {
                    contactNumber = patient.patientId.contactnumber;
                } 
                // If not available in MongoDB, get from IPFS
                else if (patient.patientId && patient.patientId.ipfsCID && patient.patientId.ipfsIV) {
                    try {
                        const ipfsData = await IPFSService.retrieveAndDecrypt(
                            patient.patientId.ipfsCID,
                            patient.patientId.ipfsIV
                        );
                        
                        // Get contact number from IPFS with various possible field names
                        contactNumber = ipfsData.contactNumber || 
                                     ipfsData.phoneNumber || 
                                     ipfsData.contactnumber || 
                                     ipfsData.phone ||
                                     contactNumber;
                    } catch (error) {
                        console.error(`Error retrieving IPFS data for patient:`, error);
                        // Keep the original contact number if IPFS fails
                    }
                }

                const basicInfo = {
                    _id: patient._id,
                    name: patient.name || (patient.patientId ? patient.patientId.fullName : 'Unknown'),
                    email: patient.email || (patient.patientId ? patient.patientId.email : 'No email provided'),
                    phone: contactNumber,
                    isVerified: patient.isVerified || false,
                    hasAccess: patient.hasAccess || false,
                    requestPending: patient.accessRequest && patient.accessRequest.status === 'pending'
                };

                // If access is granted, include medical history
                if (patient.hasAccess) {
                    return {
                        ...basicInfo,
                        medicalHistory: patient.medicalHistory && patient.medicalHistory.length > 0 ? 
                            patient.medicalHistory.map(history => ({
                                condition: history.condition || 'No condition specified',
                                notes: history.notes || 'No notes available',
                                date: history.date || new Date(),
                                doctorName: history.doctorName || 'Unknown Doctor'
                            })) : []
                    };
                }

                // If no access, only return basic info
                return basicInfo;
            }));

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
    }
};
