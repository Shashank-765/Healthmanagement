const patientSignup = require('../models/patient/signupModel');
const IPFSService = require('./ipfsService');

module.exports = {
    getSensitiveDataByCID: async (cid) => {
        try {
               const patient = await patientSignup.findOne({ ipfsCID: cid });
               if (!patient) {
                throw new Error("Patient not found");
            }

            if (!patient.ipfsCID || !patient.ipfsIV) {
                console.log("Service: Missing IPFS data for patient:", {
                    hasCID: !!patient.ipfsCID,
                    hasIV: !!patient.ipfsIV
                });
                throw new Error("Patient IPFS data is incomplete");
            }
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );
            if (!sensitiveData) {
                throw new Error("Failed to retrieve sensitive data from IPFS");
            }
            return { patient, sensitiveData };

        } catch (error) {
            console.error("Service: Error in getSensitiveDataByCID:", error);
            throw error;
        }
    }
}; 