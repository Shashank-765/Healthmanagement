const express = require('express');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../../models/doctor/signupModel');
const doctorLogin = require('../../models/doctor/loginModel');
const adddoctorModel = require('../../models/doctor/adddoctorModel');
const { doctorSignupService, doctorLoginService, createdDoctor, doctorManagementService } = require('../../services/doctorservice');
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

            // Generate token with role
            const token = jwt.sign(
                { 
                    id: doctor._id,
                    role: 'doctor'
                },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

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
            
            // Validate and process data using service
            const validatedData = await createdDoctor.validateDoctorData(doctorData);
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
            return res.status(500).json({
                success: false,
                message: error.message || "Internal server error"
            });
        }
    },

    getDoctors: async (req, res) => {
        try {
            const filters = req.query;
            const doctors = await doctorManagementService.getDoctors(filters);

            return res.status(200).json({
                success: true,
                message: "Doctors fetched successfully",
                data: doctors
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
            const deletedDoctor = await doctorManagementService.deleteDoctor(email);

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
    }
};


// add :- fullname,specialization,experience,avaiability,contactnumber,email,password,qualification,address,bio,profileimage
// read on :- what to show, profileimage, fullname, specialization, experience, avaiability, contactnumber, email
//schedule appointment:- profileimage, fullname(doctor), specialization, prefered date and perfered time, full name (patient),phonenumber(patient),email address and reason for visit both patient.
//doctor view profile:- profileimage, fullname,specalization,experience,avaiability,contactnumber,email,rating,patientsin numbers. and about(bio).

