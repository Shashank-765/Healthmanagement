const mongoose = require("mongoose");

const adddoctorSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    fullName: {
        type: String,
        // required: true
    },
    specialization: {
        type: String,
        // required: [true, 'Specialization is required'],
        enum: [
            'Cardiologist',
            'Neurologist',
            'Dermatologist',
            'General Medicine',
            'Orthopedics'
        ]
    },
    department: {
        type: String
    },
    experience:{
        type:Number,
        // required:true
    },
    availability:{
        type:String,
        // required:true
    },
    contactnumber: {
        type: String,
        // required: [true, 'phoneNumber is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
    },
    qualification:{
        type:String,
        // required:true
    },
    address:{
        type:String,
        // required:true
    },
    bio:{
        type:String,
    },  
    profileimage:{
        type:String,
        // required:true
    },
    ipfsCID: {
        type: String,
        // required:true
    },
    ipfsIV: {
        type: String,
        // required:true
    },
    email: {
        type: String,
        required: [true, 'email is required'],
        unique: true,  
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email!`
        },
        index: true
    },
    patients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient'
    }],
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }],
    lastLoginAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true },{versionKey:false});

// Add pre-save middleware to ensure doctorId is set
adddoctorSchema.pre('save', function(next) {
    if (!this.doctorId) {
        this.doctorId = this._id;
    }
    next();
});

// Add pre-save hook to ensure email is always lowercase
adddoctorSchema.pre('save', function(next) {
    this.email = this.email.toLowerCase();
    next();
});

// Enhanced methods to manage appointments and patients
adddoctorSchema.methods.addPatient = async function(patientId) {
    if (!this.patients.includes(patientId)) {
        this.patients.push(patientId);
        await this.save();
    }
};

adddoctorSchema.methods.addAppointment = async function(appointmentId) {
    if (!this.appointments.includes(appointmentId)) {
        this.appointments.push(appointmentId);
        await this.save();
    }
};

const adddoctor = mongoose.model("adddoctor", adddoctorSchema);
module.exports = adddoctor;