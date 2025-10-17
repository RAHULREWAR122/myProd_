import express from 'express';
const router = express.Router();
import {isAuthenticated} from '../../middleware/verifyAuth.js';
import { singleUpload } from '../../middleware/multer.js';


import { exportDataset } from "../../controllers/v1/exportData.js";

router.get("/:id/export", isAuthenticated, exportDataset);

export default router;
