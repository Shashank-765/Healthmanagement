const mongoose = require('mongoose');

const adminLoginSchema = new mongoose.Schema({
    email:{
        type:String,
        require:true,

    },
    password:{
        type:String,
        // required:true,
    },
    token:{
        type:String,
        // required:true,
    }
},{timestamps:true,
    versionKey: false 
});


const AdminLogin = mongoose.model('AdminLogin',adminLoginSchema);

module.exports = AdminLogin;
