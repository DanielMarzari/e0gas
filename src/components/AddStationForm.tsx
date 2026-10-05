"use client";

import { useState } from "react";

export type NewStation = { name: string; brand: string; street: string; city: string; octanes: number[] };

const OCTANES = [87, 88, 89, 90, 91, 92, 93];
const INPUT =
  "h-11 w-full rounded-xl bg-[var(--press)] px-3 text-[16px] text-[var(--ink)] outline-none ring-1 ring-[var(--ring)] placeholder:text-[var(--muted)] focus:ring-[var(--accent)]";

/** Sheet content while placing a new station: the map pin marks where it goes. */
export default function AddStationForm({
  onSave, onCancel, onFindAddress,
}: {
  onSave: (s: NewStation) => void;
  onCancel: () => void;
  /** Look up the address and move the pin there; resolves false if not found. */
  onFindAddress: (address: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [octanes, setOctanes] = useState<number[]>([90]);
  const [finding, setFinding] = useState<"idle" | "busy" | "missing" | "found">("idle");
  const address = [street, city].map((x) => x.trim()).filter(Boolean).join(", ");
  const find = async () => {
    if (!address) return;
    setFinding("busy");
    try {
      setFinding((await onFindAddress(address)) ? "found" : "missing");
    } catch {
      setFinding("missing");
    }
  };
  const toggle = (o: number) => setOctanes((os) => (os.includes(o) ? os.filter((x) => x !== o) : [...os, o].sort()));

  return (
    <form
      className="px-5 pb-4 pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSave({ name: name.trim(), brand: brand.trim(), street: street.trim(), city: city.trim(), octanes });
      }}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">Add a station</h2>
        <button type="button" onClick={onCancel} className="text-[14px] font-medium text-[var(--muted)]">Cancel</button>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
        Type the address and tap Find, or drag the map so the pin sits on the station. Saved on this device only.
      </p>
      <div className="mt-3 space-y-2">
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rutter's Palmer)" required />
        <div className="flex gap-2">
          <input className={INPUT} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)" />
          <input className={INPUT} value={city} onChange={(e) => { setCity(e.target.value); setFinding("idle"); }} placeholder="Town" />
        </div>
        <div className="flex gap-2">
          <input
            className={INPUT}
            value={street}
            onChange={(e) => { setStreet(e.target.value); setFinding("idle"); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(); } }}
            placeholder="Street address"
          />
          <button
            type="button"
            onClick={find}
            disabled={!address || finding === "busy"}
            className="h-11 shrink-0 rounded-xl bg-[var(--accent-soft)] px-4 text-[14px] font-semibold text-[var(--accent)] disabled:opacity-50"
          >
            {finding === "busy" ? "…" : "Find"}
          </button>
        </div>
        {finding === "missing" && (
          <p className="text-[12px] text-[var(--warn)]">Couldn&apos;t find that address — add the town, or drag the map instead.</p>
        )}
        {finding === "found" && (
          <p className="text-[12px] text-[var(--muted)]">Pin moved. Nudge the map if it&apos;s not quite on the pumps.</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Octane</span>
        {OCTANES.map((o) => (
          <button
            type="button"
            key={o}
            onClick={() => toggle(o)}
            aria-pressed={octanes.includes(o)}
            className={`rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${octanes.includes(o) ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--press)] text-[var(--ink)] ring-1 ring-[var(--ring)]"}`}
          >
            {o}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={!name.trim()}
        className="mt-4 h-12 w-full rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-[var(--on-accent)] transition active:scale-[0.98] disabled:opacity-50"
      >
        Save station here
      </button>
    </form>
  );
}
