import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        isie: {
          bg: {
            deep: "#05070B",
            base: "#080B12",
            surface: "#0B1018",
          },
          panel: {
            DEFAULT: "#0D131C",
            light: "#111923",
            elevated: "#16202E",
          },
          border: {
            subtle: "rgba(255, 255, 255, 0.08)",
            light: "rgba(255, 255, 255, 0.14)",
            accent: "rgba(255, 122, 24, 0.35)",
            cyan: "rgba(56, 189, 248, 0.3)",
          },
          text: {
            primary: "#F5F7FA",
            secondary: "#94A3B8",
            muted: "#64748B",
            dim: "#475569",
          },
          primary: {
            DEFAULT: "#FF7A18",
            glow: "rgba(255, 122, 24, 0.15)",
            dark: "#D96009",
            light: "#FF9240",
          },
          cyan: {
            DEFAULT: "#38BDF8",
            glow: "rgba(56, 189, 248, 0.15)",
            dark: "#0284C7",
            light: "#7DD3FC",
          },
          status: {
            safe: "#22C55E",
            warning: "#F59E0B",
            critical: "#EF4444",
            info: "#38BDF8",
          },
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Oxygen",
          "Ubuntu",
          "Cantarell",
          "Fira Sans",
          "Droid Sans",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      animation: {
        "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-sweep": "radarSweep 4s linear infinite",
        "scanline": "scanline 8s linear infinite",
      },
      keyframes: {
        radarSweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(1000%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
