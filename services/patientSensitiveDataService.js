const patientSignup = require('../models/patient/signupModel');
const IPFSService = require('./ipfsService');

module.exports = {
    getSensitiveDataByCID: async (cid) => {
        try {
            // Validation 1: Check if patient exists
            const patient = await patientSignup.findOne({ ipfsCID: cid });
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Get data from IPFS
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            // Response: Return data
            return { patient, sensitiveData };

        } catch (error) {
            throw error;
        }
    }
}; 