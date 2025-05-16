const jwt = require('jsonwebtoken');
const PatientSignup = require('../models/patient/signupModel');
const DoctorSignup = require('../models/doctor/signupModel');

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No authentication token, access denied'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user is a patient or doctor based on role in token
        let user;
        if (decoded.role === 'patient') {
            user = await PatientSignup.findOne({ email: decoded.email });
        } else if (decoded.role === 'doctor') {
            user = await DoctorSignup.findOne({ email: decoded.email });
        }
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Attach user to request object
        req.user = {
            id: user._id,
            role: decoded.role,
            email: user.email
        };
        
        next();
    } catch (error) {
        // console.error('Auth middleware error:', error);
        res.status(401).json({
            success: false,
            message: 'Please authenticate'
        });
    }
};

module.exports = auth; 