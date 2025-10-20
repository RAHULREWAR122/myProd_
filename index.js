import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './config/mongo.js';
import routes from './app.js'
import cookieParser from 'cookie-parser'
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// app.use(cors({
//   origin: ['http://localhost:4000' , 'https://startlytics-gi2w.vercel.app'],
//   credentials: true
// }));
app.use(cors());
app.use(express.json());


app.use("/api", routes);

app.get("/", (req, res) => {
  res.send("Greeting backend is running ✅");
});


const PORT = 5000;
connectDB();

export default app;
// connectDB().then(() => {
//   app.listen(PORT, () => console.log(`🚀 Server running on port http://localhost:${PORT}`));
// });
