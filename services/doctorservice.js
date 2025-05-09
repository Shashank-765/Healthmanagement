const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const bcrypt = require('bcryptjs');
const doctorSignup = require('../models/doctor/signupModel');
const patientSignup = require('../models/patient/signupModel');
const doctorController = require('../controller/doctor/doctorController');
const doctorLogin = require('../models/doctor/loginModel');
const IPFSService = require('./ipfsService');
const mnemonic = process.env.mnemonic;
const adddoctorModel = require('../models/doctor/adddoctorModel');
const appointmentModel = require('../models/appointment/appointmentModel');
const medicalHistoryModel = require('../models/medicalHistory/medicalHistoryModel');

const doctorSignupService = {
    generateWallet: async () => {
        try {
            const doctorCount = await doctorSignup.countDocuments();
            console.log("Doctor Count for wallet generation:", doctorCount);
            
            const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
            const wallet = hdNode.deriveChild(doctorCount);
            console.log("Generated wallet address:", wallet.address);

            return {
                address: wallet.address
            };
        } catch (error) {
            console.error("Error in generateWallet:", error);
            throw new Error("Wallet creation failed: " + error.message);
        }
    },

    validateDoctorData: async (doctorData) => {
        try {
            if (!doctorData) {
                throw new Error("Doctor data is required");
            }

            // Check if email exists
            const existingDoctor = await doctorSignup.findOne({ email: doctorData.email });
            if (existingDoctor) {
                throw new Error("Email already exists");
            }

            // Validate required fields
            const requiredFields = [
                'fullName', 'gender', 'dateOfBirth', 'email', 'password',
                'contactNumber', 'specialization', 'medicalLicenseNumber',
                'yearsOfExperience', 'hospitalClinicName', 'medicalDocument'
            ];

            const missingFields = requiredFields.filter(field => !doctorData[field]);
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(doctorData.email)) {
                throw new Error("Please enter a valid email address");
            }

            // Validate contact number format
            if (!/^\d{10}$/.test(doctorData.contactNumber)) {
                throw new Error("Contact number must be exactly 10 digits");
            }

            // Validate medical license number format
            if (!/^\d{10}$/.test(doctorData.medicalLicenseNumber)) {
                throw new Error("Medical license number must be exactly 10 digits");
            }

            // Generate wallet
            const walletData = await doctorSignupService.generateWallet();
            
            // Hash password
            const hashedPassword = await bcrypt.hash(doctorData.password, 10);

            return {
                ...doctorData,
                password: hashedPassword,
                walletAddress: walletData.address
            };
        } catch (error) {
            console.error('Error in validateDoctorData:', error);
            throw error;
        }
    },

    createDoctor: async (validatedData) => {
        try {
            // Create MongoDB document with only essential fields
            const mongoData = {
                fullName: validatedData.fullName,
                email: validatedData.email
            };

            // Create doctor in MongoDB
            const doctor = await doctorSignup.create(mongoData);

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                password: validatedData.password,
                walletAddress: validatedData.walletAddress,
                gender: validatedData.gender,
                dateOfBirth: validatedData.dateOfBirth,
                contactNumber: validatedData.contactNumber,
                specialization: validatedData.specialization,
                medicalLicenseNumber: validatedData.medicalLicenseNumber,
                yearsOfExperience: validatedData.yearsOfExperience,
                hospitalClinicName: validatedData.hospitalClinicName,
                medicalDocument: validatedData.medicalDocument
            };

            // Upload sensitive data to IPFS
            const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);

            // Update doctor with IPFS data
            doctor.ipfsCID = ipfsResult.cid;
            doctor.ipfsIV = ipfsResult.iv;
            await doctor.save();

            return doctor;
        } catch (error) {
            console.error('Error in createDoctor:', error);
            throw error;
        }
    }
};

