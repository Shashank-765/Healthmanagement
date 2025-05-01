const mongoose = require('mongoose');

const medicalHistorySchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'addpatient',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'adddoctor',
        required: true
    },
    date: {
        type: Date,
    },
    condition: {
        type: String,
    },
    medications: {
        type: String,
    },
    followUpDate: {
        type: Date,
    },
    notes: {
        type: String,
    },
    department: {
        type: String,
    },
    visitTime: {
        type: String,
    },
    recoveryDate: {
        type: Date
    }
}, {
    timestamps: true
});

const medicalHistoryModel = mongoose.model('medicalHistory', medicalHistorySchema);

module.exports = medicalHistoryModel; 