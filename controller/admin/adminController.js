const express = require('express');
const { adminSignupService, adminLoginService } = require('../../services/adminservice');
const adminSignupModel = require('../../models/admin/adminSignupModel');
const patientSignupModel = require ("../../models/patient/signupModel")
const doctorSignupModel = require("../../models/doctor/signupModel");
const addpatientModel = require("../../models/patient/addpatientModel");
const adddoctorModel = require("../../models/doctor/adddoctorModel");

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
const totalpatients=await patientSignupModel.countDocuments();
const totaldoctors=await doctorSignupModel.countDocuments();
const newPatients=await addpatientModel.countDocuments();
const newDoctors=await adddoctorModel.countDocuments();
            // Return admin data
            return res.status(200).json({
                success: true,
                message: "Admin data fetched successfully",
                data: {
                    _id: admin._id,
                    fullName: admin.fullName,
                    email: admin.email,
                    hospitalName: admin.hospitalName,
                    totalHospitals: admin.totalHospitals,
                    totalBeds: admin.totalBeds,
                    totalPatients:totalpatients,
                    totalDoctors:totaldoctors,
                    newPatients:newPatients,
                    newDoctors:newDoctors,
                    staffInformation: admin.staffInformation,
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
    }
};
// controllers/adminController.js