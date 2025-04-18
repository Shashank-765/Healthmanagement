const express = require('express');
const router = express.Router();
const patientController = require('../controller/patient/patientController');
const upload = require('../utils/multer');

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({
            success: false,
            message: err.message || 'File upload error'
        });
    }
    next();
};

// Form data parsing middleware
const parseFormData = (req, res, next) => {
   next();
};

// Use upload.single for single file upload with error handling
router.post("/signup", 
    upload.single('medicalDocument'),
    handleMulterError,
    parseFormData,
    patientController.patientSignup
);

router.post('/patientlogin', patientController.patientLogin);
// Route to get sensitive data
router.get('/:cid/sensitive-data', patientController.getPatientSensitiveData);

// Protected routes for sensitive data
// router.get('/:cid/sensitive-data', 
//     authMiddleware.authenticateToken,  // JWT token check
//     authMiddleware.authorizePatientAccess, // Check if user has access to this patient's data
//     patientController.getPatientSensitiveData
// );


module.exports = router;
