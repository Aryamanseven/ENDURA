import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import axios from "axios";
import { parseGpxStats } from "../services/gpxParser.js";
import { getSupabase } from "../config/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Use OS temp dir for transient GPX parsing (file is uploaded to Supabase Storage after)
const upload = multer({
  dest: os.tmpdir(),
  fileFilter: (_, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".gpx") {
      return cb(new Error("Only GPX files are allowed"));
    }
    return cb(null, true);
  }
});

/* ── helpers ── */

function toMlHistory(r) {
  return {
    distance_km: r.distance_km,
    duration_seconds: r.duration_seconds,
    avg_pace: r.avg_pace,
    elevation_gain: r.elevation_gain,
    date: r.date
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

async function fetchTrainingRuns(db, userId) {
  const { data } = await db
    .from("runs")
    .select("distance_km, duration_seconds, avg_pace, elevation_gain, date")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(5000);
  return data || [];
}

/* ── UPLOAD ── */

router.post("/upload", requireAuth, upload.single("gpx"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "GPX file is required under field name 'gpx'" });
    }

    const db = getSupabase();
    const userId = req.user.id;
    const stats = parseGpxStats(req.file.path);
    const gpxRaw = fs.readFileSync(req.file.path, "utf-8");

    // Upload GPX to Supabase Storage
    const storagePath = `${userId}/${Date.now()}.gpx`;
    const gpxBuffer = fs.readFileSync(req.file.path);
    await db.storage.from("gpx-files").upload(storagePath, gpxBuffer, { contentType: "application/gpx+xml" });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    // Fetch user history for ML
    const { data: userHistoryRuns } = await db
      .from("runs")
      .select("distance_km, duration_seconds, avg_pace, elevation_gain, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60);

    // Cohort data
    const { data: cohortRuns } = await db
      .from("runs")
      .select("distance_km, duration_seconds, avg_pace, elevation_gain, date")
      .neq("user_id", userId)
      .gte("avg_pace", stats.avg_pace - 1)
      .lte("avg_pace", stats.avg_pace + 1)
      .gte("distance_km", Math.max(1, stats.distance_km - 7))
      .lte("distance_km", stats.distance_km + 7)
      .order("date", { ascending: false })
      .limit(120);

    const mlPayloadBase = {
      distance_km: stats.distance_km,
      duration_seconds: stats.duration_seconds,
      avg_pace: stats.avg_pace,
      elevation_gain: stats.elevation_gain,
      user_id: String(userId),
      user_history: (userHistoryRuns || []).map(toMlHistory),
      cohort_history: (cohortRuns || []).map(toMlHistory)
    };

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    let currentPrediction;
    let raceDayPrediction;

    try {
      const [currentResponse, raceDayResponse] = await Promise.all([
        axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "current" }, { timeout: 10000 }),
        axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "race_day" }, { timeout: 10000 })
      ]);
      currentPrediction = currentResponse.data;
      raceDayPrediction = raceDayResponse.data;
    } catch {
      currentPrediction = buildFallbackPrediction(stats, "current");
      raceDayPrediction = buildFallbackPrediction(stats, "race_day");
    }

    const prediction = { ...currentPrediction, race_day: raceDayPrediction };

    const { data: run, error } = await db
      .from("runs")
      .insert({
        user_id: userId,
        title: req.body.title || stats.title,
        date: stats.date,
        distance_km: stats.distance_km,
        duration_seconds: stats.duration_seconds,
        avg_pace: stats.avg_pace,
        elevation_gain: stats.elevation_gain,
        gpx_path: storagePath,
        gpx_raw: gpxRaw,
        route_coordinates: stats.route_coordinates || null,
        prediction
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(run);
  } catch (error) {
    const detail = error?.response?.data?.message || error?.message || String(error);
    return res.status(500).json({ message: "Run upload failed", error: detail });
  }
});

/* ── LIST ── */

router.get("/", requireAuth, async (req, res) => {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from("runs")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch runs", error: error.message });
  }
});

/* ── TRAIN ── */

