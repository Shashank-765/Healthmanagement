const mongoose = require('mongoose');

const medicalHistorySchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient',
        required: true,
        validate: {
            validator: function(v) {
                return mongoose.Types.ObjectId.isValid(v);
            },
            message: props => `${props.value} is not a valid patient ID!`
        }
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'adddoctor',
        required: true,
        validate: {
            validator: function(v) {
                return mongoose.Types.ObjectId.isValid(v);
            },
            message: props => `${props.value} is not a valid doctor ID!`
        }
    },
    uuid: {
        type: String,
        unique: true,
        sparse: true,  // This allows null/undefined values
        index: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    condition: {
        type: String,
        trim: true,
        // required: [true, 'Condition is required']
    },
    notes: {
        type: String,
        trim: true,
        // required: [true, 'Notes are required']
    },
    ipfsCID: {
        type: String,
        required: true,
        trim: true
    },
    ipfsIV: {
        type: String,
        required: true,
        trim: true
    },
    department: {
        type: String,
        trim: true
    },
    version: {
        type: Number,
        default: 1
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
medicalHistorySchema.index({ doctorId: 1, createdAt: -1 });
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
    if (!this.patientId || !this.doctorId || !this.ipfsCID || !this.ipfsIV) {
        throw new Error('Invalid medical history record: Missing required fields');
    }
    return true;
};

const MedicalHistory = mongoose.model("MedicalHistory", medicalHistorySchema);
module.exports = MedicalHistory; 