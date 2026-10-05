"use client";

import { useState } from "react";
import { type Mode, type Settings, type Shade, PALETTES, paletteSwatch } from "@/lib/theme";
import { useInstall } from "@/lib/install";
import { ShareIcon } from "@/components/icons";

const MODES: { id: Mode; label: string }[] = [
  { id: "system", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dim", label: "Dim" },
  { id: "dark", label: "Dark" },
];

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]";

export default function SettingsPanel({
  settings, shade, updated, onChange,
}: { settings: Settings; shade: Shade; updated: string; onChange: (p: Partial<Settings>) => void }) {
  const { state, install } = useInstall();
  const [howTo, setHowTo] = useState(false);
  const link = "underline decoration-[var(--hairline)] underline-offset-2";

  return (
    <div className="max-h-[calc(100dvh-110px)] w-64 overflow-y-auto overscroll-contain rounded-3xl bg-[var(--surface-strong)] p-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-[var(--ring)] backdrop-blur-xl">
      <div className={LABEL}>Color</div>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {Object.entries(PALETTES).map(([id, p]) => {
          const on = settings.palette === id;
          return (
            <button
              key={id}
              onClick={() => onChange({ palette: id })}
              aria-label={p.name}
              aria-pressed={on}
              title={p.name}
              className={`h-7 w-7 rounded-full transition active:scale-90 ${on ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface-strong)]" : ""}`}
              style={{ background: paletteSwatch(id, shade).accent }}
            />
          );
        })}
      </div>

      <div className={`mt-4 ${LABEL}`}>Appearance</div>
      <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-[var(--press)] p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange({ mode: m.id })}
            aria-pressed={settings.mode === m.id}
            className={`rounded-lg py-1.5 text-[13px] font-medium transition ${settings.mode === m.id ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--ink)]"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">Auto uses Dim when your phone is in dark mode.</p>

      {state !== "installed" && (
        <>
          <button
            onClick={() => (state === "prompt" ? install() : setHowTo((h) => !h))}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-soft)] py-2.5 text-[14px] font-semibold text-[var(--accent)] active:scale-[0.98]"
          >
            <ShareIcon /> Add to Home Screen
          </button>
          {howTo && (
            <p className="mt-2 text-[12px] leading-snug text-[var(--ink)]">
              {state === "ios" ? (
                <>In Safari, tap <b>Share</b> <span aria-hidden>⎋</span> at the bottom, then <b>Add to Home Screen</b>.</>
              ) : (
                <>Open your browser&apos;s menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</>
              )}
            </p>
          )}
        </>
      )}

      <div className={`mt-4 ${LABEL}`}>About</div>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">
        Stations © <a className={link} href="https://www.pure-gas.org" target="_blank" rel="noopener">pure-gas.org</a> (CC BY-NC)
        {updated ? `, updated ${updated}` : ""}. Map © <a className={link} href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
        {" "}© <a className={link} href="https://www.openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>
        {" "}© <a className={link} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>.
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">
        Distances are straight-line. Favorites and stations you add are saved on this device only.
      </p>
    </div>
  );
}
