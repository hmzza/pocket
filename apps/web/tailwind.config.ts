import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#D65A31",
          foreground: "#FFFFFF"
        },
        accent: {
          DEFAULT: "#102A43",
          foreground: "#F5EBD8"
        },
        muted: {
          DEFAULT: "#F5EBD8",
          foreground: "#5A4633"
        },
        pocket: {
          orange: "#D65A31",
          orangeDeep: "#C4491D",
          cream: "#F5EBD8",
          navy: "#102A43",
          charcoal: "#1B1B1B"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 12px 30px rgba(16, 42, 67, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

