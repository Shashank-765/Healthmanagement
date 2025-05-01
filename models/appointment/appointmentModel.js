const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AddPatient',
    required: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'adddoctor',
    required: true,
  },
  appointmentDate: {
    type: Date,
    required: true,
  },
  appointmentTime: {
    type: String,
    required: true,
    validate: {
      validator: function (value) {
       return /^([1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(value);
      },
      message: 'appointmentTime must be in the format "HH:MM AM/PM" (e.g., "10:30 AM")',
    },
  },
  status: {
    type: String,
    enum: ['confirm', 'pending', 'cancelled'],
    default: 'pending',
  },
  reason: {
    type: String,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
