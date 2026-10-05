"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/geocode";
import { LocateIcon } from "@/components/icons";

export type NewStation = { name: string; brand: string; street: string; city: string; state: string; octanes: number[] };

const OCTANES = [87, 88, 89, 90, 91, 92, 93];
const INPUT =
  "h-11 w-full rounded-xl bg-[var(--press)] px-3 text-[16px] text-[var(--ink)] outline-none ring-1 ring-[var(--ring)] placeholder:text-[var(--muted)] focus:ring-[var(--accent)]";
/** Wait this long after typing stops before looking the address up. */
const LOOKUP_DELAY_MS = 900;

type Lookup = "idle" | "busy" | "missing" | "found";

/** Sheet content while placing a new station: the map pin marks where it goes. */
export default function AddStationForm({
  onSave, onCancel, onFindAddress, onUseMyLocation,
}: {
  onSave: (s: NewStation) => void;
  onCancel: () => void;
  /** Look up the address and move the pin there; null if not found. */
  onFindAddress: (address: string) => Promise<Place | null>;
  /** Move the pin to where you are now. */
  onUseMyLocation: () => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [address, setAddress] = useState("");
  const [octanes, setOctanes] = useState<number[]>([90]);
  const [lookup, setLookup] = useState<Lookup>("idle");
  /** Place the pin by typing an address, or at where you are now. */
  const [mode, setMode] = useState<"address" | "here">("address");
  const place = useRef<Place | null>(null);
  const toggle = (o: number) => setOctanes((os) => (os.includes(o) ? os.filter((x) => x !== o) : [...os, o].sort()));

  // Look the address up on its own once typing pauses (needs a house number or a town to be worth it).
  useEffect(() => {
    const q = address.trim();
    if (mode !== "address" || q.length < 6 || !/\d|,/.test(q)) return;
    let stale = false;
    const t = setTimeout(async () => {
      setLookup("busy");
      try {
        const hit = await onFindAddress(q);
        if (stale) return;
        place.current = hit;
        setLookup(hit ? "found" : "missing");
      } catch {
        if (!stale) setLookup("missing");
      }
    }, LOOKUP_DELAY_MS);
    return () => { stale = true; clearTimeout(t); };
    // onFindAddress is stable enough; re-running on every parent render would re-query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, mode]);

  return (
    <form
      className="px-5 pb-4 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        // "123 Main St, Kutztown, PA" → street "123 Main St"; town/state from the lookup when we have one.
        const parts = (mode === "address" ? address : "").split(",").map((x) => x.trim()).filter(Boolean);
        onSave({
          name: name.trim(),
          brand: brand.trim(),
          street: parts[0] ?? "",
          city: place.current?.city || parts[1] || "",
          state: place.current?.state || "",
          octanes,
        });
      }}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight text-[var(--ink)]">Add a station</h2>
        <button type="button" onClick={onCancel} className="text-[14px] font-medium text-[var(--muted)]">Cancel</button>
      </div>
      <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">
        Place the pin by address or at your location, then drag the map to fine-tune. Saved on this device only.
      </p>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--press)] p-1 text-[13px] font-medium">
          {([["address", "Address"], ["here", "My location"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                if (m === "here") onUseMyLocation();
              }}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 ${mode === m ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--ink)]"}`}
            >
              {m === "here" && <LocateIcon size={14} />} {label}
            </button>
          ))}
        </div>
        {mode === "address" ? (
          <>
            <div className="relative">
              <input
                className={`${INPUT} pr-10`}
                value={address}
                onChange={(e) => { setAddress(e.target.value); setLookup("idle"); place.current = null; }}
                placeholder="Address, e.g. 15475 Kutztown Rd"
                autoComplete="street-address"
                enterKeyHint="next"
              />
              {lookup === "busy" && (
                <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              )}
              {lookup === "found" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--accent)]">✓</span>}
            </div>
            {lookup === "missing" && (
              <p className="text-[12px] text-[var(--warn)]">Couldn&apos;t find that address. Add the town, or drag the map instead.</p>
            )}
          </>
        ) : (
          <p className="flex h-11 items-center px-1 text-[13px] text-[var(--muted)]">
            Pin moved to where you are. Drag the map if the pumps are a bit off.
          </p>
        )}
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rutter's Palmer)" required />
        <input className={INPUT} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)" />
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
