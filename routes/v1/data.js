
import express from 'express';
import multer from 'multer';
import path from 'path';
import {uploadFile} from '../../controllers/v1/dataController.js';
import {isAuthenticated} from '../../middleware/verifyAuth.js'; 
import { singleUpload } from '../../middleware/multer.js';

import { getMyDatasets ,getDatasetById , deleteDatasetById } from '../../controllers/v1/dataController.js';
const router = express.Router();


const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});



const fileFilter = (req, file, cb) => {
  const allowedExt = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExt.includes(ext)) {
    return cb(new Error("Only .csv, .xlsx or .xls files are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });


router.post("/upload", isAuthenticated,  singleUpload, uploadFile);

router.get("/alldatasets", isAuthenticated, getMyDatasets);
router.get("/:id", isAuthenticated, getDatasetById);
router.delete("/:id", isAuthenticated, deleteDatasetById);
export default router;
