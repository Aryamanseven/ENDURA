import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { getApiErrorMessage } from "../utils.js";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const { data } = await api.forgotPassword(email);
      setStatus(data.message);
      if (data.token) setResetToken(data.token);
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Failed to send reset request"));
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
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-3">ACCOUNT RECOVERY</p>
          <h1 className="text-3xl font-sans font-bold" style={{ color: "var(--text-primary)" }}>Forgot Password</h1>
          <p className="font-mono text-xs mt-2" style={{ color: "var(--text-muted)" }}>Enter your email to receive a reset token</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>EMAIL</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" required className="input-void w-full" />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full rounded-full py-3 px-6 font-sans font-bold text-sm uppercase tracking-wider">
            {loading ? "Sending…" : "Send Reset Token"}
          </button>
        </form>

        {resetToken && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2">
            <p className="text-sm text-emerald-300 font-mono">Reset token generated:</p>
            <code className="block text-xs text-emerald-200 bg-black/40 p-2 rounded-lg break-all font-mono">{resetToken}</code>
            <Link to={`/reset-password?token=${resetToken}`} className="inline-block mt-2 text-neon hover:text-white transition font-mono text-xs tracking-wider">RESET PASSWORD NOW →</Link>
          </div>
        )}

        {status && !resetToken && (
          <div className="rounded-xl bg-neon/10 border border-neon/20 p-3">
            <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{status}</p>
          </div>
        )}

        <p className="text-center">
          <Link to="/login" className="text-neon hover:text-white transition font-mono text-xs tracking-wider">BACK TO SIGN IN</Link>
        </p>
      </section>
    </main>
  );
}
