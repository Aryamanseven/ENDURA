/**
 * Vantage Design System — Shared UI Components
 * Single source of truth for all reusable primitives.
 * Accent: Strava Neon (#FF4800)
 */

/* ────────── Glass Card ────────── */
export function GlassCard({ children, className = "", hover = false, onClick, rounded = "5xl", padding = "p-6" }) {
  return (
    <div
      onClick={onClick}
      className={`glass-panel rounded-${rounded} ${padding} ${hover ? "glass-panel-hover cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/* ────────── Stat Card ────────── */
export function StatCard({ label, value, sub, accent = false, icon }) {
  return (
    <article
      className={`glass-panel rounded-3xl p-5 group relative overflow-hidden transition-all duration-300 hover:translate-y-[-3px] ${
        accent ? "border-neon/30 hover:border-neon/60" : ""
      }`}
    >
      {accent && (
        <div className="absolute right-0 top-0 w-24 h-24 bg-neon/10 blur-[40px] rounded-full group-hover:bg-neon/20 transition-all" />
      )}
      <div className="relative z-10">
        {icon && <div className="text-neon-bright mb-2">{icon}</div>}
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">{label}</p>
        <p className="text-2xl font-sans font-bold mt-1 text-white">{value}</p>
        {sub && <p className="text-xs text-white/40 mt-1 font-mono">{sub}</p>}
      </div>
    </article>
  );
}

/* ────────── Section Header ────────── */
export function SectionHeader({ children, sub, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-sans font-bold text-white">{children}</h2>
        {sub && <p className="text-xs font-mono text-white/40 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ────────── Primary Button (Fill from Bottom) ────────── */
export function ButtonPrimary({ children, onClick, disabled, type = "button", className = "" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn-primary rounded-full px-7 py-3 text-sm font-sans font-bold tracking-wide uppercase transition disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
}

/* ────────── Ghost / Secondary Button ────────── */
export function ButtonGhost({ children, onClick, disabled, type = "button", className = "", danger = false }) {
  const base = danger
    ? "bg-rose-500/10 hover:bg-rose-600 border-rose-500/20 text-rose-400 hover:text-white"
    : "btn-glass";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-5 py-2.5 text-sm font-medium border transition disabled:opacity-50 ${base} ${className}`}
    >
      {children}
    </button>
  );
}

/* ────────── Badge / Pill ────────── */
export function Badge({ children, color = "neon" }) {
  const map = {
    neon: "bg-neon/15 text-neon-bright border-neon/20",
    ice: "bg-ice/10 text-ice border-ice/20",
    amber: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    rose: "bg-rose-500/15 text-rose-400 border-rose-500/20",
    mute: "bg-white/5 text-white/50 border-white/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${map[color] || map.neon}`}>
      {children}
    </span>
  );
}

/* ────────── Input ────────── */
export function Input({ label, className = "", ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-[11px] font-mono uppercase tracking-widest text-white/40 mb-1.5">{label}</label>}
      <input
        {...props}
        className="input-void"
      />
    </div>
  );
}

/* ────────── Select ────────── */
export function Select({ label, children, className = "", ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-[11px] font-mono uppercase tracking-widest text-white/40 mb-1.5">{label}</label>}
      <select {...props} className="input-void">
        {children}
      </select>
    </div>
  );
}

/* ────────── Textarea ────────── */
export function Textarea({ label, className = "", ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-[11px] font-mono uppercase tracking-widest text-white/40 mb-1.5">{label}</label>}
      <textarea {...props} className="input-void resize-none" />
    </div>
  );
}

/* ────────── Status Alert ────────── */
export function StatusAlert({ text, variant = "info" }) {
  if (!text) return null;
  const map = {
    info: "bg-neon/10 border-neon/20 text-neon-bright",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
    error: "bg-rose-500/10 border-rose-500/20 text-rose-300",
    warn: "bg-amber-500/10 border-amber-500/20 text-amber-300",
  };
  return (
    <div className={`rounded-xl border p-3 ${map[variant] || map.info}`}>
      <p className="text-sm">{text}</p>
    </div>
  );
}

/* ────────── Spinner ────────── */
export function Spinner({ size = "h-8 w-8" }) {
  return (
    <div className="flex justify-center py-20">
      <div className={`animate-spin ${size} border-2 border-neon border-t-transparent rounded-full`} />
    </div>
  );
}

/* ────────── Page Title ────────── */
export function PageTitle({ children, sub }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl md:text-4xl font-sans font-bold tracking-tight text-hero">{children}</h1>
      {sub && <p className="text-sm text-white/40 mt-1 font-mono">{sub}</p>}
    </div>
  );
}

/* ────────── Chart design tokens ────────── */
export const chartTheme = {
  grid: "#1a1a1f",
  axis: "rgba(255,255,255,0.2)",
  tooltip: {
    backgroundColor: "rgba(10,10,12,0.92)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    color: "#fff",
    backdropFilter: "blur(12px)",
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
  },
  neon: "#FF4800",
  neonBright: "#FF6B2B",
  emerald: "#22c55e",
  amber: "#f59e0b",
  ice: "#ffe8dc",
};

/* ────────── Interactive Chart Tooltip ────────── */
export function ChartTooltip({ active, payload, label, unit = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-xl px-4 py-3 min-w-[140px]">
      <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-1.5">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm font-sans font-semibold text-white">
            {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
          </span>
          <span className="text-xs text-white/40 font-mono">{entry.name || unit}</span>
        </div>
      ))}
    </div>
  );
}

/* ────────── Chart active dot config ────────── */
export const chartActiveDot = {
  r: 6,
  stroke: "#FF4800",
  strokeWidth: 2,
  fill: "#030305",
  className: "drop-shadow-[0_0_6px_rgba(255,72,0,0.6)]",
};

export const chartDot = {
  r: 3,
  fill: "#FF4800",
  strokeWidth: 0,
};
