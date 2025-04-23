const express = require('express');
const { adminSignupService, adminLoginService } = require('../../services/adminservice');

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

            // Return success response
            return res.status(200).json({
                success: true,
                message: "Admin login successful",
                data: {
                    _id: admin._id,
                    email: admin.email,
                    password: admin.password,
                    token: token,
                    // hospitalName: admin.hospitalName,
                    // token: token
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
    }
};
