// const mongoose = require('mongoose');

// const notificationSchema = new mongoose.Schema({
//   recipientId: {
//     type: mongoose.Schema.Types.ObjectId,
//     required: true,
//     refPath: 'recipientModel'
//   },
//   recipientModel: {
//     type: String,
//     required: true,
//     enum: ['Doctor', 'Patient', 'Admin', 'Insurance'] 
//   },
//   patientId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Patient'
//   },
//   appointmentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Appointment'
//   },
//   title: {
//     type: String,
//     required: true
//   },
//   message: {
//     type: String,
//     required: true
//   },
//   read: {
//     type: Boolean,
//     default: false
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// module.exports = mongoose.model('Notification', notificationSchema);
