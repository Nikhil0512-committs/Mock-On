/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        brand: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bae0fd",
          300: "#7cc5fb",
          400: "#3aa2f7",
          500: "#1084ee",
          600: "#0267d3",
          700: "#0252aa",
          800: "#06468b",
          900: "#0a3c74",
          950: "#07264e",
        },
        surface: {
          DEFAULT: "#070c18",
          card: "#0d1527",
          elevated: "#131d35",
          border: "rgba(255, 255, 255, 0.08)",
          hover: "#182442",
        },
        promise: {
          pending: "#64748b",
          due_soon: "#f59e0b",
          overdue: "#ef4444",
          fulfilled: "#10b981",
          unable_to_verify: "#8b5cf6",
        },
      },
      boxShadow: {
        "glow-brand": "0 0 30px -5px rgba(16, 132, 238, 0.35)",
        "glow-emerald": "0 0 30px -5px rgba(16, 185, 129, 0.35)",
        "glow-amber": "0 0 30px -5px rgba(245, 158, 11, 0.35)",
        "glow-rose": "0 0 30px -5px rgba(244, 63, 94, 0.35)",
        "glass": "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fadeIn 0.25s ease-out",
        "hold-ring": "holdRing 2s ease-in-out infinite",
        "wave-1": "waveform 1s ease-in-out infinite alternate",
        "wave-2": "waveform 1.3s ease-in-out infinite alternate 0.2s",
        "wave-3": "waveform 0.8s ease-in-out infinite alternate 0.4s",
        "wave-4": "waveform 1.1s ease-in-out infinite alternate 0.1s",
        "shimmer": "shimmer 2.5s infinite linear",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        holdRing: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
        waveform: {
          "0%": { height: "20%" },
          "100%": { height: "95%" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
    },
  },
  plugins: [],
};
