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
    }
}, { timestamps: true });

const PatientLogin = mongoose.model('PatientLogin', patientLoginSchema);

module.exports = PatientLogin;