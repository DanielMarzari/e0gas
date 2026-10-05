"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  type Station, loadStations, milesBetween, formatMiles, googleMapsUrl, titleCase,
} from "@/lib/stations";
import type { LatLng } from "@/components/StationMap";

const StationMap = dynamic(() => import("@/components/StationMap"), { ssr: false });

type LocState = "idle" | "locating" | "denied" | "error" | "ok";
type Ranked = Station & { miles: number };

const LIST_SIZE = 25;

export default function Home() {
  const [stations, setStations] = useState<Station[]>([]);
  const [updated, setUpdated] = useState("");
  const [user, setUser] = useState<LatLng | null>(null);
  const [loc, setLoc] = useState<LocState>("idle");
  const [selected, setSelected] = useState<Station | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadStations().then((d) => {
      setStations(d.stations);
      setUpdated(d.updated);
    });
  }, []);

  const nearest: Ranked[] = useMemo(() => {
    if (!user || !stations.length) return [];
    return stations
      .map((s) => ({ ...s, miles: milesBetween(user.lat, user.lng, s.lat, s.lng) }))
      .sort((a, b) => a.miles - b.miles)
      .slice(0, LIST_SIZE);
  }, [user, stations]);

  const locate = () => {
    if (!("geolocation" in navigator)) return setLoc("error");
    setLoc("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUser({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLoc("ok");
        setSelected(null);
      },
      (err) => setLoc(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const selectedMiles = selected && user ? milesBetween(user.lat, user.lng, selected.lat, selected.lng) : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--bg)]">
      <StationMap
        stations={stations}
        user={user}
        focus={nearest}
        selectedId={selected?.id ?? null}
        onSelect={(s) => { setSelected(s); if (s) setExpanded(false); }}
      />

      {/* ── Brand ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-[max(14px,env(safe-area-inset-top))] px-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white/90 py-2 pl-2 pr-4 shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-black/5 backdrop-blur-md">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-[13px] font-bold tracking-tight text-white">
            E0
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-[var(--ink)]">e0 gas</div>
            <div className="text-[11px] text-[var(--muted)]">
              {stations.length ? `${stations.length.toLocaleString()} ethanol-free stations` : "Loading stations…"}
            </div>
          </div>
        </div>
      </header>

      {/* ── Re-center ── */}
      {user && (
        <button
          onClick={locate}
          aria-label="Update my location"
          className="absolute right-4 top-[max(14px,env(safe-area-inset-top))] grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[var(--accent)] shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-black/5 backdrop-blur-md active:scale-95 transition"
        >
          <LocateIcon spinning={loc === "locating"} />
        </button>
      )}

      {/* ── Bottom sheet ── */}
      <section className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="sheet overflow-hidden rounded-[28px] bg-white/95 shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.3)] ring-1 ring-black/5 backdrop-blur-xl">
          {selected ? (
            <SelectedCard station={selected} miles={selectedMiles} onClose={() => setSelected(null)} />
          ) : loc !== "ok" ? (
            <Intro loc={loc} onLocate={locate} />
          ) : (
            <NearestList
              items={nearest}
              expanded={expanded}
              onToggle={() => setExpanded((e) => !e)}
              updated={updated}
            />
          )}
          <Credits />
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function Intro({ loc, onLocate }: { loc: LocState; onLocate: () => void }) {
  return (
    <div className="px-6 pb-4 pt-6">
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--ink)]">
        Pure gas, close by.
      </h1>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--muted)]">
        Find the nearest ethanol-free (E0) station — for boats, small engines, classics, or just better mileage.
      </p>
      <button
        onClick={onLocate}
        disabled={loc === "locating"}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-white shadow-[0_10px_24px_-10px_var(--accent)] transition active:scale-[0.98] disabled:opacity-80"
      >
        <LocateIcon spinning={loc === "locating"} />
        {loc === "locating" ? "Finding you…" : "Share my location"}
      </button>
      {loc === "denied" && (
        <p className="mt-3 text-center text-[13px] text-[var(--warn)]">
          Location is blocked. Allow it for this site in your browser settings, then try again.
        </p>
      )}
      {loc === "error" && (
        <p className="mt-3 text-center text-[13px] text-[var(--warn)]">
          Couldn&apos;t get your location. Check that location services are on and try again.
        </p>
      )}
      {loc === "idle" && (
        <p className="mt-3 text-center text-[12px] text-[var(--muted)]">
          Your location stays on your device — it&apos;s only used to sort stations by distance.
        </p>
      )}
    </div>
  );
}

