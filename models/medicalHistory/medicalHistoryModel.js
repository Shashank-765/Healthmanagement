const mongoose = require('mongoose');

const medicalHistorySchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'adddoctor',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    condition: {
        type: String,
        required: true
    },
    notes: {
        type: String,
        required: true
    },
    department: {
        type: String,
    }
}, {
    timestamps: true
});

const medicalHistoryModel = mongoose.model('medicalHistory', medicalHistorySchema);

module.exports = medicalHistoryModel; 