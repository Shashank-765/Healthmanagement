const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../models/doctor/signupModel');
const patientSignup = require('../models/patient/signupModel');
const doctorController = require('../controller/doctor/doctorController');
const doctorLogin = require('../models/doctor/loginModel');
const IPFSService = require('./ipfsService');
const mnemonic = process.env.mnemonic;
const adddoctorModel = require('../models/doctor/adddoctorModel');

const doctorSignupService = {
    generateWallet: async () => {
        try {
            const doctorCount = await doctorSignup.countDocuments();
            console.log("Doctor Count for wallet generation:", doctorCount);
            
            const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
            const wallet = hdNode.deriveChild(doctorCount);
            console.log("Generated wallet address:", wallet.address);

            return {
                address: wallet.address
            };
        } catch (error) {
            console.error("Error in generateWallet:", error);
            throw new Error("Wallet creation failed: " + error.message);
        }
    },

    validateDoctorData: async (doctorData) => {
        try {
        if (!doctorData) {
                throw new Error("Doctor data is required");
            }

            // Check if email exists
            const existingDoctor = await doctorSignup.findOne({ email: doctorData.email });
            if (existingDoctor) {
                throw new Error("Email already exists");
            }

            // Validate required fields
            const requiredFields = [
                'fullName', 'gender', 'dateOfBirth', 'email', 'password',
                'contactNumber', 'specialization', 'medicalLicenseNumber',
                'yearsOfExperience', 'hospitalClinicName', 'medicalDocument'
            ];

            const missingFields = requiredFields.filter(field => !doctorData[field]);
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }
        
        // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(doctorData.email)) {
                throw new Error("Please enter a valid email address");
            }

            // Validate contact number format
            if (!/^\d{10}$/.test(doctorData.contactNumber)) {
                throw new Error("Contact number must be exactly 10 digits");
            }

            // Validate medical license number format
            if (!/^\d{10}$/.test(doctorData.medicalLicenseNumber)) {
                throw new Error("Medical license number must be exactly 10 digits");
            }

            // Generate wallet
            const walletData = await doctorSignupService.generateWallet();
            
            // Hash password
            const hashedPassword = await bcrypt.hash(doctorData.password, 10);

            return {
                ...doctorData,
                password: hashedPassword,
                walletAddress: walletData.address
            };
        } catch (error) {
            console.error('Error in validateDoctorData:', error);
            throw error;
        }
    },

    createDoctor: async (validatedData) => {
        try {
            // Create MongoDB document with all required fields
            const mongoData = {
                fullName: validatedData.fullName,
                gender: validatedData.gender,
                dateOfBirth: validatedData.dateOfBirth,
                contactNumber: validatedData.contactNumber,
                email: validatedData.email,
                password: validatedData.password,
                specialization: validatedData.specialization,
                medicalLicenseNumber: validatedData.medicalLicenseNumber,
                yearsOfExperience: validatedData.yearsOfExperience,
                hospitalClinicName: validatedData.hospitalClinicName,
                medicalDocument: validatedData.medicalDocument,
                walletAddress: validatedData.walletAddress
            };

            // Create doctor in MongoDB
            const doctor = await doctorSignup.create(mongoData);

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                password: validatedData.password,
                walletAddress: validatedData.walletAddress,
                contactNumber: validatedData.contactNumber,
                medicalLicenseNumber: validatedData.medicalLicenseNumber,
                medicalDocument: validatedData.medicalDocument,
                gender: validatedData.gender,
                dateOfBirth: validatedData.dateOfBirth,
                specialization: validatedData.specialization,
                yearsOfExperience: validatedData.yearsOfExperience,
                hospitalClinicName: validatedData.hospitalClinicName
            };

            // Upload sensitive data to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);

            // Update doctor with IPFS data
            await doctorSignup.findByIdAndUpdate(doctor._id, {
                ipfsCID: ipfsResult.cid,
                ipfsIV: ipfsResult.iv
            });

            // Return the complete doctor document
            const updatedDoctor = await doctorSignup.findById(doctor._id);
            if (!updatedDoctor) {
                throw new Error("Failed to create doctor record");
            }

            return updatedDoctor;
        } catch (error) {
            console.error('Error in createDoctor:', error);
            throw error;
        }
    }
};

