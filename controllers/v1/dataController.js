import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import xlsx from 'xlsx';
import DATASHEET from '../../models/Dataset.js';
import { catchAsyncError } from '../../middleware/catchAsyncError.js';
import ErrorHandler from '../../utils/errorHandler.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⛳ Helper to delete a file safely
const deleteFileIfExists = (filePath) => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const uploadFile = catchAsyncError(async (req, res, next) => {
  // Check authentication first
  if (!req.user || !req.user.id) {
    return next(new ErrorHandler("Authentication required", 401));
  }

  if (!req.file) {
    return next(new ErrorHandler("No file uploaded", 400));
  }

  const file = req.file;
  
  // Enhanced debugging
  console.log("🔍 File object inspection:", {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
    filename: file.filename,
    destination: file.destination,
    fieldname: file.fieldname,
    encoding: file.encoding
  });

  // Improved file path resolution
  let filePath;
  const uploadDir = '../../uploads';
  
  if (file.path) {
    filePath = file.path;
  } else if (file.filename) {
    filePath = path.join(uploadDir, file.filename);
  } else if (file.destination && file.originalname) {
    // Fallback: use destination + originalname
    filePath = path.join(file.destination, file.originalname);
  } else {
    // Last resort: create filename with timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const filename = `${timestamp}-${baseName}${ext}`;
    filePath = path.join(uploadDir, filename);
    
    // Write buffer to file if available
    if (file.buffer) {
      try {
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(filePath, file.buffer);
      } catch (writeError) {
        console.error("Error writing file:", writeError);
        return next(new ErrorHandler("Failed to save uploaded file", 500));
      }
    } else {
      return next(new ErrorHandler("Uploaded file is missing path/filename and buffer", 400));
    }
  }

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return next(new ErrorHandler("Uploaded file not found at expected path", 400));
  }

  const ext = path.extname(file.originalname).toLowerCase();

  console.log("📁 Uploaded file:", {
    name: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: filePath,
    extension: ext,
    userId: req.user.id // Added for debugging
  });

  // ⚙️ Function to store in DB and respond
  const storeAndRespond = async (rows, headers) => {
    try {
      const newDataset = await DATASHEET.create({
        userId: req.user.id,
        name: file.originalname,
        source: ext === ".csv" ? "csv" : "docs",
        headers,
        rows,
      });

      deleteFileIfExists(filePath);

      return res.status(201).json({
        message: "✅ File uploaded & parsed successfully",
        datasetId: newDataset._id,
        rowCount: rows.length,
        headers,
      });
    } catch (dbError) {
      deleteFileIfExists(filePath);
      throw dbError;
    }
  };

  // 📥 Parse CSV
  if (ext === ".csv") {
    try {
      const csvContent = fs.readFileSync(filePath, "utf8");

      return new Promise((resolve, reject) => {
        Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: async (result) => {
            try {
              const data = result.data;
              const headers = result.meta.fields || [];

              if (data.length === 0 || headers.length === 0) {
                deleteFileIfExists(filePath);
                return next(new ErrorHandler("CSV file is empty or malformed", 400));
              }

              await storeAndRespond(data, headers);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          error: (parseError) => {
            deleteFileIfExists(filePath);
            reject(new ErrorHandler(`CSV parse error: ${parseError.message}`, 400));
          },
        });
      });
    } catch (readError) {
      deleteFileIfExists(filePath);
      return next(new ErrorHandler(`Failed to read CSV file: ${readError.message}`, 400));
    }
  }

  // 📥 Parse Excel
  else if (ext === ".xlsx" || ext === ".xls") {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      if (data.length === 0) {
        deleteFileIfExists(filePath);
        return next(new ErrorHandler("Excel file is empty or has no data", 400));
      }

      const headers = Object.keys(data[0]);
      await storeAndRespond(data, headers);
    } catch (err) {
      deleteFileIfExists(filePath);
      return next(new ErrorHandler(`Excel parse error: ${err.message}`, 400));
    }
  }

  // ❌ Unsupported format
  else {
    deleteFileIfExists(filePath);
    return next(new ErrorHandler("Unsupported file format. Only CSV and Excel files are allowed.", 400));
  }
});

export const getMyDatasets = async (req, res) => {
  try {
    const datasets = await DATASHEET.find({ userId: req.user.id }).sort({ uploadedAt: -1 });

    res.status(200).json({
      count: datasets.length,
      datasets: datasets.map(ds => ({
        id: ds?._id,
        name: ds?.name,
        source: ds?.source,
        rowCount: ds.rows.length,
        row: ds?.rows,
        headers : ds?.headers,
        uploadedAt: ds?.uploadedAt,
        sheetUrl : ds?.sheetUrl ,
        lastSyncedAt : ds?.lastSyncedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch datasets", error: err.message });
  }
};


export const getDatasetById = async (req, res) => {
  try {
    const dataset = await DATASHEET.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!dataset) {
      return res.status(404).json({ message: "Dataset not found" });
    }

    res.status(200).json({
      id: dataset._id,
      name: dataset.name,
      source: dataset.source,
      headers: dataset.headers,
      rows: dataset.rows,
      uploadedAt: dataset.uploadedAt
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch dataset", error: err.message });
  }
};


export const deleteDatasetById = async (req, res) => {
  try {
    const deleted = await DATASHEET.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({ message: "Dataset not found or already deleted" });
    }

    res.status(200).json({ message: "Dataset deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete dataset", error: err.message });
  }
};



// export default uploadFile;