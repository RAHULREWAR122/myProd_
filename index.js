import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import connectDB from './config/mongo.js';
import routes from './routes/index.js'

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(cors());
app.use(express.json());


app.use("/api", routes);

app.get("/", (req, res) => {
  res.send("Greeting backend is running ✅");
});


const PORT = 5000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port http://localhost:${PORT}`));
});
