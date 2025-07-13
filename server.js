// server.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
//import { Server } from 'socket.io';

import appRoutes from './app.js';
import connectDB from './config/mongo.js';
//import { connectRedis } from './config/redis.js';
//import { initSocket } from './utils/socketConnectionManger.js';
//import { Mutex } from './utils/mutexQueue.js';

//import RazorPay from 'razorpay';
//import stripe from 'stripe';
//import { Client, Environment } from 'square';

// Create express app and server
const app = express();
const httpServer = createServer(app);

// -------------------- MIDDLEWARE --------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:4000'],
  credentials: true,
}));

// -------------------- API ROUTES --------------------
app.use('/api', appRoutes);

app.get('/', (req, res) => {
  res.send('✅ Greeting backend is running!');
});

// -------------------- 404 HANDLER --------------------
app.use((req, res) => {
  return res.status(404).json({ message: '❌ Endpoint not found' });
});
// -------------------- GLOBAL ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error("❌ Global Error:", err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});
// -------------------- PAYMENT GATEWAY CONFIG --------------------
// export const RazorpayInstance = new RazorPay({
//   key_id: process.env.RAZORPAY_API_KEY,
//   key_secret: process.env.RAZORPAY_API_SECRET,
// });

// export const StripeInstance = stripe(process.env.STRIPE_API_KEY);

// export const SquareClient = new Client({
//   accessToken: process.env.SQUARE_ACCESS_TOKEN,
//   environment: Environment.Sandbox, // Or .Production depending on env
// });

// -------------------- SOCKET.IO --------------------
// global.io = new Server(httpServer, {
//   cors: {
//     origin: ['http://localhost:3000', 'http://localhost:4000'],
//     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//     credentials: true,
//   },
// });
// initSocket();

// -------------------- GLOBAL MUTEX INSTANCE --------------------
// global.consultationMutex = new Mutex();

// -------------------- GLOBAL DATA STORAGE (if needed) --------------------
export let clients = [];
export let facts = [];

// -------------------- SERVER INIT --------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    // await connectRedis();

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server (${process.env.NODE_ENV}) running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();