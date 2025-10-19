import express from "express";
import { googleSheetData , syncGoogleSheet , deleteSheet } from "../../controllers/v1/googleSheetData.js";
import {isAuthenticated} from "../../middleware/verifyAuth.js";

const router = express.Router();

router.post("/googlesheetUrl", isAuthenticated, googleSheetData);
router.put("/refresh/:datasetId", isAuthenticated, syncGoogleSheet);
router.delete("/sheet/:datasetId", isAuthenticated, deleteSheet);

export default router;