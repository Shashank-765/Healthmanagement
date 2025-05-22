const mongoose = require("mongoose");

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
//         type: String
//     },
//     admitDate: {
//         type: Date
//     },
//     medicalDocument: {
//         type: String,
//         required: [true, 'Medical document is required']
//     },
//     roomNumber: {
//         type: Number
//     },
//     assignedDoctor: {
//         type: String
//     },
//     medicalHistory: {
//         type: String
//      },
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


const addpatientSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId
    },
    fullName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: [true, 'email is required'],
        lowercase: true,
        trim: true,
        validate: {
            validator: function(v) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: props => `${props.value} is not a valid email!`
        }
    },
    ipfsCID: {
        type: String
    },
    ipfsIV: {
        type: String
    },
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }],
    primaryDoctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor'
    }
}, { timestamps: true }, { versionKey: false });

// Add pre-save middleware to ensure patientId is set
addpatientSchema.pre('save', function(next) {
    if (!this.patientId) {
        this.patientId = this._id;
    }
    next();
});

const AddPatient = mongoose.model("AddPatient", addpatientSchema);
module.exports = AddPatient;