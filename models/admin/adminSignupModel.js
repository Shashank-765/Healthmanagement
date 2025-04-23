const mongoose = require('mongoose');

const adminSignupSchema = new mongoose.Schema({
    // Basic Information
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
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
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long']
    },
    contactNumber: {
        type: String,
        required: [true, 'Contact number is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
    },

    // Hospital Information
    hospitalName: {
        type: String,
        required: [true, 'Hospital name is required'],
        trim: true
    },
    totalHospitals: {
        type: Number,
        required: [true, 'Total number of hospitals is required'],
        min: [1, 'Total hospitals must be at least 1']
    },
    totalBeds: {
        type: Number,
        required: [true, 'Total number of beds is required'],
        min: [1, 'Total beds must be at least 1']
    },

    // Staff Information
    staffInformation: {
        nurses: {
            type: Number,
            required: [true, 'Number of nurses is required'],
            min: [0, 'Number of nurses cannot be negative']
        },
        receptionists: {
            type: Number,
            required: [true, 'Number of receptionists is required'],
            min: [0, 'Number of receptionists cannot be negative']
        },
        otherStaff: {
            type: Number,
            required: [true, 'Number of other staff is required'],
            min: [0, 'Number of other staff cannot be negative']
        }
    },

    // Role (always set to 'admin')

    // IPFS Data
    // ipfsCID: {
    //     type: String,
    //     trim: true
    // },
    // ipfsIV: {
    //     type: String,
    //     trim: true
    // }
}, { 
    timestamps: true,
    versionKey: false 
});

const AdminSignup = mongoose.model('AdminSignup', adminSignupSchema);

module.exports = AdminSignup;