const doctorLoginService = {
    validateLogin: async (email, password) => {
        try {
            console.log("Starting login validation for email:", email);
            
            if (!email || !password) {
                throw new Error("Please provide both email and password");
            }

            // First check in doctorsignups collection
            const doctor = await doctorSignup.findOne({ 
                email: { $regex: new RegExp(`^${email}$`, 'i') }
            });
            
            console.log("Doctor found in signup:", doctor ? "Yes" : "No");

            if (!doctor) {
                throw new Error("Invalid email or password");
            }

            // Get sensitive data from IPFS
            console.log("Retrieving sensitive data from IPFS");
            const sensitiveData = await IPFSService.retrieveAndDecrypt(
                doctor.ipfsCID,
                doctor.ipfsIV
            );

            console.log("Sensitive data retrieved:", sensitiveData ? "Yes" : "No");

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, sensitiveData.password);
            console.log("Password validation result:", isPasswordValid);

            if (!isPasswordValid) {
                throw new Error("Invalid email or password");
            }

            // Check if doctor exists in adddoctor collection
            let addedDoctor = await adddoctorModel.findOne({ 
                email: { $regex: new RegExp(`^${email}$`, 'i') }
            });

            // Return the appropriate doctor object
            return {
                _id: doctor._id,
                fullName: doctor.fullName,
                email: doctor.email,
                specialization: sensitiveData.specialization,
                walletAddress: sensitiveData.walletAddress,
                ipfsCID: doctor.ipfsCID,
                ipfsIV: doctor.ipfsIV,
                isProfileComplete: !!addedDoctor
            };

        } catch (error) {
            console.error("Login validation error:", error);
            throw error;
        }
    },

    generateToken: (doctorId) => {
        return jwt.sign(
            { 
                id: doctorId,
                role: 'doctor'
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );
    },

    createDoctorLogin: async (doctorLoginData) => {
        try {
            const doctorLogin = await doctorLogin.create(doctorLoginData);
            return doctorLogin;
        } catch (error) {
            throw new Error("Failed to create doctor login: " + error.message);
        }
    }
};

