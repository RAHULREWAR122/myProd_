import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config(); 
const mongo_uri = 'mongodb+srv://rrewar75:Rahul@cluster0.bain4cp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
const connectDB = async () => {
  try {
    // if (mongo_uri) {
    //   throw new Error("MONGO_URI not defined in environment variables");
    // }
    
    await mongoose.connect(mongo_uri); 

    console.log("✅ database connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

export default connectDB;