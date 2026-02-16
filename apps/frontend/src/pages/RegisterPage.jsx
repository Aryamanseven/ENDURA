import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import { getApiErrorMessage } from "../utils.js";

export default function RegisterPage() {
  const { saveAuth } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const { data } = await api.register(username, email, password);
      saveAuth(data);
      navigate("/dashboard");
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Registration failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <div className="noise-overlay" />

      <Link to="/" className="fixed top-6 left-6 z-50 flex items-center gap-2 group mix-blend-difference">
        <div className="w-2 h-2 bg-white rotate-45 group-hover:rotate-0 transition-transform duration-300" />
        <span className="font-sans font-bold tracking-widest text-sm text-white">ENDURA.RUN</span>
      </Link>

      <section className="glass-panel w-full max-w-md rounded-2xl p-8 space-y-6 relative z-10">
        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-3">JOIN</p>
          <h1 className="text-3xl font-sans font-bold" style={{ color: "var(--text-primary)" }}>Create Account</h1>
          <p className="font-mono text-xs mt-2" style={{ color: "var(--text-muted)" }}>Start tracking your running performance</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>USERNAME</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your name" required className="input-void w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>EMAIL</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" required className="input-void w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>PASSWORD</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" type="password" required minLength={6} className="input-void w-full" />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full rounded-full py-3 px-6 font-sans font-bold text-sm uppercase tracking-wider">
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-center">
          <Link to="/login" className="text-neon hover:text-white transition font-mono text-xs tracking-wider">ALREADY HAVE AN ACCOUNT? SIGN IN</Link>
        </p>

        {status && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
            <p className="text-sm text-rose-300 font-mono">{status}</p>
          </div>
        )}
      </section>
    </main>
  );
}