const createdDoctor = {
    validateDoctorData: async (doctorData, userRole) => {
        try {
            // First check if doctor exists in doctorSignup collection
            const signedUpDoctor = await doctorSignup.findOne({ email: doctorData.email });
            
            // For non-admin roles, require doctor to exist in signup
            if (userRole !== 'admin' && !signedUpDoctor) {
                throw new Error("Doctor must be signed up first");
            }

            // Check additional required fields
            const additionalFields = [
                'specialization', 'availability', 
                'qualification', 'address', 'bio'
            ];
            
            const missingFields = additionalFields.filter(field => !doctorData[field]);
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // Handle contact number
            let contactnumber = doctorData.contactnumber;
            if (!contactnumber && signedUpDoctor) {
                contactnumber = signedUpDoctor.contactNumber;
            }
            if (!contactnumber) {
                throw new Error("Contact number is required");
            }

            // Validate contact number format
            if (!/^\d{10}$/.test(contactnumber)) {
                throw new Error("Contact number must be exactly 10 digits");
            }

            // Check if already added to adddoctorModel
            const existEmail = await adddoctorModel.findOne({ email: doctorData.email });
            if (existEmail) {
                throw new Error("Doctor profile already exists");
            }

            // Basic data that will always be included
            let returnData = {
                fullName: doctorData.fullName,
                email: doctorData.email,
                specialization: doctorData.specialization,
                experience: doctorData.experience || 0,
                availability: doctorData.availability,
                contactnumber: contactnumber,
                qualification: doctorData.qualification,
                address: doctorData.address,
                bio: doctorData.bio,
                profileimage: doctorData.profileimage || null
            };

            // Only include signup data if doctor exists in signup database
            if (signedUpDoctor) {
                returnData = {
                    ...returnData,
                    password: signedUpDoctor.password,
                    medicalLicenseNumber: signedUpDoctor.medicalLicenseNumber,
                    medicalDocument: signedUpDoctor.medicalDocument,
                    walletAddress: signedUpDoctor.walletAddress,
                    gender: signedUpDoctor.gender,
                    dateOfBirth: signedUpDoctor.dateOfBirth,
                    age: signedUpDoctor.age,
                    hospitalClinicName: signedUpDoctor.hospitalClinicName
                };
            } else {
                // For new doctors, set default values for required fields
                returnData = {
                    ...returnData,
                    password: doctorData.password || null,
                    medicalLicenseNumber: doctorData.medicalLicenseNumber || null,
                    medicalDocument: doctorData.medicalDocument || null,
                    walletAddress: doctorData.walletAddress || null,
                    gender: doctorData.gender || null,
                    dateOfBirth: doctorData.dateOfBirth || null,
                    age: doctorData.age || null,
                    hospitalClinicName: doctorData.hospitalClinicName || null
                };
            }

            return returnData;
        } catch (error) {
            throw error;
        }
    },

    saveDoctor: async (validatedDoctorData) => {
        try {
            // Create MongoDB document with basic data
            const mongoData = {
                fullName: validatedDoctorData.fullName,
                email: validatedDoctorData.email,
                specialization: validatedDoctorData.specialization,
                experience: validatedDoctorData.experience,
                availability: validatedDoctorData.availability,
                contactnumber: validatedDoctorData.contactnumber,
                qualification: validatedDoctorData.qualification,
                address: validatedDoctorData.address,
                bio: validatedDoctorData.bio,
                profileimage: validatedDoctorData.profileimage
            };

            // If we have signup data, include it
            if (validatedDoctorData.password) {
                mongoData.password = validatedDoctorData.password;
                mongoData.medicalLicenseNumber = validatedDoctorData.medicalLicenseNumber;
                mongoData.medicalDocument = validatedDoctorData.medicalDocument;
                mongoData.walletAddress = validatedDoctorData.walletAddress;
                mongoData.gender = validatedDoctorData.gender;
                mongoData.dateOfBirth = validatedDoctorData.dateOfBirth;
                mongoData.age = validatedDoctorData.age;
                mongoData.hospitalClinicName = validatedDoctorData.hospitalClinicName;
            }

            // Create doctor in MongoDB
            const doctor = await adddoctorModel.create(mongoData);

            // Store data in IPFS only if we have signup data
            if (validatedDoctorData.password) {
                const allData = {
                    // Basic info
                    fullName: validatedDoctorData.fullName,
                    email: validatedDoctorData.email,
                    password: validatedDoctorData.password,
                    
                    // Additional info
                    specialization: validatedDoctorData.specialization,
                    experience: validatedDoctorData.experience,
                    availability: validatedDoctorData.availability,
                    contactnumber: validatedDoctorData.contactnumber,
                    qualification: validatedDoctorData.qualification,
                    address: validatedDoctorData.address,
                    bio: validatedDoctorData.bio,
                    profileimage: validatedDoctorData.profileimage,
                    
                    // Original signup data
                    medicalLicenseNumber: validatedDoctorData.medicalLicenseNumber,
                    medicalDocument: validatedDoctorData.medicalDocument,
                    walletAddress: validatedDoctorData.walletAddress,
                    gender: validatedDoctorData.gender,
                    dateOfBirth: validatedDoctorData.dateOfBirth,
                    age: validatedDoctorData.age,
                    hospitalClinicName: validatedDoctorData.hospitalClinicName
                };

                // Upload all data to IPFS
                const ipfsResult = await IPFSService.uploadEncryptedData(allData);
                console.log("IPFS Result:", ipfsResult);

                // Update doctor with IPFS data
                const updatedDoctor = await adddoctorModel.findByIdAndUpdate(
                    doctor._id,
                    { 
                        ipfsCID: ipfsResult.cid,
                        ipfsIV: ipfsResult.iv
                    },
                    { new: true }
                );

                if (!updatedDoctor) {
                    throw new Error("Failed to create doctor record");
                }

                console.log("Updated Doctor with IPFS:", updatedDoctor);
                return updatedDoctor;
            }

            return doctor;
        } catch (error) {
            console.error('Error in saveDoctor:', error);
            throw error;
        }
    }
};

