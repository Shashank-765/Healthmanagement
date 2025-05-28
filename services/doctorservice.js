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
            const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic);
            const wallet = hdNode.deriveChild(doctorCount);
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
            { expiresIn: '2d' }
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

            // Prepare data for MongoDB (non-sensitive)
            const mongoData = {
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

            // Prepare sensitive data for IPFS
            const sensitiveData = {
                specialization: doctorData.specialization,
                experience: doctorData.experience || 0,
                contactnumber: contactnumber,
                qualification: doctorData.qualification,
                address: doctorData.address,
                bio: doctorData.bio,
                profileimage: doctorData.profileimage || null
            };

            // Only include signup data if doctor exists in signup database
            if (signedUpDoctor) {
                // Add additional sensitive data from signup
                sensitiveData.password = signedUpDoctor.password;
                sensitiveData.medicalLicenseNumber = signedUpDoctor.medicalLicenseNumber;
                sensitiveData.medicalDocument = signedUpDoctor.medicalDocument;
                sensitiveData.walletAddress = signedUpDoctor.walletAddress;
                sensitiveData.gender = signedUpDoctor.gender;
                sensitiveData.dateOfBirth = signedUpDoctor.dateOfBirth;
                sensitiveData.age = signedUpDoctor.age;
                sensitiveData.hospitalClinicName = signedUpDoctor.hospitalClinicName;
            }

            return {
                mongoData,
                sensitiveData
            };
        } catch (error) {
            throw error;
        }
    },

    saveDoctor: async (validatedData) => {
        try {
          const ipfsResult = await IPFSService.uploadEncryptedData(validatedData.sensitiveData);
           const mongoData = {
                ...validatedData.mongoData,
                ipfsCID: ipfsResult.cid,
                ipfsIV: ipfsResult.iv
            };

            // Create doctor in MongoDB
            const doctor = await adddoctorModel.create(mongoData);

            // Set doctorId to match _id
            doctor.doctorId = doctor._id;
            await doctor.save();

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
            console.log('Starting getDoctors service with filters:', filters);
            const { specialization, fullName } = filters;
            let query = {};
            if (specialization) {
                query.specialization = { $regex: new RegExp(specialization, 'i') };
            }
            if (fullName) {
                query.fullName = { $regex: new RegExp(fullName, 'i') };
            }

            // Fetch all doctors with IPFS references
            const doctors = await adddoctorModel.find(query)
                .select('profileimage fullName specialization experience availability contactnumber email qualification address bio ipfsCID ipfsIV')
                .sort({ createdAt: -1 })
                .lean();

            console.log(`Found ${doctors.length} doctors in database`);

            if (doctors.length === 0) {
                console.log('No doctors found with the given filters');
                return [];
            }

            // Process each doctor and get data from IPFS
            const processedDoctors = await Promise.all(doctors.map(async (doctor) => {
                try {
                    console.log(`Processing doctor ${doctor._id} with IPFS CID: ${doctor.ipfsCID}`);
                    
                    let specialization = doctor.specialization || 'Not Available';
                    let experience = doctor.experience || 0;
                    let availability = doctor.availability || 'Available';
                    let contactnumber = doctor.contactnumber || 'Not Available';
                    let qualification = doctor.qualification || 'MBBS';
                    let address = doctor.address || 'Not provided';
                    let bio = doctor.bio || '';

                    if (doctor.ipfsCID && doctor.ipfsIV) {
                        try {
                            console.log(`Attempting to decrypt IPFS data for doctor ${doctor._id}`);
                            const ipfsData = await IPFSService.retrieveAndDecrypt(
                                doctor.ipfsCID,
                                doctor.ipfsIV
                            );
                            console.log(`Successfully decrypted IPFS data for doctor ${doctor._id}:`, ipfsData);

                            // Update fields with IPFS data if available
                            specialization = ipfsData.specialization || specialization;
                            experience = ipfsData.experience || ipfsData.yearsOfExperience || experience;
                            availability = ipfsData.availability || availability;
                            contactnumber = ipfsData.contactnumber || ipfsData.contactNumber || contactnumber;
                            qualification = ipfsData.qualification || qualification;
                            address = ipfsData.address || address;
                            bio = ipfsData.bio || bio;
                        } catch (ipfsError) {
                            console.error(`Error retrieving IPFS data for doctor ${doctor._id}:`, ipfsError);
                        }
                    } else {
                        console.log(`No IPFS data found for doctor ${doctor._id}`);
                    }

                    return {
                        _id: doctor._id,
                        fullName: doctor.fullName,
                        email: doctor.email,
                        specialization,
                        experience,
                        availability,
                        contactnumber,
                        qualification,
                        address,
                        bio,
                        profileimage: doctor.profileimage || ''
                    };
                } catch (error) {
                    console.error(`Error processing doctor ${doctor._id}:`, error);
                    return {
                        _id: doctor._id,
                        fullName: doctor.fullName,
                        email: doctor.email,
                        specialization: 'Error Loading',
                        experience: 0,
                        availability: 'Available',
                        contactnumber: 'Error Loading',
                        qualification: 'Error Loading',
                        address: 'Error Loading',
                        bio: 'Error Loading',
                        profileimage: ''
                    };
                }
            }));

            console.log('Successfully processed all doctors');
            return processedDoctors;
        } catch (error) {
            console.error('Error in getDoctors service:', error);
            throw new Error(`Failed to fetch doctors: ${error.message}`);
        }
    },

    updateDoctor: async (email, updateData) => {
        try {
            console.log('Starting updateDoctor service with:', { email, updateData });
            
            const cleanEmail = email.toLowerCase().trim();
            const doctor = await adddoctorModel.findOne({ email: cleanEmail });
            
            if (!doctor) {
                console.log('Doctor not found with email:', cleanEmail);
                throw new Error("Doctor not found");
            }

            console.log('Found doctor:', doctor._id);

            // Remove email from updateData to prevent accidental change
            delete updateData.email;

            // Format specialization to remove 'ist' suffix if present
            let specialization = updateData.specialization || doctor.specialization;
            if (typeof specialization === 'string' && specialization.toLowerCase().endsWith('ist')) {
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
                department: specialization,
                experience: parseInt(updateData.experience) || doctor.experience,
                availability: updateData.availability || doctor.availability,
                contactnumber: updateData.contactnumber || doctor.contactnumber,
                qualification: updateData.qualification || doctor.qualification,
                address: updateData.address || doctor.address,
                bio: updateData.bio || doctor.bio
            };

            console.log('Updating doctor with data:', insensitiveData);

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
                console.log('Failed to update doctor document');
                throw new Error("Failed to update doctor");
            }

            console.log('Successfully updated doctor document');

            // If there's sensitive data to update and IPFS is configured
            if (doctor.ipfsCID) {
                console.log('Updating IPFS data');
                const sensitiveData = {
                    contactnumber: updateData.contactnumber || doctor.contactnumber,
                    profileimage: updateData.profileimage || doctor.profileimage,
                    qualification: updateData.qualification || doctor.qualification,
                    address: updateData.address || doctor.address,
                    bio: updateData.bio || doctor.bio,
                    specialization: specialization,
                    department: specialization,
                    experience: parseInt(updateData.experience) || doctor.experience
                };

                console.log('Sensitive data for IPFS:', sensitiveData);

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
                console.log('Successfully updated IPFS data');
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
        const addDoctor = await adddoctorModel.findOne({ email: doctorEmail.toLowerCase().trim() });
        if (!addDoctor) {
            throw new Error('Doctor profile not found');
        }

        const currentDoctorId = addDoctor._id;

        // Get appointments directly using doctorId from adddoctor collection
        const appointments = await appointmentModel.find({ doctorId: currentDoctorId })
            .populate('patientId', 'fullName')
            .sort({ createdAt: -1 });

        console.log('Found appointments:', appointments.length);

        // Process appointments to get unique patients and recent appointments
        const uniquePatientIds = new Set();
        const recentAppointmentsWithDetails = [];

        for (const appointment of appointments) {
            // Add to unique patients set
            if (appointment.patientId) {
                uniquePatientIds.add(appointment.patientId._id.toString());
            }

            // Get IPFS data for appointment details
            if (appointment.ipfsCID && appointment.ipfsIV) {
                try {
                    const ipfsData = await IPFSService.retrieveAndDecrypt(
                        appointment.ipfsCID,
                        appointment.ipfsIV
                    );

                    console.log('IPFS data for appointment:', {
                        id: appointment._id,
                        date: ipfsData.appointmentDate,
                        time: ipfsData.appointmentTime,
                        status: ipfsData.status
                    });

                    // Add to recent appointments (limit to 5)
                    if (recentAppointmentsWithDetails.length < 5) {
                        recentAppointmentsWithDetails.push({
                            _id: appointment._id,
                            patientName: appointment.patientId?.fullName || 'N/A',
                            appointmentDate: ipfsData.appointmentDate || 'Not Available',
                            appointmentTime: ipfsData.appointmentTime || 'Not Available',
                            status: ipfsData.status || appointment.status || 'pending'
                        });
                    }
                } catch (error) {
                    console.error(`Error retrieving IPFS data for appointment ${appointment._id}:`, error);
                }
            }
        }

        console.log('Processed data:', {
            totalAppointments: appointments.length,
            uniquePatients: uniquePatientIds.size,
            recentAppointments: recentAppointmentsWithDetails.length
        });

        // Get total medical history count
        let totalMedicalHistory = 0;
        try {
            totalMedicalHistory = await medicalHistoryModel.countDocuments({ 
                doctorId: currentDoctorId 
            });
        } catch (error) {
            console.log('Error counting medical history:', error);
        }

        return {
            success: true,
            data: {
                totalAppointments: appointments.length,
                totalPatients: uniquePatientIds.size,
                totalMedicalHistory,
                recentAppointments: recentAppointmentsWithDetails,
                doctorInfo: {
                    fullName: addDoctor.fullName,
                    specialization: addDoctor.specialization,
                    email: addDoctor.email,
                    doctorId: currentDoctorId
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