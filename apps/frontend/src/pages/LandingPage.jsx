import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useTheme } from "../ThemeContext.jsx";
import ThreeBackground from "../components/ThreeBackground.jsx";
import gsap from "gsap";

/* ── Scramble text hook ── */
function useScramble(ref) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  const onEnter = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const original = el.dataset.text || el.innerText;
    el.dataset.text = original;
    let iter = 0;
    const interval = setInterval(() => {
      el.innerText = original
        .split("")
        .map((c, i) => (i < iter ? original[i] : chars[Math.floor(Math.random() * chars.length)]))
        .join("");
      if (iter >= original.length) clearInterval(interval);
      iter += 1 / 3;
    }, 30);
  }, [ref]);
  return onEnter;
}

/* ── Scramble text wrapper ── */
function ScrambleText({ children, className = "" }) {
  const ref = useRef(null);
  const onEnter = useScramble(ref);
  return (
    <span ref={ref} className={className} onMouseEnter={onEnter}>
      {children}
    </span>
  );
}

/* ── Magnetic button (uses gsap) ── */
function MagneticButton({ children, className = "", onClick }) {
  const ref = useRef(null);

  function onMouseMove(e) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(ref.current, { x: x * 0.3, y: y * 0.3, duration: 0.3, ease: "power2.out" });
  }

  function onMouseLeave() {
    if (!ref.current) return;
    gsap.to(ref.current, { x: 0, y: 0, duration: 0.3, ease: "power2.out" });
  }

  return (
    <button
      ref={ref}
      className={`magnetic-btn ${className}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ── Loader ── */
function Loader({ onComplete }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLoaded(true), 1600);
    const t2 = setTimeout(onComplete, 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div className={`loader-overlay ${loaded ? "loaded" : ""}`}>
      <div className="font-mono text-xs tracking-[0.3em] text-neon animate-pulse">
        CALCULATING TRAJECTORY
      </div>
      <div className="loader-bar">
        <div className="loader-progress" style={{ width: loaded ? "100%" : "0%" }} />
      </div>
      <div className="font-mono text-[10px] text-white/30 mt-2">000.00.00</div>
    </div>
  );
}

/* ══════════════════════════════════════ */
/* ── LANDING PAGE                     ── */
/* ══════════════════════════════════════ */

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const [showLoader, setShowLoader] = useState(true);
  const [showContent, setShowContent] = useState(false);

  const onLoaderComplete = useCallback(() => {
    setShowLoader(false);
    setShowContent(true);
  }, []);

  const marqueeItems = [
    { text: "GPX PARSING", accent: false },
    { text: "ELEVATION PROFILE", accent: true },
    { text: "PACE TREND", accent: false },
    { text: "WEEKLY MILEAGE", accent: false },
    { text: "FITNESS SCORE", accent: true },
    { text: "RACE-DAY PREDICTION", accent: false },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      {/* Loader */}
      {showLoader && <Loader onComplete={onLoaderComplete} />}

      {/* 3D Background */}
      <ThreeBackground />

      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* ── NAV ── */}
      <nav className="fixed top-0 w-full z-50 px-6 py-6 flex justify-between items-center mix-blend-difference">
        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-2 h-2 bg-neon rotate-45 group-hover:rotate-0 transition-transform duration-300" />
          <ScrambleText className="font-sans font-bold tracking-widest text-sm text-white">ENDURA.RUN</ScrambleText>
        </div>

        <div className="hidden md:flex gap-12">
          <a href="#gpx" className="font-mono text-xs text-white/40 hover:text-neon transition-colors tracking-widest">
            <ScrambleText>UPLOAD GPX</ScrambleText>
          </a>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:text-neon hover:border-neon/30 transition-all"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <span className="font-mono text-[10px] text-neon border border-neon/30 px-2 py-1 rounded">BETA v0.9</span>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section className="relative h-screen flex flex-col justify-center items-center px-4">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-void z-0" style={{ background: `linear-gradient(to bottom, transparent 60%, var(--bg-void))` }} />

        <div className={`z-10 text-center flex flex-col items-center ${showContent ? "" : "opacity-0"}`}>
          <div className="overflow-hidden mb-2">
            <p className={`font-mono text-xs md:text-sm text-neon tracking-[0.5em] uppercase ${showContent ? "hero-fade-up" : "translate-y-full"}`}>
              Outperform Your Ghost
            </p>
          </div>

          <h1 className={`font-sans font-medium text-[14vw] md:text-[12vw] leading-[0.85] tracking-tighter ${showContent ? "hero-blur-in" : "opacity-0 blur-sm"}`}
              style={{ color: "var(--text-primary)" }}>
            PREDICT<br />
            <span className="italic font-light" style={{ color: "var(--text-secondary)" }}>YOUR PEAK</span>
          </h1>

          <div className={`mt-12 flex flex-col items-center gap-6 ${showContent ? "hero-fade-up-delay-2" : "opacity-0"}`}>
            <p className="max-w-md text-center font-mono text-xs md:text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Upload your GPX runs to analyze pace, distance, elevation, and predicted race times from your actual training data.
            </p>

            <MagneticButton
              className="group relative px-8 py-4 bg-transparent border border-white/20 rounded-full overflow-hidden hover:border-neon transition-colors duration-500"
              onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}
            >
              <div className="absolute inset-0 bg-neon translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]" />
              <span className="relative z-10 font-sans font-bold text-sm tracking-widest group-hover:text-black transition-colors duration-300" style={{ color: "var(--text-primary)" }}>
                {isAuthenticated ? "OPEN DASHBOARD" : "START ANALYSIS"}
              </span>
            </MagneticButton>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50">
          <div className="w-[1px] h-12 bg-gradient-to-b from-transparent via-white to-transparent animate-pulse" />
          <span className="font-mono text-[10px] tracking-widest">SCROLL</span>
        </div>
      </section>

      {/* ══════════ MARQUEE ══════════ */}
      <div className="w-full border-y py-4 overflow-hidden flex z-20 relative" style={{ borderColor: "var(--glass-border)", background: "var(--glass-bg)" }}>
        <div className="marquee-content flex gap-16 animate-marquee whitespace-nowrap">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span
              key={i}
              className={`font-mono text-4xl ${item.accent ? "text-neon opacity-80" : "text-stroke opacity-20"}`}
            >
              {item.text}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════ UPLOAD SECTION ══════════ */}
      <section id="gpx" className="relative min-h-screen flex items-center justify-center py-20">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-neon opacity-[0.03] blur-[150px] rounded-full" />

        <div className="relative z-10 w-full max-w-4xl px-4">
          <div className="text-center mb-12">
            <span className="font-mono text-neon tracking-widest text-xs mb-4 block">FREE ACCESS</span>
            <h2 className="text-4xl md:text-6xl font-sans font-bold">UPLOAD ARTIFACT</h2>
          </div>

          {/* Drop zone */}
          <div className="glass-panel rounded-3xl p-1 md:p-2 relative overflow-hidden group transition-all duration-500 hover:scale-[1.01] hover:border-neon/30">
            <div
              className="border border-dashed rounded-2xl h-96 flex flex-col items-center justify-center relative transition-colors group-hover:bg-neon/5 cursor-pointer"
              style={{ borderColor: "var(--glass-border)", background: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)" }}
              onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}
            >
              <div className="w-20 h-20 rounded-full border border-neon/30 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8 text-neon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>

              <h3 className="font-sans text-2xl font-medium mb-2">Drop GPX File</h3>
              <p className="font-mono text-xs tracking-wider" style={{ color: "var(--text-muted)" }}>
                {isAuthenticated ? "OR CLICK TO GO TO DASHBOARD" : "SIGN IN TO START UPLOADING"}
              </p>

              {/* Decorative corners */}
              <div className="absolute top-4 left-4 w-4 h-4 border-t border-l" style={{ borderColor: "var(--text-muted)" }} />
              <div className="absolute top-4 right-4 w-4 h-4 border-t border-r" style={{ borderColor: "var(--text-muted)" }} />
              <div className="absolute bottom-4 left-4 w-4 h-4 border-b border-l" style={{ borderColor: "var(--text-muted)" }} />
              <div className="absolute bottom-4 right-4 w-4 h-4 border-b border-r" style={{ borderColor: "var(--text-muted)" }} />
            </div>
          </div>

          <div className="flex justify-between items-center mt-6 px-4">
            <div className="flex gap-4">
              <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>SECURE PARSING</span>
              <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>MODEL ANALYSIS</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
