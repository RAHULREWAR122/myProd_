import express from 'express';
const router  = express.Router();
import { getAISummary } from '../../controllers/v1/aiController.js';
import {isAuthenticated} from "../../middleware/verifyAuth.js";

router.post("/summary/:datasetId", isAuthenticated, getAISummary);

export default router;
