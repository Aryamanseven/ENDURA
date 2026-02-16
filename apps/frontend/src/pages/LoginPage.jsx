import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import { GOOGLE_CLIENT_ID, isValidGoogleClientId } from "../config.js";
import { getApiErrorMessage } from "../utils.js";

export default function LoginPage() {
  const { saveAuth } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const { data } = await api.login(email, password);
      saveAuth(data);
      navigate("/dashboard");
    } catch (error) {
      setStatus(getApiErrorMessage(error, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isValidGoogleClientId(GOOGLE_CLIENT_ID) || !window.google || !googleBtnRef.current) return;
    googleBtnRef.current.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const { data } = await api.googleLogin(response.credential);
          saveAuth(data);
          navigate("/dashboard");
        } catch (error) {
          setStatus(getApiErrorMessage(error, "Google login failed"));
        }
      }
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: "outline",
      size: "large",
      width: 320
    });
  }, [saveAuth, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <div className="noise-overlay" />

      {/* Back to home */}
      <Link to="/" className="fixed top-6 left-6 z-50 flex items-center gap-2 group mix-blend-difference">
        <div className="w-2 h-2 bg-white rotate-45 group-hover:rotate-0 transition-transform duration-300" />
        <span className="font-sans font-bold tracking-widest text-sm text-white">ENDURA.RUN</span>
      </Link>

      <section className="glass-panel w-full max-w-md rounded-2xl p-8 space-y-6 relative z-10">
        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neon mb-3">AUTHENTICATE</p>
          <h1 className="text-3xl font-sans font-bold" style={{ color: "var(--text-primary)" }}>Sign In</h1>
          <p className="font-mono text-xs mt-2" style={{ color: "var(--text-muted)" }}>Access your running analytics</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>EMAIL</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" required className="input-void w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.3em] mb-1.5" style={{ color: "var(--text-muted)" }}>PASSWORD</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" type="password" required className="input-void w-full" />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full rounded-full py-3 px-6 font-sans font-bold text-sm uppercase tracking-wider">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link to="/register" className="text-neon hover:text-white transition font-mono text-xs tracking-wider">CREATE ACCOUNT</Link>
          <Link to="/forgot-password" className="font-mono text-xs tracking-wider hover:text-white transition" style={{ color: "var(--text-muted)" }}>FORGOT PASSWORD?</Link>
        </div>

        {isValidGoogleClientId(GOOGLE_CLIENT_ID) && (
          <div className="pt-4 border-t space-y-3" style={{ borderColor: "var(--glass-border)" }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-center" style={{ color: "var(--text-muted)" }}>Or continue with</p>
            <div ref={googleBtnRef} className="flex justify-center" />
          </div>
        )}

        {status && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
            <p className="text-sm text-rose-300 font-mono">{status}</p>
          </div>
        )}
      </section>
    </main>
  );
}
