const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type: String,
    required: true,
    index: true
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['Doctor', 'Patient', 'Admin', 'Insurance'] 
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient'
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

notificationSchema.index({ recipientId: 1, read: 1 });
notificationSchema.index({ recipientModel: 1, recipientId: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
