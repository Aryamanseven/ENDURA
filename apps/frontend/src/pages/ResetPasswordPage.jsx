import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { getApiErrorMessage } from "../utils.js";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setStatus("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const { data } = await api.resetPassword(token, newPassword);
      setStatus(data.message);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Password reset failed"));
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
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-3">SECURITY</p>
          <h1 className="text-3xl font-sans font-bold" style={{ color: "var(--text-primary)" }}>Reset Password</h1>
          <p className="font-mono text-xs mt-2" style={{ color: "var(--text-muted)" }}>Enter your reset token and new password</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>RESET TOKEN</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your reset token" required className="input-void w-full font-mono text-sm" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>NEW PASSWORD</label>
            <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" type="password" required minLength={6} className="input-void w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>CONFIRM PASSWORD</label>
            <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" type="password" required className="input-void w-full" />
          </div>

          <button type="submit" disabled={loading || success} className="btn-primary w-full rounded-full py-3 px-6 font-sans font-bold text-sm uppercase tracking-wider">
            {loading ? "Resetting…" : success ? "Redirecting…" : "Reset Password"}
          </button>
        </form>

        {status && (
          <div className={`rounded-xl p-3 ${success ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
            <p className={`text-sm font-mono ${success ? "text-emerald-300" : "text-rose-300"}`}>{status}</p>
          </div>
        )}

        <p className="text-center">
          <Link to="/login" className="text-neon hover:text-white transition font-mono text-xs tracking-wider">BACK TO SIGN IN</Link>
        </p>
      </section>
    </main>
  );
}
