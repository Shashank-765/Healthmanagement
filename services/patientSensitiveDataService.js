const patientSignup = require('../models/patient/signupModel');
const doctorSignup = require('../models/doctor/signupModel');
const IPFSService = require('./ipfsService');

module.exports = {
    getSensitiveDataByCID: async (cid, req) => {
        try {
            let user;
            let sensitiveData;

            // Get role from the authenticated user
            const userRole = req.user.role;

            // Find user based on role
            if (userRole === 'patient') {
                user = await patientSignup.findOne({ ipfsCID: cid });
            } else if (userRole === 'doctor') {
                user = await doctorSignup.findOne({ ipfsCID: cid });
            } else {
                throw new Error("Invalid user role");
            }

            if (!user) {
                throw new Error(`${userRole} not found`);
            }

            if (!user.ipfsCID || !user.ipfsIV) {
                console.log("Service: Missing IPFS data for user:", {
                    userRole,
                    hasCID: !!user.ipfsCID,
                    hasIV: !!user.ipfsIV
                });
                throw new Error(`${userRole} IPFS data is incomplete`);
            }

            // Retrieve and decrypt sensitive data
            sensitiveData = await IPFSService.retrieveAndDecrypt(
                user.ipfsCID,
                user.ipfsIV
            );

            if (!sensitiveData) {
                throw new Error("Failed to retrieve sensitive data from IPFS");
            }

            return { 
                user,
                sensitiveData,
                userRole
            };

        } catch (error) {
            console.error("Service: Error in getSensitiveDataByCID:", error);
            throw error;
        }
    }
}; 