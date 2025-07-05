import express from 'express';
const router  = express.Router();
import verifyToken from "../middleware/verifyAuth.js";
import { askAssistant } from '../controllers/aiAssestant.js';

router.post("/assistant", askAssistant);

export default router;
