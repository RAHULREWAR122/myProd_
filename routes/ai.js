import express from 'express';
const router  = express.Router();
import { getAISummary } from '../controllers/aiController.js';
import verifyToken from "../middleware/verifyAuth.js";

router.post("/summary/:datasetId",verifyToken , getAISummary);

export default router;
