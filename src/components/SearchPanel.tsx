"use client";

import { type Filter, type Radius, MILE_OPTIONS, MINUTE_OPTIONS, radiusMiles } from "@/lib/filters";
import { CloseIcon, SearchIcon } from "@/components/icons";

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]";
const OCTANES = ["87", "88", "89", "90", "91", "93", "91+"];

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${on ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--press)] text-[var(--ink)] ring-1 ring-[var(--ring)]"}`}
    >
      {children}
    </button>
  );
}

export default function SearchPanel({
  filter, brands, hasLocation, matches, onChange, onDone,
}: {
  filter: Filter;
  /** Common brands near the map center, for one-tap search. */
  brands: string[];
  hasLocation: boolean;
  matches: number;
  onChange: (f: Filter) => void;
  onDone: () => void;
}) {
  const setQuery = (query: string) => onChange({ ...filter, query });
  const toggleQuery = (q: string) => setQuery(filter.query.toLowerCase() === q.toLowerCase() ? "" : q);
  const setRadius = (r: Radius | null) => onChange({ ...filter, radius: r });
  const radiusIs = (kind: Radius["kind"], value: number) => filter.radius?.kind === kind && filter.radius.value === value;

  return (
    <div className="rounded-3xl bg-[var(--surface-strong)] p-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-[var(--ring)] backdrop-blur-xl">
      <label className="flex items-center gap-2 rounded-xl bg-[var(--press)] px-3 ring-1 ring-[var(--ring)] focus-within:ring-[var(--accent)]">
        <span className="text-[var(--muted)]"><SearchIcon size={18} /></span>
        <input
          autoFocus
          value={filter.query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onDone()}
          placeholder="Brand, town or octane (90, 91+)"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          enterKeyHint="search"
        />
        {filter.query && (
          <button onClick={() => setQuery("")} aria-label="Clear search" className="text-[var(--muted)]"><CloseIcon /></button>
        )}
      </label>

      {brands.length > 0 && (
        <>
          <div className={`mt-3 ${LABEL}`}>Brand</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <Chip key={b} on={filter.query.toLowerCase() === b.toLowerCase()} onClick={() => toggleQuery(b)}>{b}</Chip>
            ))}
          </div>
        </>
      )}

      <div className={`mt-3 ${LABEL}`}>Octane</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {OCTANES.map((o) => (
          <Chip key={o} on={filter.query === o} onClick={() => toggleQuery(o)}>{o}</Chip>
        ))}
      </div>

      <div className={`mt-3 ${LABEL}`}>Within</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Chip on={!filter.radius} onClick={() => setRadius(null)}>Any</Chip>
        {MILE_OPTIONS.map((v) => (
          <Chip key={v} on={radiusIs("mi", v)} onClick={() => setRadius({ kind: "mi", value: v })}>{v} mi</Chip>
        ))}
      </div>
      <div className={`mt-3 ${LABEL}`}>Drive time (approx)</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {MINUTE_OPTIONS.map((v) => (
          <Chip key={v} on={radiusIs("min", v)} onClick={() => setRadius({ kind: "min", value: v })}>{v} min</Chip>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
        {filter.radius
          ? `Circle of ${radiusMiles(filter.radius)} mi around ${hasLocation ? "you" : "the map center"}${filter.radius.kind === "min" ? " — drive time is a rough guess (~30 mph as the crow flies)" : ""}.`
          : `Measured from ${hasLocation ? "your location" : "the map center"}.`}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onChange({ query: "", radius: null })}
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
