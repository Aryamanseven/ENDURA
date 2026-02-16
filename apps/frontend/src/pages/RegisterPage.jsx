import { Link } from "react-router-dom";
import { SignUp } from "@clerk/clerk-react";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative" style={{ background: "var(--bg-void)", color: "var(--text-primary)" }}>
      <div className="noise-overlay" />

      <Link to="/" className="fixed top-6 left-6 z-50 flex items-center gap-2 group mix-blend-difference">
        <div className="w-2 h-2 bg-white rotate-45 group-hover:rotate-0 transition-transform duration-300" />
        <span className="font-sans font-bold tracking-widest text-sm text-white">ENDURA.RUN</span>
      </Link>

      <div className="relative z-10">
        <SignUp
          routing="hash"
          signInUrl="/login"
          afterSignUpUrl="/dashboard"
          appearance={{
            variables: {
              colorPrimary: "#00f0ff",
              colorBackground: "rgba(255,255,255,0.03)",
              colorText: "#e2e8f0",
              colorTextSecondary: "#94a3b8",
              colorInputBackground: "rgba(255,255,255,0.05)",
              colorInputText: "#e2e8f0",
              borderRadius: "1rem",
              fontFamily: "'Inter', sans-serif",
            },
            elements: {
              card: "backdrop-blur-xl border border-white/10 shadow-2xl",
              headerTitle: "font-sans font-bold",
              headerSubtitle: "font-mono text-xs",
              formButtonPrimary: "bg-cyan-400 hover:bg-cyan-300 text-black font-bold uppercase tracking-wider text-sm",
              footerActionLink: "text-cyan-400 hover:text-white",
            },
          }}
        />
      </div>
    </main>
  );
}
