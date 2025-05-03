const mongoose = require('mongoose');

const insurancePatientSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    medicalHistory: [{
        condition: String,
        notes: String,
        date: Date,
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'adddoctor'
        }
    }],
    isVerified: {
        type: Boolean,
        default: false
    },
    hasAccess: {
        type: Boolean,
        default: false
    },
    accessRequested: {
        type: Boolean,
        default: false
    },
    requestDate: {
        type: Date
    },
    accessRequest: {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AddPatient'
        },
        patientName: String,
        insuranceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Signup'
        },
        insuranceName: String,
        status: {
            type: String,
            enum: ['pending', 'approved', 'denied'],
            default: 'pending'
        },
        requestDate: Date,
        approvalDate: Date,
        denialDate: Date,
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Signup'
        },
        deniedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Signup'
        }
    }
}, { timestamps: true });

const InsurancePatient = mongoose.model('InsurancePatient', insurancePatientSchema);
module.exports = InsurancePatient; 