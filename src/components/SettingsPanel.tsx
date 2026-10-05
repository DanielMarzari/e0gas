"use client";

import { type Mode, type Settings, type Shade, PALETTES, paletteSwatch } from "@/lib/theme";
import { useState } from "react";
import { useInstall } from "@/lib/install";
import { getWriteKey, setWriteKey } from "@/lib/remote";
import { ShareIcon } from "@/components/icons";

const MODES: { id: Mode; label: string }[] = [
  { id: "system", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]";

export default function SettingsPanel({
  settings, shade, updated, onChange, onShowInstallSteps, hidden, onRestore, apiUp,
}: {
  settings: Settings; shade: Shade; updated: string;
  onChange: (p: Partial<Settings>) => void;
  /** No install prompt available: show step-by-step instructions instead. */
  onShowInstallSteps: () => void;
  /** Stations flagged "no ethanol-free anymore". */
  hidden: { id: number; name: string }[];
  onRestore: (id: number) => void;
  /** Whether the e0gas server answered (adds and flags are shared through it). */
  apiUp: boolean;
}) {
  const { installed, install } = useInstall();
  const [showHidden, setShowHidden] = useState(false);
  const [key, setKey] = useState(() => getWriteKey());
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
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[var(--press)] p-1">
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

      {!installed && (
        <button
          onClick={async () => { if (!(await install())) onShowInstallSteps(); }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-soft)] py-2.5 text-[14px] font-semibold text-[var(--accent)] active:scale-[0.98]"
        >
          <ShareIcon /> Add to Home Screen
        </button>
      )}

      <div className={`mt-4 ${LABEL}`}>Hidden stations</div>
      {hidden.length === 0 ? (
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--muted)]">
          None. Use &ldquo;No ethanol-free here anymore&rdquo; on a station to hide it.
        </p>
      ) : (
        <>
          <button
            onClick={() => setShowHidden((v) => !v)}
            className="mt-1.5 text-[13px] font-semibold text-[var(--danger)]"
            aria-expanded={showHidden}
          >
            {showHidden ? "Hide list" : `See hidden (${hidden.length})`}
          </button>
          {showHidden && (
            <ul className="mt-1.5 space-y-1">
              {hidden.map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-lg bg-[var(--danger)]/10 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--danger)]">{h.name}</span>
                  <button onClick={() => onRestore(h.id)} className="shrink-0 text-[12px] font-semibold text-[var(--accent)]">
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {apiUp && (
        <>
          <div className={`mt-4 ${LABEL}`}>Server key</div>
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setWriteKey(e.target.value.trim()); }}
            placeholder="Needed to add or hide stations"
            autoComplete="off"
            className="mt-1.5 h-10 w-full rounded-xl bg-[var(--press)] px-3 text-[16px] text-[var(--ink)] outline-none ring-1 ring-[var(--ring)] placeholder:text-[13px] placeholder:text-[var(--muted)] focus:ring-[var(--accent)]"
          />
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
        Distances are straight-line. Favorites are saved on this device; stations you add or hide are shared through the e0gas server.
      </p>
    </div>
  );
}
