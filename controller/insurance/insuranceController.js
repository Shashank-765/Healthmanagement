const express=require("express");
const router=express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Login = require("../../models/insurance/loginModel");
const Signup = require("../../models/insurance/signupModel");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const upload = require('../../utils/multer');
module.exports = {
    insuranceSignup: async (req, res) => {
        const { name, phone, email, password, companyName, role } = req.body;
        const image = req.file ? req.file.path : null;

        // Basic manual validation
        if (!name || !phone || !email || !password || !companyName || !role || !image) {
            return res.status(400).json({ message: "All fields are required" });
        }

        try {
            const existingUser = await Signup.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User already exists" });
            }
            if (password.length < 8) {
                return res.status(400).json({ message: "Password must be at least 8 characters long" });
            }
            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = new Signup({
                name,
                phone,
                email,
                password: hashedPassword,
                companyName,
                role,
                image,
            });

            // Save user data in Signup model
            await newUser.save(); // Mongoose validation will run here

            res.status(201).json({ message: "Insurance registered successfully", Data: newUser });
        } catch (error) {
            console.error(error);

            // Handle Mongoose validation errors
            if (error.name === 'ValidationError') {
                const errors = {};
                for (let field in error.errors) {
                    errors[field] = error.errors[field].message;
                }
                return res.status(400).json({ message: "Validation error", errors });
            }

            // Handle any other errors
            res.status(500).json({ message: "Server error" });
        }
    },
  insuranceLogin: async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await Signup.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const existingLogin = await Login.findOne({ email: user.email });

        if (existingLogin) {
            existingLogin.token = token;
            existingLogin.loginTime = new Date();
            await existingLogin.save();
        } else {
           const newLogin = new Login({
                userId: user._id,
                email: user.email,
                token: token,
                loginTime: new Date(),
            });
            await newLogin.save();
        }

        res.status(200).json({ message: "Login successful", token, user });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: "Server error" });
    }
    }
}