import mongoose from 'mongoose'

const datasetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  source: { type: String, default: "csv" },
  headers: [String],
  rows: [{}],
  uploadedAt: { type: Date, default: Date.now }
});

const DATASHEET = mongoose.model("Dataset", datasetSchema);
export default DATASHEET; 