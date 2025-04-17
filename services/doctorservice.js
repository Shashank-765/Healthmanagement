const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../models/doctor/signupModel');
const patientSignup = require('../models/patient/signupModel');
const doctorController = require('../controller/doctor/doctorController');
const doctorLogin = require('../models/doctor/loginModel');
const mnemonic = process.env.mnemonic;

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
        if (!doctorData) {
            throw new Error("Please provide doctor data");
        }

        const {
            fullName,
            gender,
            dateOfBirth,
            contactNumber,
            email,
            password,
            specialization,
            medicalLicenseNumber,
            yearsOfExperience,
            hospitalClinicName,
            medicalDocument
        } = doctorData;

        // Required fields validation
        const requiredFields = {
            'Full Name': fullName,
            'Gender': gender,
            'Date of Birth': dateOfBirth,
            'Contact Number': contactNumber,
            'Email': email,
            'Password': password,
            'Specialization': specialization,
            'Medical License Number': medicalLicenseNumber,
            'Years of Experience': yearsOfExperience
        };

        const missingFields = Object.entries(requiredFields)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missingFields.length > 0) {
            throw new Error(`Please fill mandatory fields: ${missingFields.join(", ")}`);
        }
        
        // Validate contact number
        if (!/^\d{10}$/.test(contactNumber)) {
            throw new Error("Contact number must be a valid 10-digit number");
        }
        
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error("Please provide a valid email address");
        }
        
        // Validate medical license number
        if (!/^\d{10}$/.test(medicalLicenseNumber)) {
            throw new Error("Medical license number must be a valid 10-digit number");
        }
        
        // Check if email exists
        const emailExists = await doctorSignup.findOne({ email });
        if (emailExists) {
            throw new Error("Email already exists");
        }
        
        // Generate wallet if not provided
        let walletAddress = doctorData.walletAddress;
        if (!walletAddress) {
            const walletData = await doctorSignupService.generateWallet();
            walletAddress = walletData.address;
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Return complete validated data
        return {
            fullName,
            gender,
            dateOfBirth,
            contactNumber,
            email,
            password: hashedPassword,
            specialization,
            medicalLicenseNumber,
            yearsOfExperience,
            hospitalClinicName: hospitalClinicName || null,
            medicalDocument,
            walletAddress
        };
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
        try {
            const token = jwt.sign({ id: doctorId }, process.env.JWT_SECRET, { expiresIn: "30d" });
            return token;
        } catch (error) {
            throw new Error("Token generation failed: " + error.message);
        }
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

module.exports = {
    doctorSignupService,
    doctorLoginService
};