const doctorManagementService = {
    getDoctors: async (filters) => {
        try {
            const { specialization, fullName } = filters;
            let query = {};
            if (specialization) {
                query.specialization = { $regex: new RegExp(specialization, 'i') };
            }
            if (fullName) {
                query.fullName = { $regex: new RegExp(fullName, 'i') };
            }
                const doctors = await adddoctorModel.find(query)
                .select('profileimage fullName specialization experience availability contactnumber email qualification address bio').sort({createdAt:-1})
                .lean();

            if (doctors.length === 0) {
                console.log('No doctors found with the given filters');
                return [];
            }

            console.log(`Found ${doctors.length} doctors`);
            return doctors;
        } catch (error) {
            console.error('Error in getDoctors service:', error);
            throw new Error(`Failed to fetch doctors: ${error.message}`);
        }
    },

    updateDoctor: async (email, updateData) => {
        try {
            const cleanEmail = email.toLowerCase().trim();
            console.log('Updating doctor with email:', cleanEmail);
            console.log('Update data received:', updateData);

            const doctor = await adddoctorModel.findOne({ email: cleanEmail });
            if (!doctor) throw new Error("Doctor not found");

            // Remove email from updateData to prevent accidental change
            delete updateData.email;

            // Format specialization to remove 'ist' suffix if present
            let specialization = updateData.specialization || doctor.specialization;
            if (typeof specialization === 'string' && specialization.toLowerCase().endsWith('ist')) {
                // Convert 'Cardiologist' -> 'Cardiology', 'Neurologist' -> 'Neurology', etc.
                if (specialization.toLowerCase() === 'cardiologist') specialization = 'Cardiologist';
                else if (specialization.toLowerCase() === 'neurologist') specialization = 'Neurologist';
                else if (specialization.toLowerCase() === 'dermatologist') specialization = 'Dermatologist';
                else if (specialization.toLowerCase() === 'orthopedics') specialization = 'Orthopedics';
                else specialization = specialization.slice(0, -3) + 'y';
            }

            // Clean and validate the data
            const insensitiveData = {
                fullName: updateData.fullName || doctor.fullName,
                specialization: specialization,
                department: specialization, // Use the same formatted specialization
                experience: parseInt(updateData.experience) || doctor.experience,
                availability: updateData.availability || doctor.availability,
                contactnumber: updateData.contactnumber || doctor.contactnumber,
                qualification: updateData.qualification || doctor.qualification,
                address: updateData.address || doctor.address,
                bio: updateData.bio || doctor.bio
            };

            // Add profileimage only if it exists in updateData
            if (updateData.profileimage) {
                insensitiveData.profileimage = updateData.profileimage;
            }

            console.log('Data to update:', insensitiveData);

            // First update the doctor document
            const updatedDoctor = await adddoctorModel.findOneAndUpdate(
                { email: cleanEmail },
                { 
                    $set: insensitiveData,
                    $currentDate: { lastLoginAt: true, updatedAt: true }
                },
                { 
                    new: true,
                    runValidators: true
                }
            );

            if (!updatedDoctor) {
                throw new Error("Failed to update doctor");
            }

            console.log('Updated doctor:', updatedDoctor);

            // If there's sensitive data to update and IPFS is configured
            if (doctor.ipfsCID) {
                const sensitiveData = {
                    contactnumber: updateData.contactnumber || doctor.contactnumber,
                    profileimage: updateData.profileimage || doctor.profileimage,
                    qualification: updateData.qualification || doctor.qualification,
                    address: updateData.address || doctor.address,
                    bio: updateData.bio || doctor.bio,
                    specialization: specialization,
                    department: specialization
                };

                // Upload updated sensitive data to IPFS
                const ipfsResult = await IPFSService.uploadEncryptedData(sensitiveData);

                // Update IPFS references
                await adddoctorModel.findOneAndUpdate(
                    { email: cleanEmail },
                    { 
                        ipfsCID: ipfsResult.cid,
                        ipfsIV: ipfsResult.iv
                    },
                    { new: true }
                );
            }

            return updatedDoctor;
        } catch (error) {
            console.error('Error in updateDoctor service:', error);
            throw error;
        }
    },

    deleteDoctor: async (email) => {
        try {
            // Find and delete the doctor
            const doctor = await adddoctorModel.findOneAndDelete({ email });
            if (!doctor) {
                throw new Error("Doctor not found");
            }

            return doctor;
        } catch (error) {
            console.error('Error in deleteDoctor service:', error);
            throw error;
        }
    }
};

