const mongoose = require('mongoose');

const doctorSignupSchema = new mongoose.Schema({
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
    ipfsCID: {
        type: String,
        trim: true
    },
    ipfsIV: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

const DoctorSignup = mongoose.model('DoctorSignup', doctorSignupSchema);
module.exports = DoctorSignup;
