import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { api } from "../api.js";
import { useFitness } from "../FitnessContext.jsx";
import { formatSeconds, formatDateDisplay, parseGpxRoute } from "../utils.js";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import {
  ButtonPrimary, StatusAlert, Spinner,
  chartTheme, ChartTooltip, chartActiveDot, chartDot
} from "../components/ui.jsx";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { refreshFitness } = useFitness();
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [gpxFile, setGpxFile] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
    refreshFitness();
  }, []);

  async function loadData() {
    try {
      const [runsRes, statsRes] = await Promise.all([api.getRuns(), api.getRunStats()]);
      setRuns(runsRes.data);
      setStats(statsRes.data);
    } catch {
      setStatus("Failed to load dashboard data");
    }
  }

  const personalBests = useMemo(() => {
    const targets = [
      { label: "5K", km: 5 },
      { label: "10K", km: 10 },
      { label: "Half Marathon", km: 21.0975 },
      { label: "25K", km: 25 },
      { label: "Marathon", km: 42.195 },
    ];
    return targets.map((t) => {
      const candidates = runs.filter((r) => Math.abs(r.distance_km - t.km) <= Math.max(1, t.km * 0.12));
      if (candidates.length === 0) return { label: t.label, value: null };
      return { label: t.label, value: Math.min(...candidates.map((r) => r.duration_seconds)) };
    });
  }, [runs]);

  const chartData = useMemo(
    () =>
      [...runs]
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((r) => ({
          date: formatDateDisplay(r.date),
          pace: r.avg_pace,
          distance: r.distance_km,
          elevation: r.elevation_gain,
        })),
    [runs]
  );

  const weeklyData = useMemo(() => {
    const weeks = {};
    for (const r of runs) {
      const d = new Date(r.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      weeks[key] = (weeks[key] || 0) + r.distance_km;
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, km]) => ({ week, km: Number(km.toFixed(1)) }));
  }, [runs]);

  const mapCenter = useMemo(() => {
    if (routePoints.length > 0) return [routePoints[0].lat, routePoints[0].lon];
    return [28.6139, 77.209];
  }, [routePoints]);

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    setGpxFile(file || null);
    if (!file) { setRoutePoints([]); return; }
    const xml = await file.text();
    setRoutePoints(parseGpxRoute(xml));
  }

  async function uploadRun() {
    if (!gpxFile) { setStatus("Select a GPX file first."); return; }
    setUploading(true);
    setStatus("Uploading and analyzing...");
    try {
      const form = new FormData();
      form.append("gpx", gpxFile);
      await api.uploadRun(form);
      setGpxFile(null);
      setRoutePoints([]);
      await loadData();
      await refreshFitness();
      setStatus("Run uploaded and analyzed successfully.");
    } catch (error) {
      setStatus(`Upload failed: ${error?.response?.data?.message || error.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-2">OVERVIEW</p>
          <h1 className="text-4xl md:text-5xl font-sans font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Dashboard
          </h1>
        </div>
        <button
          onClick={() => navigate("/predictions")}
          className="font-mono text-xs tracking-widest hover:text-neon transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          RACE PREDICTIONS →
        </button>
      </div>

      {/* ── Upload ── */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>UPLOAD GPX</p>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <input
            type="file"
            accept=".gpx"
            onChange={onFileChange}
            className="input-void w-full text-sm"
          />
          <ButtonPrimary onClick={uploadRun} disabled={uploading}>
            {uploading ? "Analyzing…" : "Upload"}
          </ButtonPrimary>
        </div>
        <StatusAlert text={status} variant="info" />
      </div>

      {/* ── Route Preview ── */}
      {routePoints.length > 1 && (
        <div className="glass-panel rounded-2xl p-6">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>ROUTE PREVIEW</p>
          <div className="h-64 rounded-xl overflow-hidden border" style={{ borderColor: "var(--glass-border)" }}>
            <MapContainer center={mapCenter} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline
                positions={routePoints.map((p) => [p.lat, p.lon])}
                pathOptions={{ color: chartTheme.neon, weight: 4 }}
              />
            </MapContainer>
          </div>
        </div>
      )}

      {/* ── Stats Grid ── */}
      {stats && (
        <div className="space-y-8">
          {/* This Week */}
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>THIS WEEK</p>
            <div className="grid gap-4 grid-cols-3">
              {[
                { label: "RUNS", value: stats.total_runs_this_week },
                { label: "DISTANCE", value: `${stats.total_km_this_week} km` },
                { label: "TIME", value: `${stats.total_minutes_this_week} min` },
              ].map((s) => (
                <div key={s.label} className="glass-panel rounded-2xl p-5">
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  <p className="text-2xl font-sans font-bold mt-2 text-neon">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* This Month */}
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>THIS MONTH</p>
            <div className="grid gap-4 grid-cols-3">
              {[
                { label: "RUNS", value: stats.total_runs_this_month },
                { label: "DISTANCE", value: `${stats.total_km_this_month} km` },
                { label: "TIME", value: `${stats.total_minutes_this_month} min` },
              ].map((s) => (
                <div key={s.label} className="glass-panel rounded-2xl p-5">
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  <p className="text-2xl font-sans font-bold mt-2" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* All-Time — condensed */}
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>ALL TIME</p>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {[
                { label: "TOTAL RUNS", value: stats.total_runs_all_time },
                { label: "DISTANCE", value: `${stats.total_km_all_time} km` },
                { label: "AVG PACE", value: `${stats.avgPace} min/km` },
                { label: "STREAK", value: `${stats.streak} days` },
              ].map((s) => (
                <div key={s.label} className="glass-panel rounded-2xl p-5">
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  <p className="text-xl font-sans font-bold mt-2" style={{ color: "var(--text-primary)" }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Personal Bests ── */}
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>PERSONAL BESTS</p>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {personalBests.map((pb) => (
            <div key={pb.label} className="glass-panel rounded-2xl p-5 text-center">
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{pb.label}</p>
              <p className="text-xl font-sans font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                {pb.value ? formatSeconds(pb.value) : "--:--:--"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Charts ── */}
      {chartData.length > 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel rounded-2xl p-6">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-6" style={{ color: "var(--text-muted)" }}>PACE TREND</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <defs>
                    <linearGradient id="paceGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF4800" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#FF4800" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }} />
                  <YAxis stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,72,0,0.2)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Line
                    type="monotone"
                    dataKey="pace"
                    stroke={chartTheme.neon}
                    strokeWidth={2}
                    dot={chartDot}
                    activeDot={chartActiveDot}
                    name="Pace (min/km)"
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-6" style={{ color: "var(--text-muted)" }}>WEEKLY MILEAGE</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="mileageGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartTheme.emerald} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={chartTheme.emerald} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }} />
                  <YAxis stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(34,197,94,0.2)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                  <Area
                    type="monotone"
                    dataKey="km"
                    stroke={chartTheme.emerald}
                    fill="url(#mileageGradient)"
                    strokeWidth={2}
                    name="Distance (km)"
                    activeDot={{ ...chartActiveDot, stroke: chartTheme.emerald }}
                    animationDuration={1200}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