const addPatientToDoctor = async (doctorId, patientId) => {
    try {
        const doctor = await AddDoctor.findById(doctorId);
        if (!doctor) {
            throw new Error('Doctor not found');
        }

        await doctor.addPatient(patientId);
        
        return {
            success: true,
            message: 'Patient assigned to doctor successfully'
        };
    } catch (error) {
        throw new Error(`Error assigning patient to doctor: ${error.message}`);
    }
};

const getDoctorPatients = async (doctorId) => {
    try {
        const doctor = await AddDoctor.findById(doctorId)
            .populate('patients')
            .populate('appointments');
            
        if (!doctor) {
            throw new Error('Doctor not found');
        }

        return {
            success: true,
            data: {
                patients: doctor.patients,
                totalPatients: doctor.patients.length,
                appointments: doctor.appointments,
                totalAppointments: doctor.appointments.length
            }
        };
    } catch (error) {
        throw new Error(`Error fetching doctor's patients: ${error.message}`);
    }
};

const addAppointmentToDoctor = async (doctorId, appointmentId) => {
    try {
        const doctor = await AddDoctor.findById(doctorId);
        if (!doctor) {
            throw new Error('Doctor not found');
        }

        await doctor.addAppointment(appointmentId);
        
        return {
            success: true,
            message: 'Appointment added to doctor successfully'
        };
    } catch (error) {
        throw new Error(`Error adding appointment to doctor: ${error.message}`);
    }
};

const getDoctorDashboardData = async (doctorEmail) => {
    try {
        console.log('Looking for doctor with email:', doctorEmail);
        const doctor = await doctorLogin.findOne({ email: doctorEmail.toLowerCase().trim() });
        if (!doctor) {
            throw new Error('Doctor not found');
        }
        const appointmentQuery = { doctorId: doctor._id };
        const totalAppointments = await appointmentModel.countDocuments(appointmentQuery);
        const uniquePatients = await appointmentModel.distinct('patientId', appointmentQuery);
        const totalPatients = uniquePatients.length;
        const totalMedicalHistory = await medicalHistoryModel.countDocuments({ doctorId: doctor._id });

        const recentAppointments = await appointmentModel
            .find(appointmentQuery)
            .sort({ createdAt: -1 })
            .limit(2)
            .populate('patientId', 'fullName')
            .select('patientId appointmentTime status');

        // Format recent appointments
        const formattedAppointments = recentAppointments.map(apt => ({
            patientName: apt.patientId ? apt.patientId.fullName : 'Unknown Patient',
            time: apt.appointmentTime,
            status: apt.status
        }));

        return {
            success: true,
            data: {
                totalAppointments,
                totalPatients,
                totalMedicalHistory,
                recentAppointments: formattedAppointments,
                doctorInfo: {
                    fullName: doctor.fullName,
                    specialization: doctor.specialization,
                    email: doctor.email
                }
            }
        };
    } catch (error) {
        console.log('Error in getDoctorDashboardData:', error.message);
        throw new Error(`Error fetching doctor dashboard data: ${error.message}`);
    }
};

module.exports = {
    doctorSignupService,
    doctorLoginService,
    createdDoctor,
    doctorManagementService,
    addPatientToDoctor,
    getDoctorPatients,
    addAppointmentToDoctor,
    getDoctorDashboardData
};