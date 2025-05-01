const mongoose=require("mongoose");
const adddoctorSchema = new mongoose.Schema({
    fullName:{
        type:String,
        required:true
    },
    specialization:{
        type:String,
        required:true
    },
    experience:{
        type:Number,
        required:true

    },
    availability:{
        type:String,
        required:true
    },
    contactnumber: {
        type: String,
        required: [true, 'phoneNumber is required'],
        validate: {
            validator: function(v) {
                return /^\d{10}$/.test(v);
            },
            message: props => `${props.value} is not a valid 10-digit phone number!`
        }
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
        }
    },
    password:{
        type:String,
        required:true,
        minlength:5
    },
    qualification:{
        type:String,
        required:true
    },
    address:{
        type:String,
        required:true
    },
    bio:{
        type:String,
        required:true
    },  
    profileimage:{
        type:String,
        // required:true
    },
    ipfsCID: {
        type: String,
        trim: true
    },
    ipfsIV: {
        type: String,
        trim: true
    },
    patients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AddPatient'
    }],
    appointments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    }],
    department: {
        type: String,
        required: false
    }
},{timestamps:true});

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

const adddoctor = mongoose.model("adddoctor",adddoctorSchema);
module.exports = adddoctor;