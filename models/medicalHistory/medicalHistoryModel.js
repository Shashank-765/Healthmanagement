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
        // required: true
    },
    doctorName: {
        type: String,
        // required: true
    },
    uuid: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    condition: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true,
    },
    ipfsCID: {
        type: String,
        required: true
    },
    ipfsIV: {
        type: String,
        required: true
    },
    department: {
        type: String,
        trim: true
    },
    version: {
        type: Number,
        default: 1,
        min: 1
    },
    hl: {
        previousCID: {
            type: String,
            default: null,
            trim: true
        },
        previousIV: {
            type: String,
            default: null,
            trim: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Add indexes for better query performance
medicalHistorySchema.index({ patientId: 1, createdAt: -1 });
// medicalHistorySchema.index({ doctorId: 1, createdAt: -1 });
medicalHistorySchema.index({ patientId: 1, version: -1 });

// Add a pre-save middleware to generate UUID if not present
medicalHistorySchema.pre('save', function(next) {
    if (!this.uuid) {
        this.uuid = this._id.toString();  // Use _id as UUID for existing records
    }
    next();
});

// Add a pre-find middleware to validate ObjectIds
medicalHistorySchema.pre('find', function() {
    if (this._conditions._id && !mongoose.Types.ObjectId.isValid(this._conditions._id)) {
        throw new Error('Invalid ObjectId in query');
    }
});

// Add a method to validate the record
medicalHistorySchema.methods.validateRecord = function() {
    if (!this.patientId || !this.ipfsCID || !this.ipfsIV) {
        throw new Error('Invalid medical history record: Missing required fields');
    }
    return true;
};

const MedicalHistory = mongoose.model("MedicalHistory", medicalHistorySchema);
module.exports = MedicalHistory; 