router.post("/train", requireAuth, async (req, res) => {
  try {
    const { algorithm = "gradient_boosting" } = req.body || {};
    const userId = req.user.id;
    const db = getSupabase();

    const trainingRuns = await fetchTrainingRuns(db, userId);
    if (trainingRuns.length === 0) {
      return res.status(400).json({ message: "No runs found for training. Upload runs first.", samples: 0 });
    }

    const mlPayload = { algorithm, runs: trainingRuns.map(toMlHistory) };
    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    const { data } = await axios.post(`${mlServiceUrl}/train`, mlPayload, { timeout: 30000 });

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

/* ── REFRESH PREDICTIONS ── */

router.post("/refresh-predictions", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getSupabase();

    const { data: runs } = await db
      .from("runs")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60);

    if (!runs || runs.length === 0) {
      return res.status(400).json({ message: "No runs to refresh" });
    }

    const { data: userHistoryRuns } = await db
      .from("runs")
      .select("distance_km, duration_seconds, avg_pace, elevation_gain, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60);

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8001";
    let updatedCount = 0;

    for (const run of runs) {
      try {
        const mlPayloadBase = {
          distance_km: run.distance_km,
          duration_seconds: run.duration_seconds,
          avg_pace: run.avg_pace,
          elevation_gain: run.elevation_gain,
          user_id: String(userId),
          user_history: (userHistoryRuns || []).map(toMlHistory),
          cohort_history: []
        };

        const [currentResponse, raceDayResponse] = await Promise.all([
          axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "current" }, { timeout: 10000 }),
          axios.post(`${mlServiceUrl}/predict`, { ...mlPayloadBase, mode: "race_day" }, { timeout: 10000 })
        ]);

        const newPrediction = { ...currentResponse.data, race_day: raceDayResponse.data };
        await db.from("runs").update({ prediction: newPrediction, updated_at: new Date().toISOString() }).eq("id", run.id);
        updatedCount += 1;
      } catch {
        /* skip */
      }
    }

    return res.json({ message: `Refreshed predictions for ${updatedCount}/${runs.length} runs` });
  } catch (error) {
    return res.status(500).json({ message: "Refresh failed", error: error.message });
  }
});

/* ── ATHLETE FITNESS ── */

router.get("/athlete-fitness", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getSupabase();

    const { data: allRuns } = await db
      .from("runs")
      .select("distance_km, duration_seconds, avg_pace, elevation_gain, date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(60);

    if (!allRuns || allRuns.length === 0) {
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

/* ── STATS ── */

function startOfCalendarWeekUTC(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function startOfCalendarMonthUTC(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function computeRunStreak(runs) {
  if (runs.length === 0) return 0;
  const daySet = new Set();
  for (const r of runs) daySet.add(new Date(r.date).toISOString().slice(0, 10));

  const now = new Date();
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let streak = 0;

  const todayStr = cursor.toISOString().slice(0, 10);
  if (!daySet.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!daySet.has(cursor.toISOString().slice(0, 10))) return 0;
  }

  for (let i = 0; i < 730; i++) {
    if (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else break;
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
  return { total_km: Number(km.toFixed(2)), total_minutes: Number(minutes.toFixed(1)), total_runs: filtered.length };
}

router.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const db = getSupabase();

    const { data: runs } = await db
      .from("runs")
      .select("distance_km, duration_seconds, avg_pace, elevation_gain, date")
      .eq("user_id", userId);

    const allRuns = runs || [];
    const now = new Date();
    const weekStart = startOfCalendarWeekUTC(now);
    const monthStart = startOfCalendarMonthUTC(now);

    const weekRuns = allRuns.filter((r) => new Date(r.date) >= weekStart);
    const monthRuns = allRuns.filter((r) => {
      const d = new Date(r.date);
      return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
    });

    const allTime = aggregateRuns(allRuns);
    const thisWeek = aggregateRuns(weekRuns);
    const thisMonth = aggregateRuns(monthRuns);

    const avgPace = allRuns.length > 0
      ? Number((allRuns.reduce((s, r) => s + r.avg_pace, 0) / allRuns.length).toFixed(2))
      : 0;
    const totalElevation = Number(allRuns.reduce((s, r) => s + r.elevation_gain, 0).toFixed(1));
    const longestRunKm = allRuns.length > 0
      ? Number(Math.max(...allRuns.map((r) => r.distance_km)).toFixed(2))
      : 0;

    const streak = computeRunStreak(allRuns);

    return res.json({
      total_km_all_time: allTime.total_km,
      total_minutes_all_time: allTime.total_minutes,
      total_runs_all_time: allTime.total_runs,
      avgPace,
      totalElevation,
      longestRunKm,
      total_km_this_week: thisWeek.total_km,
      total_minutes_this_week: thisWeek.total_minutes,
      total_runs_this_week: thisWeek.total_runs,
      total_km_this_month: thisMonth.total_km,
      total_minutes_this_month: thisMonth.total_minutes,
      total_runs_this_month: thisMonth.total_runs,
      streak,
      _weekStart: weekStart.toISOString(),
      _monthStart: monthStart.toISOString()
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to compute stats", error: error.message });
  }
});

/* ── GET ONE ── */

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const db = getSupabase();
    const { data: run, error } = await db
      .from("runs")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .single();
    if (error || !run) return res.status(404).json({ message: "Run not found" });
    return res.json(run);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch run", error: error.message });
  }
});

/* ── DELETE ── */

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const db = getSupabase();
    // Get run first to delete storage file
    const { data: run } = await db
      .from("runs")
      .select("id, gpx_path")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .single();

    if (!run) return res.status(404).json({ message: "Run not found" });

    if (run.gpx_path) {
      await db.storage.from("gpx-files").remove([run.gpx_path]);
    }

    await db.from("runs").delete().eq("id", run.id);
    return res.json({ message: "Run deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete run", error: error.message });
  }
});

export default router;
