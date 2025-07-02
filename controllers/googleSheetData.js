import axios from "axios";
import csv from "csvtojson";
import DATASET from "../models/Dataset.js";

export const googleSheetData = async (req, res) => {
  const { sheetUrl } = req.body;

  if (!sheetUrl) {
    return res.status(400).json({ message: "Sheet URL is required" });
  }

  try {
    // Extract spreadsheetId
    const regex = /\/d\/([a-zA-Z0-9-_]+)/;
    const match = sheetUrl.match(regex);

    if (!match || !match[1]) {
      return res.status(400).json({ message: "Invalid Google Sheet URL" });
    }

    const spreadsheetId = match[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

    const response = await axios.get(csvUrl);

    const rows = await csv().fromString(response.data);
    const headers = Object.keys(rows[0] || {});
    const rowCount = rows.length;

    const dataset = new DATASET({
      userId: req.user.id,
      source: "sheet",
      headers,
      rows,
      rowCount,
      uploadedAt: new Date()
    });

    await dataset.save();

    res.status(200).json({
      message: "Sheet imported successfully",
      datasetId: dataset._id,
      rowCount,
      headers
    });
  } catch (error) {
    console.error("Sheet import error:", error.message);
    res.status(500).json({ message: "Failed to import sheet", error: error.message });
  }
};
