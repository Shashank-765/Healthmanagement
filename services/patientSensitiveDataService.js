const patientSignup = require('../models/patient/signupModel');
const doctorSignup = require('../models/doctor/signupModel');
const IPFSService = require('./ipfsService');
const addpatientModel = require('../models/patient/addpatientModel');

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
    },

    getPatientDataByEmail: async (email) => {
        try {
            // Find patient in addpatientModel
            const patient = await addpatientModel.findOne({ email });
            if (!patient) {
                throw new Error("Patient not found");
            }

            // Find patient in signupModel to get additional data
            const signupPatient = await patientSignup.findOne({ email });
            if (!signupPatient) {
                throw new Error("Patient signup data not found");
            }

            // Get IPFS data
            const ipfsData = await IPFSService.retrieveAndDecrypt(
                patient.ipfsCID,
                patient.ipfsIV
            );

            // Combine all data
            return {
                // Basic patient data from addpatientModel
                patient: {
                    _id: patient._id,
                    fullName: patient.fullName,
                    email: patient.email,
                    medicalDocument: patient.medicalDocument,
                    ipfsCID: patient.ipfsCID,
                    ipfsIV: patient.ipfsIV,
                    createdAt: patient.createdAt,
                    updatedAt: patient.updatedAt
                },
                // Signup data
                signupData: {
                    _id: signupPatient._id,
                    fullName: signupPatient.fullName,
                    email: signupPatient.email,
                    gender: signupPatient.gender,
                    dateOfBirth: signupPatient.dateOfBirth,
                    age: signupPatient.age,
                    phoneNumber: signupPatient.phoneNumber,
                    bloodGroup: signupPatient.bloodGroup,
                    emergencyContactNumber: signupPatient.emergencyContactNumber,
                    knownAllergies: signupPatient.knownAllergies,
                    currentMedication: signupPatient.currentMedication,
                    medicalHistory: signupPatient.medicalHistory,
                    medicalDocument: signupPatient.medicalDocument,
                    walletAddress: signupPatient.walletAddress
                },
                // IPFS data (including sensitive information)
                ipfsData: {
                    ...ipfsData,
                    // Adding the requested fields to IPFS data
                    admitDate: patient.admitDate,
                    medicalCondition: patient.medicalCondition,
                    roomNumber: patient.roomNumber,
                    assignedDoctor: patient.assignedDoctor,
                    insuranceInformation: patient.insuranceInformation,
                    profileimage: patient.profileimage,
                    // Existing IPFS data fields
                    password: ipfsData.password,
                    walletAddress: ipfsData.walletAddress,
                    phoneNumber: ipfsData.phoneNumber,
                    bloodGroup: ipfsData.bloodGroup,
                    emergencyContactNumber: ipfsData.emergencyContactNumber,
                    knownAllergies: ipfsData.knownAllergies,
                    currentMedication: ipfsData.currentMedication,
                    medicalHistory: ipfsData.medicalHistory,
                    medicalDocument: ipfsData.medicalDocument
                }
            };
        } catch (error) {
            console.error("Service: Error in getPatientDataByEmail:", error);
            throw error;
        }
    }
}; 