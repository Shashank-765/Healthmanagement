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
    // profileimage:{
    //     type:String,
    //     // required:true
    // }
},{timestamps:true});

const adddoctor = mongoose.model("adddoctor",adddoctorSchema);
module.exports = adddoctor;