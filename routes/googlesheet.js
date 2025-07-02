import express from "express";
import { googleSheetData } from "../controllers/googleSheetData.js";
import verifyToken from "../middleware/verifyToken.js";

const router = express.Router();

router.post("/googlesheetUrl", verifyToken, googleSheetData);

export default router;