const doctorLoginService = {
    validateLogin: async (email, password) => {
        try {
            if (!email || !password) {
                throw new Error("Please provide email and password");
            }

            // First check in doctorsignups collection
            const doctor = await doctorSignup.findOne({ email });
            if (!doctor) {
                throw new Error("Invalid email or password");
            }

            // Verify password
            const isMatch = await bcrypt.compare(password, doctor.password);
            if (!isMatch) {
                throw new Error("Invalid email or password");
            }

            return doctor;
        } catch (error) {
            throw new Error(error.message || "Login validation failed");
        }
    },
    generateToken: (doctorId) => {
        return jwt.sign(
            { 
                id: doctorId,
                role: 'doctor'  // Add role to token
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
    },
    createDoctorLogin: async (doctorLoginData) => {
        try {
            const doctorLogin = await doctorLogin.create(doctorLoginData);
            return doctorLogin;
        } catch (error) {
            throw new Error("Failed to create doctor login: " + error.message);
        }
    }
};

const createdDoctor = {
    validateDoctorData: async (doctorData) => {
        try {
            // Check if all required fields are present
            const requiredFields = ['fullName', 'specialization', 'experience', 'availability', 
                                 'contactnumber', 'email', 'password', 'qualification', 
                                 'address', 'bio'];
            
            const missingFields = requiredFields.filter(field => !doctorData[field]);
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Check if email already exists
            const existEmail = await adddoctorModel.findOne({ email: doctorData.email });
            if (existEmail) {
                throw new Error("Email already exists");
            }

            // Check if contact number already exists
            const existContact = await adddoctorModel.findOne({ contactnumber: doctorData.contactnumber });
            if (existContact) {
                throw new Error("Contact number already exists");
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(doctorData.email)) {
                throw new Error("Please enter a valid email address");
            }

            // Validate contact number format
            if (!/^\d{10}$/.test(doctorData.contactnumber)) {
                throw new Error("Contact number must be exactly 10 digits");
            }

            // Hash password
            const hashPassword = await bcrypt.hash(doctorData.password, 10);

            // Return validated and processed data
            return {
                ...doctorData,
                password: hashPassword
            };
        } catch (error) {
            throw error;
        }
    },
    saveDoctor: async (validatedDoctorData) => {
        try {
            // Create MongoDB document with basic information
            const mongoData = {
                fullName: validatedDoctorData.fullName,
                specialization: validatedDoctorData.specialization,
                experience: validatedDoctorData.experience,
                availability: validatedDoctorData.availability,
                contactnumber: validatedDoctorData.contactnumber,
                email: validatedDoctorData.email,
                password: validatedDoctorData.password,
                qualification: validatedDoctorData.qualification,
                address: validatedDoctorData.address,
                bio: validatedDoctorData.bio,
                profileimage: validatedDoctorData.profileimage
            };

            // Create doctor in MongoDB
            const doctor = await adddoctorModel.create(mongoData);

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                password: validatedDoctorData.password,
                contactnumber: validatedDoctorData.contactnumber,
                profileimage: validatedDoctorData.profileimage,
                qualification: validatedDoctorData.qualification,
                address: validatedDoctorData.address,
                bio: validatedDoctorData.bio
            };

            // Upload sensitive data to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);
            console.log("IPFS Result:", ipfsResult); // Add logging

            // Update doctor with IPFS data
            const updatedDoctor = await adddoctorModel.findByIdAndUpdate(
                doctor._id,
                { 
                    ipfsCID: ipfsResult.cid,
                    ipfsIV: ipfsResult.iv
                },
                { new: true } // Return the updated document
            );

            if (!updatedDoctor) {
                throw new Error("Failed to create doctor record");
            }

            console.log("Updated Doctor with IPFS:", updatedDoctor); // Add logging
            return updatedDoctor;
        } catch (error) {
            console.error('Error in saveDoctor:', error);
            throw error;
        }
    }
};

const doctorManagementService = {
    getDoctors: async (filters) => {
        try {
            const { specialization, name } = filters;
            let query = {};

            // Add filters if provided
            if (specialization) {
                query.specialization = specialization;
            }
            if (name) {
                query.fullName = { $regex: name, $options: 'i' }; // Case-insensitive search
            }

            // Fetch doctors with selected fields
            const doctors = await adddoctorModel.find(query)
                .select('profileimage fullName specialization experience availability contactnumber email')
                .lean();

            return doctors;
        } catch (error) {
            console.error('Error in getDoctors service:', error);
            throw error;
        }
    },

    updateDoctor: async (email, updateData) => {
        try {
            console.log('Searching for doctor with email:', email);
            
            // Find the doctor
            const doctor = await adddoctorModel.findOne({ email });
            console.log('Found doctor:', doctor);
            
            if (!doctor) {
                console.log('No doctor found with email:', email);
                throw new Error("Doctor not found");
            }

            // Prepare sensitive and insensitive data
            const insensitiveData = {
                specialization: updateData.specialization,
                experience: updateData.experience,
                contactnumber: updateData.contactnumber,
                profileimage: updateData.profileimage,
                bio: updateData.bio,
                address: updateData.address,
                qualification: updateData.qualification
            };

            // Update insensitive data in MongoDB
            const updatedDoctor = await adddoctorModel.findOneAndUpdate(
                { email },
                { $set: insensitiveData },
                { new: true }
            );

            // If there's sensitive data to update
            if (doctor.ipfsCID) {
                const sensitiveData = {
                    contactnumber: updateData.contactnumber,
                    profileimage: updateData.profileimage,
                    qualification: updateData.qualification,
                    address: updateData.address,
                    bio: updateData.bio
                };

                // Upload updated sensitive data to IPFS
                const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);

                // Update IPFS references
                await adddoctorModel.findOneAndUpdate(
                    { email },
                    { 
                        ipfsCID: ipfsResult.cid,
                        ipfsIV: ipfsResult.iv
                    }
                );
            }

            return updatedDoctor;
        } catch (error) {
            console.error('Error in updateDoctor service:', error);
            throw error;
        }
    },

    deleteDoctor: async (email) => {
        try {
            // Find and delete the doctor
            const doctor = await adddoctorModel.findOneAndDelete({ email });
            if (!doctor) {
                throw new Error("Doctor not found");
            }

            return doctor;
        } catch (error) {
            console.error('Error in deleteDoctor service:', error);
            throw error;
        }
    }
};

module.exports = {
    doctorSignupService,
    doctorLoginService,
    createdDoctor,
    doctorManagementService
};