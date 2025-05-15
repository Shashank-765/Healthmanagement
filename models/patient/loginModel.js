const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const patientLoginSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    token: {
        type: String,
        required: true
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, { 
    timestamps: true,
    versionKey: false
});

const PatientLogin = mongoose.model('PatientLogin', patientLoginSchema);

module.exports = PatientLogin;