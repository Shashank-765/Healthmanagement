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
    experience: {
        type: Number,
        default: 0
    },
    availability: {
        type: String,
        default: 'Available'
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
    emergencyContact: {
        type: [String],
        default: [],
        validate: {
            validator: function(contacts) {
                return contacts.every(contact => 
                    /^\d{10}$/.test(contact) 
                );
            },
            message: 'Emergency contact must be exactly 10 digits'
        }
    },
    patients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient'
    }],
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }],
    ratings: [
        {
            rating: { type: Number, min: 1, max: 5 },
            comment: { type: String },
            date: { type: Date, default: Date.now },
            patient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AddPatient', required: true },
            ipfsCID: { type: String },
            ipfsIV: { type: String }
        }
    ],
    lastLoginAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true, versionKey: false });
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