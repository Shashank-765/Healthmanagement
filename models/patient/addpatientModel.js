// const mongoose = require("mongoose");

// const addpatientSchema = new mongoose.Schema({
//     fullName: {
//         type: String,
//         required: true
//     },
//     email: {
//         type: String,
//         required: [true, 'email is required'],
//         unique: true,
//         lowercase: true,
//         trim: true,
//         validate: {
//             validator: function(v) {
//                 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
//             },
//             message: props => `${props.value} is not a valid email!`
//         }
//     },
//     medicalCondition: {
//         type: String,
//         required: true
//     },
//     admitDate: {
//         type: Date,
//         required: true
//     },
//     medicalDocument: {
//         type: String,
//         required: [true, 'Medical document is required']
//     },
//     roomNumber: {
//         type: Number,
//         required: true
//     },
//     assignedDoctor: {
//         type: String,
//         required: [true, 'Assigned doctor is required']
//     },
//     medicalHistory: {
//         type: String,
//         required: [true, 'Medical history is required']
//     },
//     ipfsCID: {
//         type: String,
//         required: true
//     },
//     ipfsIV: {
//         type: String,
//         required: true
//     },
//     appointments: [{
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Appointment'
//     }],
//     primaryDoctor: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Doctor'
//     }
// }, { timestamps: true });

// const AddPatient = mongoose.model("AddPatient", addpatientSchema);

// module.exports = AddPatient;







const mongoose = require("mongoose");

const addpatientSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: [true, 'email is required'],
        unique: true,  // This ensures email uniqueness
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email!`
        },
        index: true  // Add index for better query performance
    },
    // ... other existing fields ...
    
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }],
    primaryDoctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'adddoctor'  // Make sure this matches your doctor model name
    },
    // Add this method to help manage appointments
    lastLoginAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Add methods to manage appointments
addpatientSchema.methods.addAppointment = async function(appointmentId) {
    if (!this.appointments.includes(appointmentId)) {
        this.appointments.push(appointmentId);
        await this.save();
    }
};

// Add a pre-save hook to ensure email is always lowercase
addpatientSchema.pre('save', function(next) {
    this.email = this.email.toLowerCase();
    next();
});

const AddPatient = mongoose.model("AddPatient", addpatientSchema);
module.exports = AddPatient;
