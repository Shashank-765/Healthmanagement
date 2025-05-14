const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
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
    status: {
      type: String,
      enum: ['confirm', 'pending', 'cancelled'],
      default: 'pending',
    },
    ipfsCID: {
        type: String,
        required: true
    },
    ipfsIV: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Remove indexes that are no longer needed since fields are in IPFS
// appointmentSchema.index({ patientEmail: 1 });
// appointmentSchema.index({ doctorEmail: 1 });
// appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);