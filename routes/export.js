import express from 'express';
const router = express.Router();
import verifyToken from '../middleware/verifyAuth.js';
import { exportDataset } from "../controllers/exportData.js";

router.get("/:id/export", verifyToken, exportDataset);

export default router;
