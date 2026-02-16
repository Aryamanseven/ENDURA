import { useMemo } from "react";
import { useFitness } from "../FitnessContext.jsx";
import { formatSeconds } from "../utils.js";
import { ButtonGhost } from "../components/ui.jsx";

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

function deltaSeconds(a, b) {
  if (!a || !b) return null;
  return b - a;
}

function DeltaBadge({ seconds }) {
  if (seconds == null) return null;
  const neg = seconds < 0;
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  return (
    <span className={`inline-block font-mono text-[10px] tracking-wider px-2 py-0.5 rounded-full ${neg ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
      {neg ? "−" : "+"}{m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export default function RacePredictionPage() {
  const { fitness, loading, refreshFitness } = useFitness();

  const currentRows = useMemo(() => timesFromPrediction(fitness?.current), [fitness]);
  const raceDayRows = useMemo(() => timesFromPrediction(fitness?.race_day), [fitness]);

  const bestEffortPace = fitness?.meta?.bestEffortPace;
  const modelVersion = fitness?.current?.model_version || "v3";

  async function handleRefresh() {
    await refreshFitness();
  }

  return (
    <div className="space-y-10">
      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-2">NEURAL ENGINE</p>
          <h1 className="text-4xl md:text-5xl font-sans font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Race Predictions
          </h1>
        </div>
        <ButtonGhost onClick={handleRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </ButtonGhost>
      </div>

      {/* ── Model Info ── */}
      <div className="flex flex-wrap gap-6">
        {bestEffortPace && (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-neon rounded-full" />
            <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
              BEST EFFORT PACE: <span className="text-neon">{bestEffortPace} min/km</span>
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-muted)" }} />
          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            MODEL: <span style={{ color: "var(--text-primary)" }}>{modelVersion}</span>
          </span>
        </div>
      </div>

      {currentRows.length === 0 && raceDayRows.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <p className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>
            {loading ? "Loading predictions…" : "Upload runs to generate race predictions."}
          </p>
        </div>
      ) : (
        <>
          {/* ── Current Fitness ── */}
          {currentRows.length > 0 && (
            <section>
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-6" style={{ color: "var(--text-muted)" }}>
                CURRENT FITNESS LEVEL
              </p>
              <p className="text-sm mb-6 max-w-xl" style={{ color: "var(--text-secondary)" }}>
                Predicted race times based on your current training load and recent performance data.
              </p>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                {currentRows.map((r) => (
                  <div key={r.label} className="glass-panel rounded-2xl p-6 text-center group hover:border-neon/20 transition-colors">
                    <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{r.label}</p>
                    <p className="text-2xl font-sans font-bold mt-3 text-neon">{formatSeconds(r.value)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Predicted Race Performance ── */}
          {currentRows.length > 0 && (
            <section>
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase mb-6" style={{ color: "var(--text-muted)" }}>
                PREDICTED RACE PERFORMANCE
              </p>
              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="grid grid-cols-3 gap-px" style={{ background: "var(--glass-border)" }}>
                  <div className="p-4" style={{ background: "var(--glass-bg)" }}>
                    <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>DISTANCE</p>
                  </div>
                  <div className="p-4" style={{ background: "var(--glass-bg)" }}>
                    <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>PREDICTED TIME</p>
                  </div>
                  <div className="p-4" style={{ background: "var(--glass-bg)" }}>
                    <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>IMPROVEMENT</p>
                  </div>
                  {currentRows.map((r, i) => (
                    <>
                      <div key={`d-${r.label}`} className="p-4" style={{ background: "var(--bg-void)" }}>
                        <p className="font-sans font-semibold" style={{ color: "var(--text-primary)" }}>{r.label}</p>
                      </div>
                      <div key={`t-${r.label}`} className="p-4" style={{ background: "var(--bg-void)" }}>
                        <p className="font-mono text-neon">{formatSeconds(r.value)}</p>
                      </div>
                      <div key={`i-${r.label}`} className="p-4" style={{ background: "var(--bg-void)" }}>
                        <DeltaBadge seconds={deltaSeconds(r.value, raceDayRows[i]?.value)} />
                      </div>
                    </>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Tapered Race-Day Prediction ── */}
          {raceDayRows.length > 0 && (
            <section>
              <div className="flex items-center gap-4 mb-6">
                <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-emerald-400">
                  TAPERED RACE-DAY PREDICTION
                </p>
                <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
              </div>
              <p className="text-sm mb-6 max-w-xl" style={{ color: "var(--text-secondary)" }}>
                Projected times after a proper taper period, accounting for reduced fatigue and peak adaptation.
              </p>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                {raceDayRows.map((r, i) => {
                  const delta = deltaSeconds(currentRows[i]?.value, r.value);
                  return (
                    <div key={r.label} className="glass-panel rounded-2xl p-6 text-center border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                      <p className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ color: "var(--text-muted)" }}>{r.label}</p>
                      <p className="text-2xl font-sans font-bold mt-3 text-emerald-400">{formatSeconds(r.value)}</p>
                      {delta != null && (
                        <div className="mt-2">
                          <DeltaBadge seconds={delta} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
