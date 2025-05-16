const mongoose = require('mongoose');
const { Schema } = mongoose;

const loginSchema = new Schema({
    email: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        // required: true
    },
    token: { 
        type: String, 
        // required: true 
    },
    loginTime: {
        type: Date,
        default: Date.now
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'Signup',
        // required: true
    }
});

const Login = mongoose.model("insuranceLogin", loginSchema);
module.exports = Login;