function NearestList({
  items, expanded, onToggle, updated,
}: { items: Ranked[]; expanded: boolean; onToggle: () => void; updated: string }) {
  const shown = expanded ? items : items.slice(0, 3);
  return (
    <div>
      <button onClick={onToggle} className="block w-full pt-2.5 pb-1" aria-label={expanded ? "Show fewer" : "Show more"}>
        <span className="mx-auto block h-1.5 w-10 rounded-full bg-black/15" />
      </button>
      <div className="flex items-baseline justify-between px-5 pb-2 pt-1">
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">Nearest to you</h2>
        <button onClick={onToggle} className="text-[13px] font-medium text-[var(--accent)]">
          {expanded ? "Less" : `Show ${items.length}`}
        </button>
      </div>
      <ul className={`overflow-y-auto overscroll-contain px-2 pb-2 ${expanded ? "max-h-[62dvh]" : ""}`}>
        {shown.map((s, i) => (
          <li key={s.id}>
            <a
              href={googleMapsUrl(s)}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 rounded-2xl px-3 py-3 transition active:bg-black/[0.04] hover:bg-black/[0.03]"
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${i === 0 ? "bg-[var(--accent)] text-white" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-[var(--ink)]">{titleCase(s.name)}</div>
                <div className="truncate text-[13px] text-[var(--muted)]">
                  {[titleCase(s.street), titleCase(s.city), s.state].filter(Boolean).join(", ")}
                </div>
                <Octanes octanes={s.octanes} />
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatMiles(s.miles)}</div>
                <div className="text-[11px] text-[var(--accent)]">Directions ↗</div>
              </div>
            </a>
          </li>
        ))}
      </ul>
      {expanded && (
        <p className="px-5 pb-1 pt-1 text-[11px] text-[var(--muted)]">
          Straight-line distances{updated ? ` · stations updated ${updated}` : ""}. Call ahead to confirm.
        </p>
      )}
    </div>
  );
}

function SelectedCard({ station: s, miles, onClose }: { station: Station; miles: number | null; onClose: () => void }) {
  return (
    <div className="px-5 pb-4 pt-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold leading-tight tracking-tight text-[var(--ink)]">{titleCase(s.name)}</h2>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            {[titleCase(s.street), titleCase(s.city), s.state].filter(Boolean).join(", ")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--muted)]">
            {miles != null && <span className="font-semibold text-[var(--ink)]">{formatMiles(miles)} away</span>}
            {s.brand && <span>{titleCase(s.brand)}</span>}
          </div>
          <Octanes octanes={s.octanes} />
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/5 text-[var(--muted)] active:scale-95"
        >
          ✕
        </button>
      </div>
      <a
        href={googleMapsUrl(s)}
        target="_blank"
        rel="noopener"
        className="mt-4 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-[16px] font-semibold text-white transition active:scale-[0.98]"
      >
        Open in Google Maps
      </a>
    </div>
  );
}

function Credits() {
  const link = "underline decoration-black/20 underline-offset-2";
  return (
    <p className="px-5 pb-3 pt-0.5 text-center text-[10px] leading-snug text-[var(--muted)]/80">
      Stations © <a className={link} href="https://www.pure-gas.org" target="_blank" rel="noopener">pure-gas.org</a> (CC BY-NC)
      {" · "}Map © <a className={link} href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
      {" "}© <a className={link} href="https://www.openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>
      {" "}© <a className={link} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
    </p>
  );
}

function Octanes({ octanes }: { octanes: number[] }) {
  if (!octanes.length) return null;
  return (
    <div className="mt-1.5 flex gap-1">
      {octanes.map((o) => (
        <span key={o} className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--accent)]">
          {o}
        </span>
      ))}
    </div>
  );
}

function LocateIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
      aria-hidden
    >
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
