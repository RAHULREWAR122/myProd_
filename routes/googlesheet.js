import express from "express";
import { googleSheetData , syncGoogleSheet , deleteSheet } from "../controllers/googleSheetData.js";
import verifyToken from "../middleware/verifyAuth.js";

const router = express.Router();

router.post("/googlesheetUrl", verifyToken, googleSheetData);
router.put("/refresh/:datasetId", verifyToken, syncGoogleSheet);
router.delete("/sheet/:datasetId", verifyToken, deleteSheet);

export default router;