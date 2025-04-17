const mongoose = require('mongoose');

const doctorSignupSchema = new mongoose.Schema({
    // Basic Information
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    gender: {
        type: String,
        required: [true, 'Gender is required'],
        enum: ['Male', 'Female', 'Other']
    },
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required']
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
    medicalDocument: {
        type: String, // This will store the path to the uploaded file
        default: null,
        required: true
    },
    // Professional Information
    specialization: {
        type: String,
        required: [true, 'Specialization is required'],
        enum: [
            'Cardiology',
            'Dermatology',
            'Endocrinology',
            'Gastroenterology',
            'General Medicine',
            'Neurology',
            'Oncology',
            'Orthopedics',
            'Pediatrics',
            'Psychiatry',
            'Radiology',
            'Surgery',
            'Urology'
        ]
    },
    medicalLicenseNumber: {
        type: String,
        required: [true, 'Medical license number is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit license number!`
        }
    },
    yearsOfExperience: {
        type: Number,
        required: [true, 'Years of experience is required'],
        validate: {
            validator: function(v) {
                return v >= 0 && v <= 99;
            },
            message: 'Years of experience must be between 0 and 99'
        }
    },
    hospitalClinicName: {
        type: String,
        required: true,
        trim: true
    },
    walletAddress: {
        type: String,
        required: true,
        unique: true,
        trim: true
    }
}, {
    timestamps: true
});

// Pre-save middleware to calculate age
doctorSignupSchema.pre('save', function(next) {
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

const DoctorSignup = mongoose.model('DoctorSignup', doctorSignupSchema);

module.exports = DoctorSignup;
