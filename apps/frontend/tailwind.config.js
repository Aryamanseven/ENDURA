export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: {
          DEFAULT: "#030305",
          surface: "#0a0a0c",
          deep: "#000000",
          border: "#1a1a1f",
        },
        neon: {
          DEFAULT: "#FF4800",
          bright: "#FF6B2B",
          glow: "rgba(255, 72, 0, 0.6)",
        },
        ice: {
          DEFAULT: "#ffe8dc",
          glow: "rgba(255, 232, 220, 0.6)",
        },
      },
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
