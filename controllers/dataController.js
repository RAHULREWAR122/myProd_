import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import xlsx from 'xlsx';
import DATASHEET from '../models/Dataset.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadFile = async (req, res) => {
  
 if (!req.files) return res.status(400).json({ message: "No file uploaded" });
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const file = req.files[0];
  
  const filePath = path.join(__dirname, "../uploads", file.filename);
  const ext = path.extname(req.files[0].originalname).toLowerCase();  

  try {
    let data = [], headers = [];


    const storeAndRespond = async (processedData, processedHeaders) => {
      try {
        const newDataset = await DATASHEET.create({
          userId: req.user.id,
          name: req.files.originalname,
          source: ext === ".csv" ? "csv" : "docs",
          headers: processedHeaders,
          rows: processedData,
        });

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        return res.status(201).json({
          message: "File uploaded & parsed successfully",
          datasetId: newDataset._id,
          rowCount: processedData.length,
          headers: processedHeaders,
        });
      } catch (dbError) {
        // Clean up file even if DB operation fails
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        throw dbError;
      }
    };

    // Handle CSV files
    if (ext === ".csv") {
      const csv = fs.readFileSync(filePath, "utf8");
      
      return new Promise((resolve, reject) => {
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: async (result) => {
            try {
              data = result.data;
              headers = result.meta.fields || [];
              await storeAndRespond(data, headers);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          error: (error) => {
            reject(new Error(`CSV parse error: ${error.message}`));
          }
        });
      });
    }

    // Handle Excel files
    else if (ext === ".xlsx" || ext === ".xls") {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const sheetData = xlsx.utils.sheet_to_json(sheet, { defval: "" });

      if (sheetData.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: "Excel file is empty or has no data" });
      }

      data = sheetData;
      headers = Object.keys(data[0] || {});
      await storeAndRespond(data, headers);
    }

    else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: "Unsupported file format" });
    }

  } catch (err) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    console.error("Upload error:", err);
    return res.status(500).json({ 
      message: "Upload error", 
      error: err.message 
    });
  }
};



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
      return res.status(404).json({success : false , message: "Dataset not found or already deleted" });
    }

    return res.status(200).json({ success : true, message: "Dataset deleted successfully" });
  } catch (err) {
   return res.status(500).json({success : false , message: "Failed to delete dataset", error: err.message });
  }
};



export default uploadFile;