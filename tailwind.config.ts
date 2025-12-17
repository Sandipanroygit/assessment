import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: "var(--surface)",
        card: "var(--card)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        foreground: "var(--foreground)",
      },
      boxShadow: {
        glow: "0 10px 50px var(--glow)",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 25px 25px, rgba(255,255,255,0.06) 2px, transparent 0)",
      },
    },
  },
  plugins: [],
} satisfies Config;
