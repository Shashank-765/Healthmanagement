const express = require('express');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../../models/doctor/signupModel');
const doctorLogin = require('../../models/doctor/loginModel');
const { doctorSignupService, doctorLoginService } = require('../../services/doctorservice');
const fs = require('fs');

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
            
            // Create doctor in signup collection
            const doctor = await doctorSignup.create(validatedData);

            // Prepare response data
            const doctorResponse = doctor.toObject();
            delete doctorResponse.__v;
            delete doctorResponse.password;

            // Send success response
            res.status(201).json({
                statusCode: 201,
                message: "Doctor signup successful",
                data: {
                    doctor: {
                        ...doctorResponse,
                        walletAddress: doctor.walletAddress,
                        medicalDocument: doctor.medicalDocument
                    },
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

            // Validate login credentials
            const doctor = await doctorLoginService.validateLogin(email, password);

            // If login successful, create login record if it doesn't exist
            const existingLogin = await doctorLogin.findOne({ email });
            if (!existingLogin) {
                await doctorLogin.create({
                    email: doctor.email,
                    password: doctor.password
                });
            }

            // Generate token only during login
            const token = doctorLoginService.generateToken(doctor._id);

            // Send success response
            res.status(200).json({
                statusCode: 200,
                message: "Doctor login successful",
                data: {
                    email: doctor.email,
                    password: doctor.password,
                    token
                }
            });

        } catch (error) {
            const statusCode = error.message.includes("Invalid") ? 401 : 500;
            res.status(statusCode).json({
                statusCode,
                message: error.message || "Internal server error"
            });
        }
    }
};

