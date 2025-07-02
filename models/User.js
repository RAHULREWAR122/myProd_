import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String, 
  provider: { type: String, default: "local" }, 
  googleId: String,
  startupType: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
export default User;