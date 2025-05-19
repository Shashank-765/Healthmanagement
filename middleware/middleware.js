const jwt = require('jsonwebtoken');
const Cookies = require('js-cookie');
const PatientSignup = require('../models/patient/signupModel');
const addpatientModel = require('../models/patient/addpatientModel');
const DoctorSignup = require('../models/doctor/signupModel');
const adminSignupModel = require('../models/admin/adminSignupModel');
const Signup = require('../models/insurance/signupModel');

const authMiddleware = {
    authenticateToken: async (req, res, next) => {
        try {
            // console.log('Auth Middleware - Headers:', req.headers);
            
            // Check for token in Authorization header
            const authHeader = req.headers.authorization;
            let token;

            if (authHeader) {
                token = authHeader.split(' ')[1];
                console.log('Token from Authorization header:', token);
            } else {
                // Check for token in cookies
                token = req.cookies?.token;
                console.log('Token from cookies:', token);
            }

            if (!token) {
                console.error('No token found in request');
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "No token provided"
                });
            }

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (!decoded.role) {
                console.error("Token missing role:", decoded);
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "Token missing role"
                });
            }

            // Find user based on role
            let user;
            switch (decoded.role) {
                case 'admin':
                    user = await adminSignupModel.findById(decoded.id);
                    break;
                case 'patient':
                    user = await PatientSignup.findById(decoded.id);
                    if (!user) {
                        user = await addpatientModel.findById(decoded.id);
                    }
                    break;
                case 'doctor':
                    user = await DoctorSignup.findById(decoded.id);
                    break;
                case 'insurance':
                    user = await Signup.findById(decoded.id);
                    break;
            }

            if (!user) {
                console.error('User not found for role:', decoded.role, 'and id:', decoded.id);
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "User not found"
                });
            }

            console.log('User found:', {
                id: user._id,
                email: user.email,
                role: decoded.role
            });

            // Attach complete user info to request
            req.user = {
                id: user._id,
                email: user.email,
                role: decoded.role,
                name: user.name || user.fullName
            };

            next();
        } catch (error) {
            console.error('Detailed middleware error:', error);
            return res.status(401).json({
                statusCode: 401,
                success: false,
                message: error.message || "Invalid token"
            });
        }
    }
};

module.exports = authMiddleware;