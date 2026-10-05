"use client";

import { useState } from "react";
import {
  type Filter, type Radius, MAX_MILES, MAX_MINUTES, OCTANE_STEPS, minutesLabel, radiusMiles,
} from "@/lib/filters";
import { StarIcon } from "@/components/icons";

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]";
const SLIDER = "mt-2 w-full accent-[var(--accent)] h-6";

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between">
        <span className={LABEL}>{label}</span>
        <span className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">{value}</span>
      </div>
      {children}
    </div>
  );
}

export default function FilterPanel({
  filter, hasLocation, favoriteCount, matches, onChange, onDone,
}: {
  filter: Filter;
  hasLocation: boolean;
  favoriteCount: number;
  matches: number;
  onChange: (f: Filter) => void;
  onDone: () => void;
}) {
  const set = (patch: Partial<Filter>) => onChange({ ...filter, ...patch });
  // Unit for the distance slider; remembered even while no distance is set.
  const [kind, setKindState] = useState<Radius["kind"]>(filter.radius?.kind ?? "mi");
  const max = kind === "mi" ? MAX_MILES : MAX_MINUTES;
  const step = kind === "mi" ? 1 : 5;
  const radiusValue = filter.radius?.value ?? 0;
  const octIdx = filter.minOctane == null ? 0 : OCTANE_STEPS.indexOf(filter.minOctane) + 1;

  const setKind = (k: Radius["kind"]) => {
    setKindState(k);
    if (!filter.radius || filter.radius.kind === k) return;
    // Keep roughly the same circle when switching units (drive time ≈ 0.5 mi per minute).
    const mi = radiusMiles(filter.radius);
    const v = k === "min" ? Math.min(MAX_MINUTES, Math.max(5, Math.round(mi / 0.5 / 5) * 5)) : Math.min(MAX_MILES, Math.max(1, Math.round(mi)));
    set({ radius: { kind: k, value: v } });
  };

  return (
    <div className="rounded-3xl bg-[var(--surface-strong)] p-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-[var(--ring)] backdrop-blur-xl">
      <button
        onClick={() => set({ favoritesOnly: !filter.favoritesOnly })}
        aria-pressed={filter.favoritesOnly}
        className="flex w-full items-center gap-3 rounded-2xl bg-[var(--press)] px-3 py-2.5 text-left ring-1 ring-[var(--ring)]"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f5b301] text-white"><StarIcon size={16} filled /></span>
        <span className="flex-1">
          <span className="block text-[15px] font-medium text-[var(--ink)]">Favorites only</span>
          <span className="block text-[12px] text-[var(--muted)]">
            {favoriteCount ? `${favoriteCount} saved` : "Tap ☆ on a station to save it"}
          </span>
        </span>
        <span className={`relative h-6 w-10 rounded-full transition ${filter.favoritesOnly ? "bg-[var(--accent)]" : "bg-[var(--hairline)]"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${filter.favoritesOnly ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>

      <Row label="Minimum octane" value={filter.minOctane == null ? "Any" : `${filter.minOctane}+`}>
        <input
          type="range" min={0} max={OCTANE_STEPS.length} step={1} value={octIdx}
          onChange={(e) => { const i = +e.target.value; set({ minOctane: i === 0 ? null : OCTANE_STEPS[i - 1] }); }}
          aria-label="Minimum octane"
          className={SLIDER}
        />
      </Row>

      <div className="mt-4 flex items-center justify-between">
        <span className={LABEL}>Within</span>
        <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-[var(--press)] p-0.5 text-[12px] font-medium">
          {(["mi", "min"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-md px-2.5 py-1 ${kind === k ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--ink)]"}`}
            >
              {k === "mi" ? "Miles" : "Drive time"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1 flex items-baseline justify-end">
        <span className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">
          {!filter.radius ? "Any distance" : kind === "mi" ? `${radiusValue} mi` : `~${minutesLabel(radiusValue)}`}
        </span>
      </div>
      <input
        type="range" min={0} max={max} step={step} value={radiusValue}
        onChange={(e) => { const v = +e.target.value; set({ radius: v ? { kind, value: v } : null }); }}
        aria-label="Distance"
        className={SLIDER}
      />
      <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
        {filter.radius
          ? `${radiusMiles(filter.radius)} mi circle around ${hasLocation ? "you" : "the map center"}${kind === "min" ? " — drive time is a rough guess" : ""}.`
          : `Slide to limit by distance from ${hasLocation ? "you" : "the map center"}.`}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onChange({ ...filter, radius: null, minOctane: null, favoritesOnly: false })}
          className="h-11 rounded-xl px-4 text-[14px] font-medium text-[var(--muted)]"
        >
          Reset
        </button>
        <button
          onClick={onDone}
          className="h-11 flex-1 rounded-xl bg-[var(--accent)] text-[15px] font-semibold text-[var(--on-accent)] active:scale-[0.98]"
        >
          Show {matches.toLocaleString()} station{matches === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
