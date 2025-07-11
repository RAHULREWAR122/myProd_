import axios from "axios";
import csv from "csvtojson";
import DATASET from "../models/Dataset.js";


export const googleSheetData = async (req, res) => {
  const { sheetUrl, forceUpdate = false } = req.body;

  if (!sheetUrl) {
    return res.status(400).json({ message: "Sheet URL is required" });
  }

  try {
    const regex = /\/d\/([a-zA-Z0-9-_]+)/;
    const match = sheetUrl.match(regex);

    if (!match || !match[1]) {
      return res.status(400).json({ message: "Invalid Google Sheet URL" });
    }

    const spreadsheetId = match[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

    let existingDataset = await DATASET.findOne({ 
      userId: req.user.id, 
      sheetUrl: sheetUrl,
      source: "sheet"
    });

    const response = await axios.get(csvUrl);
    const rows = await csv().fromString(response.data);
    const headers = Object.keys(rows[0] || {});
    const rowCount = rows.length;

    if (existingDataset) {
      const previousRowCount = existingDataset.rowCount;
      const syncCount = (existingDataset.syncCount || 0) + 1;
      
      existingDataset.headers = headers;
      existingDataset.rows = rows;
      existingDataset.rowCount = rowCount;
      existingDataset.lastSyncedAt = new Date();
      existingDataset.syncCount = syncCount;
      
      await existingDataset.save();

      const rowsAdded = rowCount - previousRowCount;
      const changeType = rowsAdded > 0 ? 'added' : rowsAdded < 0 ? 'removed' : 'no change';
      
      res.status(200).json({
        message: "Sheet updated successfully",
        datasetId: existingDataset._id,
        rowCount,
        headers,
        isUpdate: true,
        syncCount,
        changes: {
          previousRowCount,
          currentRowCount: rowCount,
          rowsChanged: Math.abs(rowsAdded),
          changeType
        },
        lastSyncedAt: existingDataset.lastSyncedAt
      });
    } else {
      const dataset = new DATASET({
        userId: req.user.id,
        source: "sheet",
        sheetUrl: sheetUrl,
        headers,
        rows,
        lastSyncedAt: new Date(),
      });

      await dataset.save();

      res.status(201).json({
        message: "Sheet imported successfully",
        datasetId: dataset._id,
        rowCount,
        headers,
        isUpdate: false,
        syncCount: 1,
        lastSyncedAt: dataset.lastSyncedAt
      });
    }
  } catch (error) {
    console.error("Sheet import error:", error.message);
    res.status(500).json({ message: "Failed to import sheet", error: error.message });
  }
};

export const syncGoogleSheet = async (req, res) => {
  const { datasetId } = req.params;

  try {
    const dataset = await DATASET.findOne({ 
      _id: datasetId, 
      userId: req.user.id,
      source: "sheet"
    });

    if (!dataset) {
      return res.status(404).json({ message: "Dataset not found" });
    }

    if (!dataset.sheetUrl) {
      return res.status(400).json({ message: "Sheet URL not found in dataset" });
    }

    
    const regex = /\/d\/([a-zA-Z0-9-_]+)/;
    const match = dataset.sheetUrl.match(regex);
    const spreadsheetId = match[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

    const response = await axios.get(csvUrl);
    const rows = await csv().fromString(response.data);
    const headers = Object.keys(rows[0] || {});
    const rowCount = rows.length;

    const previousRowCount = dataset.rowCount;
    const previousHeaders = dataset.headers;
    
    dataset.headers = headers;
    dataset.rows = rows;
    dataset.rowCount = rowCount;
    dataset.lastSyncedAt = new Date();
    dataset.syncCount = (dataset.syncCount || 0) + 1;
    
    await dataset.save();

    const rowsChanged = rowCount - previousRowCount;
    const headersChanged = JSON.stringify(headers) !== JSON.stringify(previousHeaders);
    
    res.status(200).json({
      message: "Sheet synced successfully",
      datasetId: dataset._id,
      success : true,
      rowCount,
      headers,
      syncCount: dataset.syncCount,
      changes: {
        previousRowCount,
        currentRowCount: rowCount,
        rowsChanged,
        headersChanged,
        changeType: rowsChanged > 0 ? 'added' : rowsChanged < 0 ? 'removed' : 'no change'
      },
      lastSyncedAt: dataset.lastSyncedAt
    });
  } catch (error) {
    console.error("Sheet sync error:", error.message);
    res.status(500).json({ message: "Failed to sync sheet", error: error.message , success : false });
  }
};



export const deleteSheet = async (req, res) => {
  const { datasetId } = req.params;

  try {
    const dataset = await DATASET.findOneAndDelete({ 
      _id: datasetId, 
      userId: req.user.id,
      source: "sheet"
    });

    if (!dataset) {
      return res.status(404).json({ message: "Dataset not found" });
    }

    res.status(200).json({ message: "Sheet deleted successfully" });
  } catch (error) {
    console.error("Delete sheet error:", error.message);
    res.status(500).json({ message: "Failed to delete sheet", error: error.message });
  }
};