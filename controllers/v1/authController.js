import bcrypt from "bcryptjs";
import jwt from 'jsonwebtoken';
import { OAuth2Client } from "google-auth-library";
import User from "../../models/User.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

export const register = async (req, res) => {
  const { name, email, password, startupType } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      startupType,
      provider: "local",
    });

    const token = generateToken(newUser._id);
    res.status(201).json({ token, user: newUser });
  } catch (err) {
    res.status(500).json({ message: "Register error", error: err.message });
  }
};


export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.provider !== "local") {
      return res.status(404).json({ message: "User not found or invalid login method" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid information provide" });

    const token = generateToken(user._id);
    
    // Set HTTP-only cookies
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'PROD',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });
    
    res.cookie('userData', JSON.stringify({
      id: user._id,
      email: user.email,
      name: user.name,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'PROD',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });
    
    res.status(200).json({ 
      success: true,
      token, 
      user
    });
  } catch (err) {
    res.status(500).json({ message: "Login error", error: err.message });
  }
};

export const googleLogin = async (req, res) => {
  const { tokenId } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name, sub: googleId } = ticket.getPayload();

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId,
        provider: "google",
      });
    }

    const token = generateToken(user._id);
    res.status(200).json({ token, user });
  } catch (err) {
    res.status(500).json({ message: "Google login failed", error: err.message });
  }
};


export const verifyEmail = async (req, res) => {
  const { email } = req.body;
  
  try {
    // Check if email is provided
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "Email is required" 
      });
    }

    const user = await User.findOne({ email, provider: "local" });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Email not found or invalid account type" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Email verified successfully",
      userId: user._id 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Email verification error", 
      error: err.message 
    });
  }
};

export const updatePassword = async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  try {
    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Email, password, and confirm password are required" 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Password and confirm password do not match" 
      });
    }

if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 6 characters long" 
      });
    }

    const user = await User.findOne({ email, provider: "local" });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found or invalid account type" 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.findByIdAndUpdate(user._id, { 
      password: hashedPassword 
    });

    res.status(200).json({ 
      success: true, 
      message: "Password updated successfully" 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Password update error", 
      error: err.message 
    });
  }
}