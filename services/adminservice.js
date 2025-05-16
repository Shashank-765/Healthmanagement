const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const adminSignupModel = require('../models/admin/adminSignupModel');
const adminLoginModel = require('../models/admin/adminloginModel');
const IPFSService = require('../services/ipfsService');

const adminSignupService = {
    validateAdminData: async (adminData) => {
        try {
            // Check if admin already exists
            const existingAdmin = await adminSignupModel.findOne({ email: adminData.email });
            if (existingAdmin) {
                throw new Error("Admin with this email already exists");
            }

            // Validate required fields
            const requiredFields = [
                'fullName',
                'email',
                'password',
                'contactNumber',
                'hospitalName',
                'totalHospitals',
                'totalBeds',
                'staffInformation'
            ];

            const missingFields = requiredFields.filter(field => !adminData[field]);
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate staff information
            const requiredStaffFields = ['nurses', 'receptionists', 'otherStaff'];
            const missingStaffFields = requiredStaffFields.filter(field => 
                !adminData.staffInformation || !adminData.staffInformation[field]
            );

            if (missingStaffFields.length > 0) {
                throw new Error(`Missing staff information fields: ${missingStaffFields.join(', ')}`);
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(adminData.password, 10);

            // Prepare data for IPFS (exclude _id and email)
            const ipfsData = {
                fullName: adminData.fullName,
                password: hashedPassword,
                contactNumber: adminData.contactNumber,
                hospitalName: adminData.hospitalName,
                totalHospitals: adminData.totalHospitals,
                totalBeds: adminData.totalBeds,
                staffInformation: adminData.staffInformation,
                role: adminData.role
            };

            // Store on IPFS
            const { cid, iv } = await IPFSService.uploadEncryptedData(ipfsData);

            // Return only email, ipfsCID, ipfsIV
            return {
                email: adminData.email,
                ipfsCID: cid,
                ipfsIV: iv
            };
        } catch (error) {
            throw error;
        }
    },

    createAdmin: async (validatedData) => {
        try {
            // Create new admin with only email, ipfsCID, ipfsIV
            const newAdmin = new adminSignupModel({
                email: validatedData.email,
                ipfsCID: validatedData.ipfsCID,
                ipfsIV: validatedData.ipfsIV
            });

            // Save admin
            const savedAdmin = await newAdmin.save();
            return savedAdmin;
        } catch (error) {
            throw error;
        }
    }
};

const adminLoginService = {
    validateLogin: async (email, password) => {
        try {
            // Validate required fields
            if (!email || !password) {
                throw new Error("Email and password are required");
            }
    
            // Find admin by email
            const admin = await adminSignupModel.findOne({ email });
            if (!admin) {
                throw new Error("Invalid email or password");
            }
    
            // Get sensitive data from IPFS
            const adminData = await IPFSService.retrieveAndDecrypt(
                admin.ipfsCID,
                admin.ipfsIV
            );
    
            // Verify password
            const isPasswordValid = await bcrypt.compare(password, adminData.password);
            if (!isPasswordValid) {
                throw new Error("Invalid email or password");
            }
    
            // Generate JWT token
            const token = jwt.sign(
                { 
                    id: admin._id,
                    role: 'admin'
                },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );
    
            // Save login information
            const loginData = {
                email: admin.email,
                password: adminData.password,
                token
            };
    
            // Update or create login record
            await adminLoginModel.findOneAndUpdate(
                { email: admin.email },
                loginData,
                { upsert: true, new: true }
            );
    
            return {
                admin,
                adminData,
                token
            };
        } catch (error) {
            throw error;
        }
    }
};

module.exports = {
    adminSignupService,
    adminLoginService
};
