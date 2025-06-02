const express = require('express');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../../models/doctor/signupModel');
const doctorLogin = require('../../models/doctor/loginModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const appointmentModel = require('../../models/appointment/appointmentModel');
const notificationModel = require('../../models/notification/notificationModel');
const pusher = require('../../utils/pusher');
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

           const filters = { fullName: newDoctor.fullName };
            const doctors = await doctorManagementService.getDoctors(filters);
            const createdDoctorWithIPFSData = doctors.length > 0 ? doctors[0] : newDoctor;

            return res.status(201).json({
                success: true,
                message: "Doctor created successfully",
                data: {
                    doctor: createdDoctorWithIPFSData,
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
            console.log('Starting getDoctors controller');
            const filters = {
                specialization: req.query.specialization,
                fullName: req.query.fullName
            };

            // Pagination
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            // Get total count for pagination
            const totalCount = await adddoctorModel.countDocuments({
                ...(filters.specialization && { specialization: { $regex: new RegExp(filters.specialization, 'i') } }),
                ...(filters.fullName && { fullName: { $regex: new RegExp(filters.fullName, 'i') } })
            });

            // Get doctors with pagination
            const doctors = await doctorManagementService.getDoctors(filters);

            // Apply pagination to the results
            const paginatedDoctors = doctors.slice(skip, skip + limit);

            console.log(`Returning ${paginatedDoctors.length} doctors for page ${page}`);

            return res.status(200).json({
                success: true,
                message: "Doctors fetched successfully",
                count: paginatedDoctors.length,
                data: paginatedDoctors,
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
            
            console.log('Update request for email:', email);
            console.log('Update data:', updateData);

            // Call the service with the email and update data
            const updatedDoctor = await doctorManagementService.updateDoctor(email, updateData);

            return res.status(200).json({
                success: true,
                message: "Doctor updated successfully",
                data: updatedDoctor
            });

        } catch (error) {
            console.error('Error in updateDoctor controller:', error);
            return res.status(404).json({
                success: false,
                message: error.message || "Doctor not found"
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

            // Get specialization from IPFS
            let specialization = 'Not Available';
            if (signupDoctor.ipfsCID && signupDoctor.ipfsIV) {
                try {
                    const ipfsResponse = await IPFSService.retrieveAndDecrypt(
                        signupDoctor.ipfsCID,
                        signupDoctor.ipfsIV
                    );
                    const ipfsSpecialization = ipfsResponse.sensitiveData?.specialization || ipfsResponse.specialization;
                    if (ipfsSpecialization) {
                        const validSpecializations = [
                            'Cardiologist',
                            'Neurologist',
                            'Dermatologist',
                            'General Medicine',
                            'Orthopedics'
                        ];
                        if (validSpecializations.includes(ipfsSpecialization)) {
                            specialization = ipfsSpecialization;
                        }
                    }
                } catch (ipfsError) {
                    console.error(`Error retrieving IPFS data for doctor ${signupDoctor._id}:`, ipfsError);
                }
            }

            // If doctor already exists, update only minimal fields
            if (existingAddDoctor) {

                const updateObj = {
                    doctorId: signupDoctor._id,
                    fullName: signupDoctor.fullName,
                    specialization: specialization,
                    ipfsCID: signupDoctor.ipfsCID || existingAddDoctor.ipfsCID,
                    ipfsIV: signupDoctor.ipfsIV || existingAddDoctor.ipfsIV,
                    email: signupDoctor.email,
                    updatedAt: new Date()
                };

                const updatedDoctor = await adddoctorModel.findOneAndUpdate(
                    { email: email },
                    updateObj,
                    { new: true }
                );

                return res.status(200).json({
                    success: true,
                    message: "Doctor data updated successfully",
                    data: updatedDoctor
                });
            }

            const newDoctor = {
                _id: signupDoctor._id,
                doctorId: signupDoctor._id,
                fullName: signupDoctor.fullName,
                specialization: specialization,
                ipfsCID: signupDoctor.ipfsCID || null,
                ipfsIV: signupDoctor.ipfsIV || null,
                email: signupDoctor.email
            };

            const savedDoctor = await adddoctorModel.create(newDoctor);
            return res.status(200).json({
                success: true,
                message: "Doctor data transferred successfully",
                data: savedDoctor
            });

        } catch (error) {
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },
    rateDoctor: async (req, res) => {
        try {
            console.log('[RATE_DOCTOR] Starting rate doctor process');
            const { doctorName, rating, comment } = req.body;
            const patient_id = req.user && req.user.id;

            console.log('[RATE_DOCTOR] Request data:', {
                doctorName,
                rating,
                patient_id,
                user: req.user
            });

            if (!doctorName || !rating || !patient_id) {
                console.log('[RATE_DOCTOR] Missing required fields:', {
                    doctorName: !!doctorName,
                    rating: !!rating,
                    patient_id: !!patient_id
                });
                return res.status(400).json({
                    success: false,
                    message: "doctorName, rating, and patient_id are required"
                });
            }

            // Find doctor by name (case-insensitive, and ideally unique)
            const doctor = await adddoctorModel.findOne({ fullName: doctorName });
            console.log('[RATE_DOCTOR] Found doctor:', {
                found: !!doctor,
                doctorId: doctor?._id,
                doctorName: doctor?.fullName,
                doctorEmail: doctor?.email
            });

            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }

            const doctorId = doctor._id;
            const ratingExist = doctor.ratings.some(r => r.patient_id?.toString() === patient_id.toString());

            console.log('[RATE_DOCTOR] Checking existing rating:', {
                ratingExists: ratingExist,
                patient_id,
                doctorRatings: doctor.ratings.length
            });

            if (ratingExist) {
                return res.status(400).json({
                    success: false,
                    message: "You have already rated this doctor"
                });
            }

            const ratingObj = {
                rating: Number(rating),
                comment: comment || "",
                date: new Date(),
                patient_id
            };

            console.log('[RATE_DOCTOR] Creating rating object:', ratingObj);

            const ipfsResult = await IPFSService.uploadEncryptedData(ratingObj);
            console.log('[RATE_DOCTOR] IPFS upload result:', {
                success: !!ipfsResult,
                cid: ipfsResult?.cid
            });

            if (!ipfsResult || !ipfsResult.cid) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload rating to IPFS"
                });
            }

            const ratingRef = {
                ipfsCID: ipfsResult.cid,
                ipfsIV: ipfsResult.iv || "",
                patient_id: patient_id,
            };

            console.log('[RATE_DOCTOR] Updating doctor with new rating');

            const updatedDoctor = await adddoctorModel.findByIdAndUpdate(
                doctorId,
                { $push: { ratings: ratingRef } },
                { new: true, runValidators: true }
            );

            console.log('[RATE_DOCTOR] Doctor updated with new rating:', {
                success: !!updatedDoctor,
                doctorId: updatedDoctor?._id
            });

            if (!updatedDoctor) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }

            // Create notification for the doctor about the new review
            try {
                console.log('[RATE_DOCTOR] Starting notification creation');
                console.log('[RATE_DOCTOR] Notification details:', {
                    recipientId: doctor.fullName,
                    recipientModel: 'Doctor',
                    patientId: patient_id,
                    rating: rating
                });

                // First check if notification model is properly imported
                if (!notificationModel) {
                    console.error('[RATE_DOCTOR] Notification model not found');
                    throw new Error('Notification model not found');
                }

                const notification = await notificationModel.create({
                    recipientId: doctor.fullName,
                    recipientModel: 'Doctor',
                    patientId: patient_id,
                    title: 'New Review Received',
                    message: `You have received a ${rating} star review from a patient`,
                    read: false,
                    createdAt: new Date()
                });

                console.log('[RATE_DOCTOR] Notification created successfully:', {
                    notificationId: notification._id,
                    message: notification.message,
                    recipientId: notification.recipientId
                });

                // Trigger Pusher event
                console.log('[RATE_DOCTOR] Triggering Pusher event');
                const channelName = `notifications-${doctor.fullName}`;
                console.log('[RATE_DOCTOR] Pusher channel:', channelName);

                const pusherResponse = await pusher.trigger(channelName, 'new-notification', {
                    notification: notification
                });

                console.log('[RATE_DOCTOR] Pusher event triggered:', {
                    success: !!pusherResponse,
                    channel: channelName
                });
            } catch (notificationError) {
                console.error('[RATE_DOCTOR] Error creating review notification:', {
                    error: notificationError.message,
                    stack: notificationError.stack,
                    name: notificationError.name
                });
                // Don't fail the request if notification creation fails
            }

            return res.status(200).json({
                success: true,
                message: "Rating submitted successfully",
                data: updatedDoctor
            });
        } catch (error) {
            console.error('[RATE_DOCTOR] Error in rateDoctor:', {
                error: error.message,
                stack: error.stack,
                name: error.name
            });
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },
    getReviewsSummary: async (req, res) => {
        try {
            const doctorEmail = req.query?.doctorEmail || req.user?.email;
            if (!doctorEmail) {
                return res.status(400).json({
                    success:false,
                    message:"Doctor email is required"
                })
            }
            const doctor = await adddoctorModel.findOne({ email: doctorEmail.toLowerCase().trim() });
            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    message: "Doctor not found"
                });
            }
            let ratings = [];
            for (const r of doctor.ratings) {
                try {
                const decrypted = await IPFSService.retrieveAndDecrypt(r.ipfsCID, r.ipfsIV);
                    if (decrypted && decrypted.rating) {
                        ratings.push(Number(decrypted.rating));
                    }
                } catch (err) {
   continue;
                }
            }

            const ratingsCount = ratings.length;
            const averageRating = ratingsCount > 0
                ? (ratings.reduce((acc, val) => acc + val, 0) / ratingsCount).toFixed(1)
                : "0.0";

            const reviewSummary = {
                totalRatings: ratingsCount,
                averageRating,
                ratingsCount: doctor.ratings.length // total ratings stored (could be more than decrypted if some fail)
            };

            return res.status(200).json({
                success: true,
                message: "Review summary fetched successfully",
                data: reviewSummary
            });
        } catch (error) {
            console.log("error", error.message);
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    }
};