const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const adminSignupModel = require('../models/admin/adminSignupModel');
const adminLoginModel = require('../models/admin/adminloginModel');

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

            // Return validated data
            return {
                ...adminData,
                password: hashedPassword,
            };
        } catch (error) {
            throw error;
        }
    },

    createAdmin: async (validatedData) => {
        try {
            // Create new admin
            const newAdmin = new adminSignupModel({
                fullName: validatedData.fullName,
                email: validatedData.email,
                password: validatedData.password,
                contactNumber: validatedData.contactNumber,
                hospitalName: validatedData.hospitalName,
                totalHospitals: validatedData.totalHospitals,
                totalBeds: validatedData.totalBeds,
                staffInformation: {
                    nurses: validatedData.staffInformation.nurses,
                    receptionists: validatedData.staffInformation.receptionists,
                    otherStaff: validatedData.staffInformation.otherStaff
                },
                role: validatedData.role
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

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, admin.password);
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
                password: admin.password,
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
