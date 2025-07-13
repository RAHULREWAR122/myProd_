import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String, 
  provider: { type: String, default: "local" }, 
  googleId: String,
  profilePicture: { type: String, default: "https://res.cloudinary.com/dz1qj3x8h/image/upload/v1709301234/defaultProfilePicture.png" },

  verificationToken: String,

  startupType: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
export default User;