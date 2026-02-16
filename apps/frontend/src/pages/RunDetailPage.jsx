import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../api.js";
import { useFitness } from "../FitnessContext.jsx";
import { formatSeconds, formatDateDisplay, parseGpxRoute } from "../utils.js";
import { Spinner, chartTheme, ChartTooltip, chartActiveDot } from "../components/ui.jsx";

function computeRunProjection(distanceKm, durationSeconds) {
  if (!distanceKm || !durationSeconds || distanceKm <= 0 || durationSeconds <= 0) return [];
  const paceMinPerKm = durationSeconds / 60 / distanceKm;
  const project = (targetKm) => Math.round(paceMinPerKm * targetKm * 60);
  return [
    { label: "5K", value: project(5) },
    { label: "10K", value: project(10) },
    { label: "Half Marathon", value: project(21.0975) },
    { label: "25K", value: project(25) },
    { label: "Marathon", value: project(42.195) },
  ];
}

function timesFromPrediction(pred) {
  const times = pred?.predicted_times;
  if (!times) return [];
  return [
    { label: "5K", value: times.five_k },
    { label: "10K", value: times.ten_k },
    { label: "Half Marathon", value: times.half_marathon },
    { label: "25K", value: times.twenty_five_k },
    { label: "Marathon", value: times.marathon },
  ];
}

export default function RunDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fitness, refreshFitness } = useFitness();
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.getRun(id);
        setRun(data);
      } catch {
        navigate("/runs");
      } finally {
        setLoading(false);
      }
    }
    load();
    if (!fitness) refreshFitness();
  }, [id, navigate]);

  const routePoints = useMemo(() => {
    if (run?.route_coordinates?.length > 0) return run.route_coordinates;
    if (run?.gpx_raw) return parseGpxRoute(run.gpx_raw);
    return [];
  }, [run]);

  const mapCenter = useMemo(() => {
    if (routePoints.length > 0) return [routePoints[0].lat, routePoints[0].lon];
    return [28.6139, 77.209];
  }, [routePoints]);

  const elevationData = useMemo(() => {
    if (!routePoints.length) return [];
    let dist = 0;
    const points = [{ distance: 0, elevation: routePoints[0].ele || 0 }];
    for (let i = 1; i < routePoints.length; i++) {
      const prev = routePoints[i - 1];
      const curr = routePoints[i];
      const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
      const dLon = ((curr.lon - prev.lon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prev.lat * Math.PI) / 180) *
          Math.cos((curr.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      dist += 2 * 6371 * Math.asin(Math.sqrt(a));
      if (i % Math.max(1, Math.floor(routePoints.length / 200)) === 0) {
        points.push({ distance: Number(dist.toFixed(2)), elevation: Math.round(curr.ele || 0) });
      }
    }
    return points;
  }, [routePoints]);

  const runProjection = useMemo(
    () => computeRunProjection(run?.distance_km, run?.duration_seconds),
    [run]
  );

  const fitnessCurrentRows = useMemo(() => timesFromPrediction(fitness?.current), [fitness]);
  const fitnessRaceDayRows = useMemo(() => timesFromPrediction(fitness?.race_day), [fitness]);

  if (loading) return <Spinner className="py-20" />;
  if (!run) return null;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <button onClick={() => navigate("/runs")} className="font-mono text-xs tracking-wider mb-4 inline-flex items-center gap-2 hover:text-neon transition" style={{ color: "var(--text-muted)" }}>
          ← BACK TO RUNS
        </button>
        <h1 className="text-3xl md:text-4xl font-sans font-bold" style={{ color: "var(--text-primary)" }}>{run.title}</h1>
        <p className="font-mono text-xs mt-1" style={{ color: "var(--text-muted)" }}>{formatDateDisplay(run.date)}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[
          { label: "DISTANCE", value: `${run.distance_km} km`, accent: true },
          { label: "DURATION", value: formatSeconds(run.duration_seconds), accent: true },
          { label: "AVG PACE", value: `${run.avg_pace} min/km` },
          { label: "ELEVATION", value: `↑ ${run.elevation_gain} m` },
        ].map((s) => (
          <div key={s.label} className="glass-panel rounded-2xl p-5">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{s.label}</p>
            <p className={`text-xl font-sans font-bold mt-2 ${s.accent ? "text-neon" : ""}`} style={s.accent ? {} : { color: "var(--text-primary)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Map */}
      {routePoints.length > 1 && (
        <div className="glass-panel rounded-2xl p-6">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>ROUTE MAP</p>
          <div className="h-80 rounded-xl overflow-hidden border" style={{ borderColor: "var(--glass-border)" }}>
            <MapContainer center={mapCenter} zoom={14} style={{ height: "100%", width: "100%" }}>
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

      {/* Elevation Profile */}
      {elevationData.length > 2 && (
        <div className="glass-panel rounded-2xl p-6">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-6" style={{ color: "var(--text-muted)" }}>ELEVATION PROFILE</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={elevationData}>
                <defs>
                  <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.emerald} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={chartTheme.emerald} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                <XAxis dataKey="distance" stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }} label={{ value: "km", position: "insideBottomRight", offset: -5, fill: "rgba(255,255,255,0.3)" }} />
                <YAxis stroke={chartTheme.axis} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }} label={{ value: "m", angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.3)" }} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(34,197,94,0.2)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area
                  type="monotone"
                  dataKey="elevation"
                  stroke={chartTheme.emerald}
                  fill="url(#elevGradient)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ ...chartActiveDot, stroke: chartTheme.emerald }}
                  name="Elevation (m)"
                  animationDuration={1500}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Overall Fitness */}
      {(fitnessCurrentRows.length > 0 || fitnessRaceDayRows.length > 0) && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>OVERALL FITNESS</p>
            <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {fitnessCurrentRows.length > 0 && (
              <div className="glass-panel rounded-2xl p-6">
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: "var(--text-muted)" }}>CURRENT FITNESS</p>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  {fitnessCurrentRows.map((r) => (
                    <div key={r.label} className="glass-panel rounded-xl p-3">
                      <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{r.label}</p>
                      <p className="text-lg font-sans font-bold mt-1" style={{ color: "var(--text-primary)" }}>{formatSeconds(r.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fitnessRaceDayRows.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border-emerald-500/10">
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-emerald-400/60 mb-4">RACE DAY (TAPERED)</p>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                  {fitnessRaceDayRows.map((r) => (
                    <div key={r.label} className="glass-panel rounded-xl p-3 border-emerald-500/10">
                      <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{r.label}</p>
                      <p className="text-lg font-sans font-bold mt-1 text-emerald-400">{formatSeconds(r.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Run-Based Projection */}
      {runProjection.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-amber-400">RUN-BASED PROJECTION</p>
            <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
          </div>
          <div className="glass-panel rounded-2xl p-6 border-amber-500/10">
            <p className="font-mono text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Based on {run.distance_km} km in {formatSeconds(run.duration_seconds)} ({run.avg_pace} min/km)
            </p>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {runProjection.map((r) => (
                <div key={r.label} className="glass-panel rounded-xl p-3 border-amber-500/10">
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{r.label}</p>
                  <p className="text-lg font-sans font-bold mt-1 text-amber-300">{formatSeconds(r.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
