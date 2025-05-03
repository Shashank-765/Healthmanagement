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
            // Debug logs
            console.log('Headers received:', req.headers);
            console.log('Cookies received:', req.cookies);

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
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "No token provided"
                });
            }

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log("Decoded token:", decoded);

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
                    user = await addpatientModel.findById(decoded.id) || 
                           await PatientSignup.findById(decoded.id);
                    break;
                case 'doctor':
                    user = await DoctorSignup.findById(decoded.id);
                    break;
                case 'insurance':
                    user = await Signup.findById(decoded.id);
                    break;
            }

            if (!user) {
                return res.status(401).json({
                    statusCode: 401,
                    success: false,
                    message: "User not found"
                });
            }

            // Attach complete user info to request
            req.user = {
                id: user._id,
                email: user.email,
                role: decoded.role,
                name: user.name || user.fullName
            };

            console.log('User attached to request:', req.user);
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