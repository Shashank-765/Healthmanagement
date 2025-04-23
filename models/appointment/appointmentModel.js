const appointmentSchema = new mongoose.Schema({
    // Common Fields
    appointmentId: {
      type: String,
      unique: true,
      required: true,
    },
    
    // Doctor Information
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true
    },
    doctorName: {
      type: String,
      required: true
    },
    department: {
      type: String,
      required: true
    },
    specialization: {
      type: String,
      required: true
    },
  
    // Patient Information
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true
    },
    patientName: {
      type: String,
      required: true
    },
    patientContact: {
      type: String,
      required: true
    },
    patientEmail: {
      type: String,
      required: true
    },
  
    // Appointment Details
    date: {
      type: Date,
      required: true
    },
    time: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed'],
      default: 'pending'
    },
    reason: {
      type: String,
      required: true
    },
  
    // Metadata
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  });
  
  // Auto-generate appointment ID before saving
  appointmentSchema.pre('save', async function(next) {
    if (this.isNew) {
      const date = new Date();
      const year = date.getFullYear();
      const count = await this.constructor.countDocuments();
      this.appointmentId = `APT-${year}-${(count + 1).toString().padStart(3, '0')}`;
    }
    this.updatedAt = new Date();
    next();
  });
  
  // Useful methods for appointment management
  appointmentSchema.methods = {
    // Confirm appointment
    confirm: function() {
      this.status = 'confirmed';
      return this.save();
    },
  
    // Cancel appointment
    cancel: function() {
      this.status = 'cancelled';
      return this.save();
    },
  
    // Complete appointment
    complete: function() {
      this.status = 'completed';
      return this.save();
    }
  };
  
  // Virtual fields for additional functionality
  appointmentSchema.virtual('isUpcoming').get(function() {
    return new Date(`${this.date} ${this.time}`) > new Date();
  });
  
  // Indexes for better query performance
  appointmentSchema.index({ status: 1 });
  appointmentSchema.index({ doctorId: 1 });
  appointmentSchema.index({ patientId: 1 });
  appointmentSchema.index({ date: 1 });