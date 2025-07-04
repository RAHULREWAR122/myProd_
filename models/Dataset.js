import mongoose from 'mongoose';

const datasetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  source: { type: String, default: "csv" },
  headers: [String],
  rows: [{}],
  uploadedAt: { type: Date, default: Date.now },
  sheetUrl: {
    type: String,
    required: function() {
      return this.source === 'sheet';
    }
  },
  rowCount: {
    type: Number,
    default: function() {
      return this.rows ? this.rows.length : 0;
    }
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  syncCount: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

const DATASHEET = mongoose.model("Dataset", datasetSchema);
export default DATASHEET;