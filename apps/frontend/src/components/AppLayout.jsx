import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useTheme } from "../ThemeContext.jsx";
import { api } from "../api.js";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/runs", label: "Runs" },
  { to: "/predictions", label: "Predictions" },
  { to: "/certificates", label: "Certs" },
  { to: "/account", label: "Account" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    let active = true;
    let objectUrl = null;

    async function loadNavProfile() {
      try {
        const { data } = await api.getProfile();
        if (active && data?.username) setProfileName(data.username);
      } catch {
        if (active) setProfileName(user?.username || "");
      }

      try {
        const response = await api.getProfilePicture();
        objectUrl = URL.createObjectURL(response.data);
        if (active) setAvatarUrl(objectUrl);
      } catch {
        if (active) setAvatarUrl(null);
      }
    }

    loadNavProfile();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.username]);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* ── Top Nav — mix-blend-difference ── */}
      <nav className={`fixed top-0 w-full z-50 ${isDark ? "mix-blend-difference" : ""}`}>
        <div
          className={`max-w-7xl mx-auto px-6 py-5 flex items-center justify-between ${isDark ? "" : "border-b backdrop-blur-md"}`}
          style={isDark ? undefined : { borderColor: "var(--glass-border)", background: "var(--glass-bg)" }}
        >
          {/* Logo */}
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 group"
          >
            <div
              className="w-2 h-2 rotate-45 group-hover:rotate-0 transition-transform duration-300"
              style={{ background: isDark ? "#fff" : "#FF4800" }}
            />
            <span className="font-sans font-bold tracking-widest text-sm" style={{ color: "var(--text-primary)" }}>ENDURA.RUN</span>
          </button>

          {/* Nav links (desktop) */}
          <div className="hidden md:flex items-center gap-10">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="font-mono text-xs tracking-widest transition-colors"
                style={({ isActive }) => ({
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                })}
              >
                {item.label.toUpperCase()}
              </NavLink>
            ))}
          </div>

          {/* Right area */}
          <div className="flex items-center gap-4">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-full border flex items-center justify-center transition-all"
              style={{ borderColor: "var(--glass-border)", color: "var(--text-secondary)" }}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Avatar */}
            <button
              type="button"
              onClick={() => navigate("/account")}
              className="flex items-center gap-2 group"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-7 h-7 rounded-full object-cover border" style={{ borderColor: "var(--glass-border)" }} />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border"
                  style={{
                    background: "var(--glass-bg)",
                    color: "var(--text-primary)",
                    borderColor: "var(--glass-border)",
                  }}
                >
                  {(profileName || user?.username || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </button>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="font-mono text-[10px] tracking-widest transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              LOGOUT
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t" style={{ borderColor: "var(--glass-border)", background: "var(--bg-void)" }}>
        <div className="flex justify-around py-2.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1 font-mono text-[10px] tracking-wider transition ${
                  isActive ? "text-neon" : "text-white/30"
                }`
              }
            >
              {item.label.toUpperCase()}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 pt-24 pb-28 md:pb-12 relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
