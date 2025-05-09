// const mongoose = require('mongoose');

// const appointmentSchema = new mongoose.Schema({
//   patientId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'AddPatient',
//     required: true,
//   },
//   doctorId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'adddoctor',
//     required: true,
//   },
//   appointmentDate: {
//     type: Date,
//     required: true,
//   },
//   },
//   status: {
//     type: String,
//     enum: ['confirm', 'pending', 'cancelled'],
//     default: 'pending',
//   },
//   reason: {
//     type: String,
//     required: true,
//   },
// }, { timestamps: true });

// module.exports = mongoose.model('Appointment', appointmentSchema);









const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AddPatient',
    // required: true,
  },
  patientEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'adddoctor',
    // required: true,
  },
  doctorEmail: {
    type: String,
    // required: true,
    lowercase: true,
    trim: true,
  },
  appointmentDate: {
    type: Date,
    required: false,
  },
  appointmentTime: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ['confirm', 'pending', 'cancelled'],
    default: 'pending',
  },
  ipfsCID: {
    type: String,
    required: true,
  },
  ipfsIV: {
    type: String,
    required: true,
  }
}, { timestamps: true });

// Add indexes for better query performance
appointmentSchema.index({ patientEmail: 1 });
appointmentSchema.index({ doctorEmail: 1 });
appointmentSchema.index({ status: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);