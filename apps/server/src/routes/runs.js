import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import axios from "axios";
import { fileURLToPath } from "node:url";
import { parseGpxStats } from "../services/gpxParser.js";
import { Run } from "../models/Run.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../../..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, callback) => callback(null, uploadsDir),
  filename: (_, file, callback) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || ".gpx";
    callback(null, `${timestamp}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== ".gpx") {
      return callback(new Error("Only GPX files are allowed"));
    }
    return callback(null, true);
  }
});

function toMlHistory(runDoc) {
  return {
    distance_km: runDoc.distance_km,
    duration_seconds: runDoc.duration_seconds,
    avg_pace: runDoc.avg_pace,
    elevation_gain: runDoc.elevation_gain,
    date: runDoc.date
  };
}

function buildFallbackPredictedTimes(basePaceMinPerKm, multiplier = 1) {
  const pace = Math.max(2.5, basePaceMinPerKm) * multiplier;
  const toSeconds = (km) => Math.round(pace * km * 60);
  return {
    five_k: toSeconds(5),
    ten_k: toSeconds(10),
    half_marathon: toSeconds(21.0975),
    twenty_five_k: toSeconds(25),
    marathon: toSeconds(42.195)
  };
}

function buildFallbackPrediction(stats, mode = "current") {
  const multiplier = mode === "race_day" ? 0.985 : 1;
  const predictedTimes = buildFallbackPredictedTimes(stats.avg_pace, multiplier);
  return {
    predicted_marathon_time: predictedTimes.marathon,
    predicted_times: predictedTimes,
    confidence: 0.35,
    model_source: "fallback-rule",
    model_version: "v3-fallback"
  };
}

async function fetchTrainingRuns(userId) {
  const filter = userId ? { user_id: userId } : {};
  return Run.find(filter)
    .sort({ date: -1 })
    .limit(5000)
    .select("distance_km duration_seconds avg_pace elevation_gain date")
    .lean();
}

router.post("/upload", requireAuth, upload.single("gpx"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "GPX file is required under field name 'gpx'" });
    }

    const userId = req.user.id;
    const stats = parseGpxStats(req.file.path);
    const gpxRaw = fs.readFileSync(req.file.path, "utf-8");

    const userHistoryRuns = await Run.find({ user_id: userId })
      .sort({ date: -1 })
      .limit(60)
      .select("distance_km duration_seconds avg_pace elevation_gain date")
      .lean();

    const cohortRuns = await Run.find({
      user_id: { $ne: userId },
      avg_pace: { $gte: stats.avg_pace - 1, $lte: stats.avg_pace + 1 },
      distance_km: {
        $gte: Math.max(1, stats.distance_km - 7),
        $lte: stats.distance_km + 7
      }
    })
      .sort({ date: -1 })
      .limit(120)
      .select("distance_km duration_seconds avg_pace elevation_gain date")
      .lean();

    const mlPayloadBase = {
      distance_km: stats.distance_km,
      duration_seconds: stats.duration_seconds,
      avg_pace: stats.avg_pace,
      elevation_gain: stats.elevation_gain,
      user_id: String(userId),
      user_history: userHistoryRuns.map(toMlHistory),
      cohort_history: cohortRuns.map(toMlHistory)
    };

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    let currentPrediction;
    let raceDayPrediction;

    try {
      const [currentResponse, raceDayResponse] = await Promise.all([
        axios.post(
          `${mlServiceUrl}/predict`,
          {
            ...mlPayloadBase,
            mode: "current"
          },
          { timeout: 10000 }
        ),
        axios.post(
          `${mlServiceUrl}/predict`,
          {
            ...mlPayloadBase,
            mode: "race_day"
          },
          { timeout: 10000 }
        )
      ]);

      currentPrediction = currentResponse.data;
      raceDayPrediction = raceDayResponse.data;
    } catch {
      currentPrediction = buildFallbackPrediction(stats, "current");
      raceDayPrediction = buildFallbackPrediction(stats, "race_day");
    }

    const prediction = {
      ...currentPrediction,
      race_day: raceDayPrediction
    };

    const run = await Run.create({
      user_id: userId,
      title: req.body.title || stats.title,
      date: stats.date,
      distance_km: stats.distance_km,
      duration_seconds: stats.duration_seconds,
      avg_pace: stats.avg_pace,
      elevation_gain: stats.elevation_gain,
      gpx_file_url: req.file.path,
      gpx_raw: gpxRaw,
      route_coordinates: stats.route_coordinates || null,
      prediction
    });

    return res.status(201).json(run);
  } catch (error) {
    const detail = error?.response?.data?.message || error?.message || String(error);
    return res.status(500).json({ message: "Run upload failed", error: detail });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const runs = await Run.find({ user_id: req.user.id }).sort({ createdAt: -1, _id: -1 });
    return res.json(runs);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch runs", error: error.message });
  }
});

router.post("/train", requireAuth, async (req, res) => {
  try {
    const { algorithm = "gradient_boosting" } = req.body || {};
    const userId = req.user.id;

    const trainingRuns = await fetchTrainingRuns(userId);
    if (trainingRuns.length === 0) {
      return res.status(400).json({
        message: "No runs found for training. Upload runs first.",
        samples: 0
      });
    }

    const mlPayload = {
      algorithm,
      runs: trainingRuns.map(toMlHistory)
    };

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    const { data } = await axios.post(`${mlServiceUrl}/train`, mlPayload, {
      timeout: 30000
    });

    return res.json({
      message: "Training triggered successfully",
      user_scope: String(userId),
      samples_sent: trainingRuns.length,
      model_version: data?.model_version || null,
      ml_response: data
    });
  } catch (error) {
    return res.status(500).json({ message: "Training failed", error: error.message });
  }
});

router.post("/refresh-predictions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const runs = await Run.find({ user_id: userId }).sort({ date: -1 }).limit(60);

    if (runs.length === 0) {
      return res.status(400).json({ message: "No runs to refresh" });
    }

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    let updatedCount = 0;

    for (const run of runs) {
      try {
        const userHistoryRuns = await Run.find({ user_id: userId })
          .sort({ date: -1 })
          .limit(60)
          .select("distance_km duration_seconds avg_pace elevation_gain date")
          .lean();

        const mlPayloadBase = {
          distance_km: run.distance_km,
          duration_seconds: run.duration_seconds,
          avg_pace: run.avg_pace,
          elevation_gain: run.elevation_gain,
          user_id: String(userId),
          user_history: userHistoryRuns.map(toMlHistory),
          cohort_history: []
        };

        const [currentResponse, raceDayResponse] = await Promise.all([
          axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "current" }, { timeout: 10000 }),
          axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "race_day" }, { timeout: 10000 })
        ]);

        run.prediction = { ...currentResponse.data, race_day: raceDayResponse.data };
        await run.save();
        updatedCount += 1;
      } catch {
        /* skip failed individual predictions */
      }
    }

    return res.json({ message: `Refreshed predictions for ${updatedCount}/${runs.length} runs` });
  } catch (error) {
    return res.status(500).json({ message: "Refresh failed", error: error.message });
  }
});

router.get("/athlete-fitness", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const allRuns = await Run.find({ user_id: userId })
      .sort({ date: -1 })
      .limit(60)
      .select("distance_km duration_seconds avg_pace elevation_gain date")
      .lean();

    if (allRuns.length === 0) {
      return res.json({ current: null, race_day: null, meta: { totalRuns: 0 } });
    }

    const bestEffort = [...allRuns].sort((a, b) => a.avg_pace - b.avg_pace)[0];

    const mlPayloadBase = {
      distance_km: bestEffort.distance_km,
      duration_seconds: bestEffort.duration_seconds,
      avg_pace: bestEffort.avg_pace,
      elevation_gain: bestEffort.elevation_gain,
      user_id: String(userId),
      user_history: allRuns.map(toMlHistory),
      cohort_history: []
    };

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    let current;
    let raceDay;

    try {
      const [curRes, rdRes] = await Promise.all([
        axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "current" }, { timeout: 10000 }),
        axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "race_day" }, { timeout: 10000 })
      ]);
      current = curRes.data;
      raceDay = rdRes.data;
    } catch {
      current = buildFallbackPrediction(bestEffort, "current");
      raceDay = buildFallbackPrediction(bestEffort, "race_day");
    }

    return res.json({
      current,
      race_day: raceDay,
      meta: {
        totalRuns: allRuns.length,
        bestEffortDate: bestEffort.date,
        bestEffortPace: bestEffort.avg_pace,
        computedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to compute athlete fitness", error: error.message });
  }
});

/**
 * Calendar-based helper: Monday-start ISO week boundary (UTC).
 */
function startOfCalendarWeekUTC(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? 6 : day - 1; // shift so Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d; // midnight UTC of Monday
}

/**
 * Calendar-based helper: first day of current month (UTC).
 */
function startOfCalendarMonthUTC(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Compute run streak: count consecutive calendar days (UTC) ending today
 * (or yesterday if no run today) that each have at least one run.
 */
function computeRunStreak(runs) {
  if (runs.length === 0) return 0;

  // Build a Set of "YYYY-MM-DD" strings for O(1) lookup
  const daySet = new Set();
  for (const r of runs) {
    daySet.add(new Date(r.date).toISOString().slice(0, 10));
  }

  const now = new Date();
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let streak = 0;

  // Allow starting from today; if today has no run, try yesterday then stop
  const todayStr = cursor.toISOString().slice(0, 10);
  if (!daySet.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!daySet.has(cursor.toISOString().slice(0, 10))) return 0;
  }

  for (let i = 0; i < 730; i++) {
    if (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function aggregateRuns(filtered) {
  let km = 0;
  let minutes = 0;
  for (const r of filtered) {
    km += r.distance_km;
    minutes += r.duration_seconds / 60;
  }
  return {
    total_km: Number(km.toFixed(2)),
    total_minutes: Number(minutes.toFixed(1)),
    total_runs: filtered.length
  };
}

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const runs = await Run.find({ user_id: userId })
      .select("distance_km duration_seconds avg_pace elevation_gain date")
      .lean();

    const now = new Date();
    const weekStart = startOfCalendarWeekUTC(now);
    const monthStart = startOfCalendarMonthUTC(now);

    const weekRuns = runs.filter((r) => new Date(r.date) >= weekStart);
    const monthRuns = runs.filter((r) => {
      const d = new Date(r.date);
      return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
    });

    const allTime = aggregateRuns(runs);
    const thisWeek = aggregateRuns(weekRuns);
    const thisMonth = aggregateRuns(monthRuns);

    const avgPace = runs.length > 0
      ? Number((runs.reduce((s, r) => s + r.avg_pace, 0) / runs.length).toFixed(2))
      : 0;
    const totalElevation = Number(runs.reduce((s, r) => s + r.elevation_gain, 0).toFixed(1));
    const longestRunKm = runs.length > 0
      ? Number(Math.max(...runs.map((r) => r.distance_km)).toFixed(2))
      : 0;

    const streak = computeRunStreak(runs);

    return res.json({
      // All-time
      total_km_all_time: allTime.total_km,
      total_minutes_all_time: allTime.total_minutes,
      total_runs_all_time: allTime.total_runs,
      avgPace,
      totalElevation,
      longestRunKm,

      // Calendar week (Mon–Sun, UTC)
      total_km_this_week: thisWeek.total_km,
      total_minutes_this_week: thisWeek.total_minutes,
      total_runs_this_week: thisWeek.total_runs,

      // Calendar month (UTC)
      total_km_this_month: thisMonth.total_km,
      total_minutes_this_month: thisMonth.total_minutes,
      total_runs_this_month: thisMonth.total_runs,

      // Streak & longest
      streak,

      // Period boundaries (for debug / display)
      _weekStart: weekStart.toISOString(),
      _monthStart: monthStart.toISOString()
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to compute stats", error: error.message });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const run = await Run.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!run) {
      return res.status(404).json({ message: "Run not found" });
    }
    return res.json(run);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch run", error: error.message });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const run = await Run.findOneAndDelete({ _id: req.params.id, user_id: req.user.id });
    if (!run) {
      return res.status(404).json({ message: "Run not found" });
    }
    return res.json({ message: "Run deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete run", error: error.message });
  }
});

export default router;
