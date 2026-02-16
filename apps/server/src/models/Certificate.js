import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    distance_label: { type: String, required: true, trim: true },
    official_time_seconds: { type: Number, required: true, min: 1 },
    event_date: { type: Date, required: true },
    notes: { type: String, default: "", trim: true },
    file_url: { type: String, default: null },
    file_name: { type: String, default: null },
    file_mime: { type: String, default: null }
  },
  { timestamps: true }
);

export const Certificate = mongoose.model("Certificate", certificateSchema);
