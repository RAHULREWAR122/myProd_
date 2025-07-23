import express from 'express';
import multer from 'multer';
import path from 'path';
import uploadFile from '../controllers/dataController.js';
import verifyToken from '../middleware/verifyAuth.js'; 
import { getMyDatasets ,getDatasetById , deleteDatasetById } from '../controllers/dataController.js';
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

const upload = multer({ 
  storage, 
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 
  }
});

const fileSize = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File size exceeds 2MB limit', 
        message: 'File size exceeds 2MB limit' 
      });
    }
  }
  next(error);
};

router.post("/upload", verifyToken, upload.any(), fileSize ,uploadFile);
router.get("/alldatasets", verifyToken, getMyDatasets);
router.get("/:id", verifyToken, getDatasetById);
router.delete("/dataset/:id", verifyToken, deleteDatasetById);

export default router;