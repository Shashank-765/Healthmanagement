const mongoose = require('mongoose');

const patientSignupSchema = new mongoose.Schema({
    // Basic Information
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    gender: {
        type: String,
        // required: [true, 'Gender is required'],
        enum: ['Male', 'Female', 'Other']
    },
    dateOfBirth: {
        type: Date,
        // required: [true, 'Date of birth is required']
    },
    age: {
        type: Number,
        default: function() {
            if (this.dateOfBirth) {
                const today = new Date();
                const birthDate = new Date(this.dateOfBirth);
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                return age;
            }
            return null;
        }
    },
    phoneNumber: {
        type: String,
        // required: [true, 'phoneNumber is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
    },
    email: {
        type: String,
        required: [true, 'email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email!`
        }
    },
    password: {
        type: String,
        // required: [true, 'password is required'],
        minlength: [8, 'Password must be at least 8 characters long']
    },
    // Medical Information
    medicalDocument: {
        type: String,
        // required: [true, 'Medical document is required']
    },
    bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        // required: [true, 'Blood group is required']
    },
    emergencyContactNumber: {
        type: String,
        // required: [true, 'Emergency contact number is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
    },
    knownAllergies: {
        type: String,
        // required: [true, 'Known allergies information is required']
    },
    currentMedication: {
        type: String,
        // required: [true, 'Current medication information is required']
    },
    medicalHistory: {
        type: String,
        // required: [true, 'medicalHistory is required']
    },
    ipfsCID: {
        type: String,
        trim: true
    },
    ipfsIV: {
        type: String,
        trim: true
    }
}, {
    timestamps: true,
    versionKey:false
});

// Pre-save middleware to calculate age and generate wallet address
patientSignupSchema.pre('save', async function(next) {
    // Calculate age
    if (this.dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(this.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        this.age = age;
    }
    next();
});

// Drop the walletAddress index if it exists
const dropWalletAddressIndex = async () => {
    try {
        const collection = mongoose.connection.collection('patientsignups');
        const indexes = await collection.indexes();
        const walletAddressIndex = indexes.find(index => 
            index.key && index.key.walletAddress === 1
        );
        
        if (walletAddressIndex) {
            await collection.dropIndex('walletAddress_1');
            console.log('Successfully dropped walletAddress index');
        }
    } catch (error) {
        console.error('Error dropping walletAddress index:', error);
    }
};

// Call the function when the model is initialized
dropWalletAddressIndex();

const PatientSignup = mongoose.model('PatientSignup', patientSignupSchema);
module.exports = PatientSignup;
