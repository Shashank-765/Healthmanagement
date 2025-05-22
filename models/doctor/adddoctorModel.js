const mongoose = require("mongoose");

const adddoctorSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    fullName: {
        type: String
    },
    specialization: {
        type: String,
        enum: [
            'Cardiologist',
            'Neurologist',
            'Dermatologist',
            'General Medicine',
            'Orthopedics'
        ]
    },
    ipfsCID: {
        type: String
    },
    ipfsIV: {
        type: String
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
        },
        index: true
    },
    patients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient'
    }],
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }],
    lastLoginAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true, versionKey: false });

// Add pre-save middleware to ensure doctorId is set
adddoctorSchema.pre('save', function(next) {
    if (!this.doctorId) {
        this.doctorId = this._id;
    }
    next();
});

// Add pre-save hook to ensure email is always lowercase
adddoctorSchema.pre('save', function(next) {
    this.email = this.email.toLowerCase();
    next();
});

const adddoctor = mongoose.model("adddoctor", adddoctorSchema);
module.exports = adddoctor;