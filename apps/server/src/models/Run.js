import mongoose from "mongoose";

const distancePredictionSchema = new mongoose.Schema(
  {
    five_k: { type: Number, required: true },
    ten_k: { type: Number, required: true },
    half_marathon: { type: Number, required: true },
    twenty_five_k: { type: Number, required: true },
    marathon: { type: Number, required: true }
  },
  { _id: false }
);

const distanceStdSchema = new mongoose.Schema(
  {
    five_k: { type: Number, required: false },
    ten_k: { type: Number, required: false },
    half_marathon: { type: Number, required: false },
    twenty_five_k: { type: Number, required: false },
    marathon: { type: Number, required: false }
  },
  { _id: false }
);

const predictionSchema = new mongoose.Schema(
  {
    predicted_marathon_time: { type: Number, required: true },
    predicted_times: { type: distancePredictionSchema, required: true },
    prediction_std: { type: distanceStdSchema, required: false },
    race_day: { type: mongoose.Schema.Types.Mixed, required: false },
    readiness_adjustment_factor: { type: Number, required: false },
    fatigue_factor: { type: Number, required: false },
    confidence: { type: Number, default: 0 },
    model_source: { type: String, default: "global" },
    model_version: { type: String, default: "legacy" }
  },
  { _id: false }
);

const runSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    distance_km: { type: Number, required: true },
    duration_seconds: { type: Number, required: true },
    avg_pace: { type: Number, required: true },
    elevation_gain: { type: Number, required: true },
    gpx_file_url: { type: String, required: true },
    gpx_raw: { type: String, required: true },
    route_coordinates: { type: mongoose.Schema.Types.Mixed, default: null },
    prediction: { type: predictionSchema, required: true }
  },
  { timestamps: true }
);

export const Run = mongoose.model("Run", runSchema);
