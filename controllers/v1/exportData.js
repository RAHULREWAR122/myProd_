import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import mongoose from 'mongoose'
import DATASHEET from '../../models/Dataset.js';

export const exportDataset = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid dataset ID format" });
    }

    const dataset = await DATASHEET.findById(id);
    if (!dataset) return res.status(404).json({ message: "Dataset not found" });

    const fileName = `dataset-${id}.${type === "pdf" ? "pdf" : "xlsx"}`;
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    if (type === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      const doc = new PDFDocument();
      doc.pipe(res);

      doc.fontSize(16).text("Dataset Export", { underline: true });
      doc.moveDown();

      doc.fontSize(12).text(dataset.headers.join(" | "));
      doc.moveDown();

      dataset.rows.forEach((row) => {
        const rowText = dataset.headers.map(h => row[h]).join(" | ");
        doc.text(rowText);
      });

      doc.end();
    }

    else {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Dataset");

      sheet.addRow(dataset.headers);

      dataset.rows.forEach(row => {
        const rowData = dataset.headers.map(h => row[h]);
        sheet.addRow(rowData);
      });

      await workbook.xlsx.write(res);
    }

  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Export failed", error: err.message });
  }
};