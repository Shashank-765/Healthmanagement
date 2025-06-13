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
            let token = null;
            
            // Check Authorization header first
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
            
            // If no token in header, check cookies
            if (!token && req.cookies) {
                token = req.cookies.token;
            }

            if (!token) {
                console.error('No token found in request');
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "No token provided"
                });
            }

            // Log token format for debugging
            console.log('Token format:', {
                length: token.length,
                startsWith: token.substring(0, 10) + '...',
                format: token.split('.').length === 3 ? 'valid' : 'invalid'
            });

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
                name: user.name || user.fullName || user.email,
                fullName: user.fullName
            };

            next();
        } catch (error) {
            console.error('Detailed middleware error:', error);
            // Add more specific error messages based on the error type
            let errorMessage = "Invalid token";
            if (error.name === 'JsonWebTokenError') {
                errorMessage = "Invalid token format";
            } else if (error.name === 'TokenExpiredError') {
                errorMessage = "Token has expired";
            }
            
            return res.status(401).json({
                statusCode: 401,
                success: false,
                message: errorMessage
            });
        }
    }
};

module.exports = authMiddleware;