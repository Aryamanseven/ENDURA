import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { formatSeconds, formatDateDisplay } from "../utils.js";
import { Spinner } from "../components/ui.jsx";

export default function RunHistoryPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.getRuns();
        setRuns(data);
      } catch {
        /* handled */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const sorted = [...runs].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = filter
    ? sorted.filter((r) => {
        const q = filter.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          formatDateDisplay(r.date).includes(q) ||
          String(r.distance_km).includes(q)
        );
      })
    : sorted;

  async function handleDelete(runId, e) {
    e.stopPropagation();
    if (!confirm("Delete this run? This cannot be undone.")) return;
    try {
      await api.deleteRun(runId);
      setRuns((prev) => prev.filter((r) => r._id !== runId));
    } catch {
      /* handled */
    }
  }

  if (loading) return <Spinner className="py-20" />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-2">ACTIVITY LOG</p>
          <h1 className="text-4xl md:text-5xl font-sans font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Run History
          </h1>
          <p className="font-mono text-xs mt-2" style={{ color: "var(--text-muted)" }}>{runs.length} runs total</p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search runs..."
          className="input-void w-full sm:w-72"
        />
      </div>

      {filtered.length === 0 && (
        <div className="glass-panel rounded-2xl text-center py-12">
          <p className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>
            {runs.length === 0 ? "No runs uploaded yet." : "No runs match your search."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((run) => (
          <div
            key={run._id}
            onClick={() => navigate(`/runs/${run._id}`)}
            className="glass-panel rounded-2xl p-5 cursor-pointer group hover:border-neon/20 transition-colors"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div className="space-y-1.5">
                <p className="font-sans font-semibold text-lg group-hover:text-neon transition" style={{ color: "var(--text-primary)" }}>{run.title}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                  <span>{formatDateDisplay(run.date)}</span>
                  <span>{run.distance_km} km</span>
                  <span>{formatSeconds(run.duration_seconds)}</span>
                  <span>{run.avg_pace} min/km</span>
                  <span>↑ {run.elevation_gain} m</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 font-mono text-xs">
                  <span style={{ color: "var(--text-secondary)" }}>
                    Marathon: {formatSeconds(run.prediction?.predicted_marathon_time)}
                  </span>
                  {run.prediction?.race_day?.predicted_marathon_time && (
                    <span className="text-emerald-400">
                      Race Day: {formatSeconds(run.prediction.race_day.predicted_marathon_time)}
                    </span>
                  )}
                  <span className="font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-full" style={{ background: "var(--glass-bg)", color: "var(--text-muted)" }}>
                    {run.prediction?.model_version || "legacy"}
                  </span>
                </div>
              </div>
              <div className="flex items-start">
                <button
                  type="button"
                  onClick={(e) => handleDelete(run._id, e)}
                  className="font-mono text-[10px] tracking-wider text-rose-400/60 hover:text-rose-400 transition px-3 py-1.5 rounded-lg border border-rose-500/10 hover:border-rose-500/30"
                >
                  DELETE
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
