import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette – update to match final design system
        brand: {
          50: "#fef9ee",
          100: "#fdf0d5",
          200: "#f9dea9",
          300: "#f5c673",
          400: "#f0a33a",
          500: "#ec8a19",
          600: "#dc6c0e",
          700: "#b6510e",
          800: "#923f12",
          900: "#763512",
          950: "#401906",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.04)",
        panel: "0 8px 24px 0 rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
