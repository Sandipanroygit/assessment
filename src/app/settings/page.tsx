"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FontSize = "small" | "medium" | "large";
type Theme = "green" | "orange" | "blue";

const fontSizeMap: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

export default function SettingsPage() {
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [theme, setTheme] = useState<Theme>("green");
  const [dynamicBg, setDynamicBg] = useState<boolean>(false);

  // apply settings to document
  useEffect(() => {
    const size = fontSizeMap[fontSize];
    document.documentElement.style.setProperty("--base-font-size", size);
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("dynamic-bg", dynamicBg);
  }, [dynamicBg]);

  return (
    <main className="section-padding space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-accent-strong uppercase text-xs tracking-[0.2em]">Settings</p>
          <h1 className="text-3xl font-semibold text-white">Personalize your view</h1>
          <p className="text-slate-300 text-sm mt-2">
            Choose font size, background theme, and switch between dynamic (animated) or static
            backgrounds.
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-xl bg-accent text-slate-900 font-semibold shadow-glow"
        >
          Back to homepage
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Font size</h2>
          </div>
          <div className="flex gap-2">
            {(["small", "medium", "large"] as FontSize[]).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`flex-1 py-2 rounded-lg border ${
                  fontSize === size
                    ? "bg-accent text-slate-900 border-accent"
                    : "border-white/10 text-white"
                }`}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Applies globally via CSS variables.</p>
        </div>

        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Background theme</h2>
          </div>
          <div className="flex gap-2">
            {(["green", "orange", "blue"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 py-2 rounded-lg border ${
                  theme === t
                    ? "bg-accent text-slate-900 border-accent"
                    : "border-white/10 text-white"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Switches CSS custom properties site-wide.</p>
        </div>

        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Background mode</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDynamicBg(true)}
              className={`flex-1 py-2 rounded-lg border ${
                dynamicBg ? "bg-accent text-slate-900 border-accent" : "border-white/10 text-white"
              }`}
            >
              Dynamic (animated)
            </button>
            <button
              onClick={() => setDynamicBg(false)}
              className={`flex-1 py-2 rounded-lg border ${
                !dynamicBg ? "bg-accent text-slate-900 border-accent" : "border-white/10 text-white"
              }`}
            >
              Static
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Dynamic toggles an animated gradient. Static keeps the layered background.
          </p>
        </div>
      </div>
    </main>
  );
}
