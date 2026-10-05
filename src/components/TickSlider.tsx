"use client";

/** Where a value sits along the track, matching the 20px thumb's travel. */
const at = (pct: number) => `calc(10px + (100% - 20px) * ${pct})`;

/**
 * Range slider with labeled tick marks under the track and an optional value
 * bubble that rides above the thumb. Values are slider positions (min…max).
 */
export default function TickSlider({
  min, max, step, value, onChange, ticks, bubble, label,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
  /** Labeled stops; the one at the current value is highlighted. */
  ticks: { value: number; label: string }[];
  /** Text shown above the thumb. null keeps the room for it but hides it; omit for no bubble. */
  bubble?: string | null;
  label: string;
}) {
  const pct = (v: number) => (v - min) / (max - min);
  const fill = `${(pct(value) * 100).toFixed(1)}%`;
  return (
    <div className={`relative ${bubble !== undefined ? "pt-9" : "pt-1"}`}>
      {bubble && (
        <span
          className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--accent)] px-2 py-0.5 text-[13px] font-bold tabular-nums text-[var(--on-accent)] shadow after:absolute after:left-1/2 after:top-full after:-ml-[5px] after:border-[5px] after:border-transparent after:border-t-[var(--accent)] after:content-['']"
          // Clamped so the bubble stays inside the panel at either end.
          style={{ left: `clamp(30px, ${at(pct(value))}, calc(100% - 30px))` }}
        >
          {bubble}
        </span>
      )}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)}
        aria-label={label}
        aria-valuetext={bubble ?? ticks.find((t) => t.value === value)?.label}
        className="e0-range"
        style={{ ["--fill" as string]: fill }}
      />
      <div className="relative h-5">
        {ticks.map((t, i) => {
          const on = t.value === value;
          // End labels hug the edges so they never hang off the panel.
          const edge = i === 0 ? { left: 0 } : i === ticks.length - 1 ? { right: 0 } : { left: at(pct(t.value)) };
          const shift = i === 0 || i === ticks.length - 1 ? "" : "-translate-x-1/2";
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              className={`absolute top-0 ${shift} whitespace-nowrap text-[12px] tabular-nums ${on ? "font-bold text-[var(--accent)]" : "text-[var(--muted)]"}`}
              style={edge}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
