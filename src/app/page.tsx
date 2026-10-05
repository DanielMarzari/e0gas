"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  type Station, type Platform, loadStations, milesBetween, formatMiles, mapsLinkProps, gasBuddyUrl, detectPlatform, titleCase,
} from "@/lib/stations";
import type { LatLng, MapApi } from "@/components/StationMap";
import {
  type Settings, DEFAULT_PALETTE, loadSettings, saveSettings, applyTheme, paletteSwatch, resolveShade,
} from "@/lib/theme";
import { type Filter, NO_FILTER, applyFilter, isActive, radiusMiles, radiusLabel } from "@/lib/filters";
import { useCustomStations, useFavorites } from "@/lib/storage";
import SettingsPanel from "@/components/SettingsPanel";
import FilterPanel from "@/components/FilterPanel";
import InstallSheet from "@/components/InstallSheet";
import { useInstall } from "@/lib/install";
import { geocode } from "@/lib/geocode";
import AddStationForm, { type NewStation } from "@/components/AddStationForm";
import { CloseIcon, FilterIcon, GearIcon, LocateIcon, PinIcon, PlusIcon, SearchIcon, StarIcon } from "@/components/icons";

const StationMap = dynamic(() => import("@/components/StationMap"), { ssr: false });

type LocState = "idle" | "locating" | "denied" | "error" | "ok";
type Ranked = Station & { miles: number };
type Panel = "settings" | "filter" | null;
/** Bottom-sheet list size, changed by dragging or tapping its handle. */
type SheetSize = "min" | "normal" | "full";

const LIST_SIZE = 25;
/** Where the placement pin sits while adding a station (fraction of screen height). */
const PIN_Y = 0.32;
const FLOAT_BUTTON =
  "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-[var(--ring)] backdrop-blur-md active:scale-95 transition";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeDark(onChange: () => void) {
  const mq = matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export default function Home() {
  const mapApi = useRef<MapApi | null>(null);
  const [baseStations, setBaseStations] = useState<Station[]>([]);
  const [updated, setUpdated] = useState("");
  const [custom, setCustom] = useCustomStations();
  const [favoriteIds, setFavoriteIds] = useFavorites();
  const [user, setUser] = useState<LatLng | null>(null);
  const [loc, setLoc] = useState<LocState>("idle");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetSize, setSheetSize] = useState<SheetSize>("normal");
  const [showInstall, setShowInstall] = useState(false);
  const { platform: installPlatform } = useInstall();
  const [panel, setPanel] = useState<Panel>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  /** Search origin when location isn't shared: the map center when search was opened. */
  const [searchCenter, setSearchCenter] = useState<LatLng | null>(null);

  // ── Theme ──
  const systemDark = useSyncExternalStore(subscribeDark, () => matchMedia(DARK_QUERY).matches, () => false);
  // Browser-only values; the map and station links they affect never render on the server.
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window === "undefined" ? { palette: DEFAULT_PALETTE, mode: "system" } : loadSettings(),
  );
  const shade = resolveShade(settings.mode, systemDark);
  const accent = paletteSwatch(settings.palette, shade).accent;
  const updateSettings = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  useEffect(() => applyTheme(settings.palette, shade), [settings.palette, shade]);
  const [platform] = useState<Platform>(() => (typeof window === "undefined" ? "desktop" : detectPlatform()));

  useEffect(() => {
    loadStations().then((d) => {
      setBaseStations(d.stations);
      setUpdated(d.updated);
    });
  }, []);

  // ── Derived station sets ──
  const all = useMemo(() => [...baseStations, ...custom], [baseStations, custom]);
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);
  const favorites = useMemo(
    () => favoriteIds.map((id) => byId.get(id)).filter((s): s is Station => !!s),
    [favoriteIds, byId],
  );
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const selected = selectedId != null ? byId.get(selectedId) ?? null : null;

  const origin = user ?? searchCenter;
  const filtering = isActive(filter);
  const visible = useMemo(() => applyFilter(all, filter, origin), [all, filter, origin]);
  // Favorites draw as stars on their own layer; leave them out of the plain dots.
  const mapStations = useMemo(() => visible.filter((s) => !favSet.has(s.id)), [visible, favSet]);

  const rank = (list: Station[]): Ranked[] =>
    origin
      ? list.map((s) => ({ ...s, miles: milesBetween(origin.lat, origin.lng, s.lat, s.lng) })).sort((a, b) => a.miles - b.miles)
      : list.map((s) => ({ ...s, miles: NaN }));
  const nearest: Ranked[] = useMemo(
    () => (origin && all.length ? rank(visible).slice(0, LIST_SIZE) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origin, visible, all.length],
  );
  const rankedFavorites = useMemo(
    () => rank(favorites),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favorites, origin],
  );

  /** Most common brands within ~30 mi of where you're looking, for search chips. */
  const nearbyBrands = useMemo(() => {
    if (panel !== "filter" || !origin) return [];
    const counts = new Map<string, number>();
    for (const s of all) {
      if (!s.brand || s.brand === "NONE" || milesBetween(origin.lat, origin.lng, s.lat, s.lng) > 30) continue;
      const b = titleCase(s.brand);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b);
  }, [panel, origin, all]);

  // ── Actions ──
  const locate = () => {
    if (!("geolocation" in navigator)) return setLoc("error");
    setLoc("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUser({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLoc("ok");
        setSelectedId(null);
      },
      (err) => setLoc(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  /** Without a location, searches measure from wherever the map is looking. */
  const pinSearchCenter = () => {
    if (!user && mapApi.current) setSearchCenter(mapApi.current.center());
  };
  const togglePanel = (p: Panel) => {
    if (p === "filter" && panel !== "filter") pinSearchCenter();
    setPanel((cur) => (cur === p ? null : p));
  };

  const select = (id: number | null) => {
    setSelectedId(id);
    if (id != null) {
      setSheetSize("normal");
      setPanel(null);
    }
  };

  const toggleFavorite = (id: number) =>
    setFavoriteIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const startAdding = () => {
    if (adding) return;
    setPanel(null);
    setSelectedId(null);
    setShowFavorites(false);
    setFilter(NO_FILTER); // so the new station isn't hidden by an old search
    setAdding(true);
    // Zoom in on whatever is already under the pin (or on you), keeping it under the pin.
    const api = mapApi.current;
    if (api) api.flyTo(user ?? api.latLngAt(innerWidth / 2, innerHeight * PIN_Y), 15, innerHeight * PIN_Y);
  };

  const findAddress = async (address: string) => {
    const api = mapApi.current;
    const hit = await geocode(address, user ?? api?.center());
    if (hit && api) api.flyTo(hit, 17, innerHeight * PIN_Y);
    return !!hit;
  };

  const saveStation = (n: NewStation) => {
    const api = mapApi.current;
    if (!api) return;
    const at = api.latLngAt(innerWidth / 2, innerHeight * PIN_Y);
    const s: Station = {
      id: -Date.now(), lat: +at.lat.toFixed(5), lng: +at.lng.toFixed(5),
      name: n.name, brand: n.brand, street: n.street, city: n.city, state: "", octanes: n.octanes, custom: true,
    };
    setCustom((c) => [...c, s]);
    setAdding(false);
    setSelectedId(s.id);
  };

  const removeStation = (id: number) => {
    setCustom((c) => c.filter((s) => s.id !== id));
    setFavoriteIds((ids) => ids.filter((x) => x !== id));
    setSelectedId(null);
  };

  const selectedMiles = selected && origin ? milesBetween(origin.lat, origin.lng, selected.lat, selected.lng) : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--bg)]">
      <StationMap
        stations={mapStations}
        favorites={favorites}
        user={user}
        focus={nearest}
        selected={selected}
        onSelect={adding ? () => {} : select}
        radius={filter.radius && origin ? { center: origin, miles: radiusMiles(filter.radius) } : null}
        shade={shade}
        accent={accent}
        apiRef={mapApi}
      />

      {adding && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-full" style={{ top: `${PIN_Y * 100}%` }}>
          <PinIcon size={44} className="drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]" />
        </div>
      )}

      {/* Tap outside an open panel to close it */}
      {panel && <div className="absolute inset-0 z-10" onClick={() => setPanel(null)} aria-hidden />}

      {/* ── Top bar: search (with filters) · settings, favorites, add, locate ── */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start gap-2.5 px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="flex h-12 items-center rounded-full bg-[var(--surface)] shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-[var(--ring)] backdrop-blur-md focus-within:ring-[var(--accent)]">
            <span className="pl-4 pr-2 text-[var(--accent)]"><SearchIcon size={18} /></span>
            <input
              value={filter.query}
              onChange={(e) => {
                if (!filter.query) pinSearchCenter();
                setFilter({ ...filter, query: e.target.value });
              }}
              onFocus={() => setPanel(null)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="Search brand, town, octane"
              aria-label="Search stations"
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
            />
            {filter.query && (
              <button onClick={() => setFilter({ ...filter, query: "" })} aria-label="Clear search" className="grid h-full w-9 place-items-center text-[var(--muted)]">
                <CloseIcon />
              </button>
            )}
            <button
              onClick={() => togglePanel("filter")}
              aria-label="Filters"
              aria-expanded={panel === "filter"}
              className={`relative mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full transition ${panel === "filter" || filter.radius ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--accent)]"}`}
            >
              <FilterIcon />
            </button>
          </div>
          {filter.radius && panel !== "filter" && (
            <button
              onClick={() => setFilter({ ...filter, radius: null })}
              className="ml-2 mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] py-1 pl-3 pr-2 text-[13px] font-medium text-[var(--ink)] shadow-[0_4px_16px_-8px_rgba(15,23,42,0.3)] ring-1 ring-[var(--ring)] backdrop-blur-md"
            >
              Within {radiusLabel(filter.radius)} <span className="text-[var(--muted)]"><CloseIcon size={13} /></span>
            </button>
          )}
          {panel === "filter" && (
            <div className="mt-2.5">
              <FilterPanel
                filter={filter}
                brands={nearbyBrands}
                hasLocation={!!user}
                matches={visible.length}
                onChange={setFilter}
                onDone={() => setPanel(null)}
              />
            </div>
          )}
        </div>

        <div className="relative flex flex-col items-end gap-2.5">
          <button onClick={() => togglePanel("settings")} aria-label="Settings" aria-expanded={panel === "settings"} className={FLOAT_BUTTON}>
            <GearIcon />
          </button>
          {panel === "settings" ? (
            <div className="absolute right-0 top-[58px]">
              <SettingsPanel
                settings={settings}
                shade={shade}
                updated={updated}
                onChange={updateSettings}
                onShowInstallSteps={() => { setPanel(null); setShowInstall(true); }}
              />
            </div>
          ) : panel !== "filter" && (
            <>
              <button
                onClick={() => { setShowFavorites((v) => !v); setSelectedId(null); setAdding(false); }}
                aria-label="Favorites"
                aria-pressed={showFavorites}
                className={`${FLOAT_BUTTON} ${showFavorites ? "!bg-[var(--accent)] !text-[var(--on-accent)]" : ""}`}
              >
                <StarIcon filled={showFavorites || favorites.length > 0} />
              </button>
              <button
                onClick={startAdding}
                aria-label="Add a station"
                aria-pressed={adding}
                className={`${FLOAT_BUTTON} ${adding ? "!bg-[var(--accent)] !text-[var(--on-accent)]" : ""}`}
              >
                <PlusIcon />
              </button>
              {user && (
                <button onClick={locate} aria-label="Update my location" className={FLOAT_BUTTON}>
                  <LocateIcon spinning={loc === "locating"} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Bottom sheet ── */}
      <section className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="sheet overflow-hidden rounded-[28px] bg-[var(--surface-strong)] shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.3)] ring-1 ring-[var(--ring)] backdrop-blur-xl">
          {showInstall ? (
            <InstallSheet platform={installPlatform} onClose={() => setShowInstall(false)} />
          ) : adding ? (
            <AddStationForm onSave={saveStation} onCancel={() => setAdding(false)} onFindAddress={findAddress} />
          ) : selected ? (
            <SelectedCard
              station={selected}
              miles={selectedMiles}
              platform={platform}
              favorite={favSet.has(selected.id)}
              onToggleFavorite={() => toggleFavorite(selected.id)}
              onRemove={selected.custom ? () => removeStation(selected.id) : undefined}
              onClose={() => setSelectedId(null)}
            />
          ) : showFavorites ? (
            <FavoritesList items={rankedFavorites} onSelect={select} onClose={() => setShowFavorites(false)} />
          ) : origin && (loc === "ok" || filtering) ? (
            <NearestList
              title={filtering ? (user ? "Matches near you" : "Matches near map center") : "Nearest to you"}
              items={nearest}
              favorites={favSet}
              size={sheetSize}
              onResize={setSheetSize}
              onSelect={select}
            />
          ) : (
            <Intro loc={loc} onLocate={locate} />
          )}
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function Intro({ loc, onLocate }: { loc: LocState; onLocate: () => void }) {
  return (
    <div className="px-6 pb-5 pt-6">
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--ink)]">
        Pure gas, close by.
      </h1>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--muted)]">
        Find the nearest ethanol-free (E0) station — for boats, small engines, classics, or just better mileage.
      </p>
      <button
        onClick={onLocate}
        disabled={loc === "locating"}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-[var(--on-accent)] shadow-[0_10px_24px_-10px_var(--accent)] transition active:scale-[0.98] disabled:opacity-80"
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

function StationRow({
  s, index, favorite, onSelect,
}: { s: Ranked; index?: number; favorite: boolean; onSelect: (id: number) => void }) {
  return (
    <button
      onClick={() => onSelect(s.id)}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:bg-[var(--press)] hover:bg-[var(--press)]"
    >
      {index != null ? (
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${index === 0 ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"}`}>
          {index + 1}
        </span>
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f5b301] text-white"><StarIcon size={18} filled /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-[15px] font-medium text-[var(--ink)]">
          <span className="truncate">{titleCase(s.name)}</span>
          {favorite && index != null && <span className="shrink-0 text-[#f5b301]"><StarIcon size={14} filled /></span>}
        </div>
        <div className="truncate text-[13px] text-[var(--muted)]">{address(s)}</div>
        <Octanes octanes={s.octanes} />
      </div>
      {!Number.isNaN(s.miles) && (
        <div className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--ink)]">{formatMiles(s.miles)}</div>
      )}
    </button>
  );
}

const SIZES: SheetSize[] = ["min", "normal", "full"];

/** Drag (or tap) handle: drag up to grow the list, down to shrink it; tap cycles. */
function SheetHandle({ size, onResize }: { size: SheetSize; onResize: (s: SheetSize) => void }) {
  const startY = useRef<number | null>(null);
  const step = (dir: 1 | -1) => onResize(SIZES[Math.min(2, Math.max(0, SIZES.indexOf(size) + dir))]);
  return (
    <button
      className="block w-full touch-none pb-1 pt-2.5"
      aria-label={size === "full" ? "Shrink list" : "Expand list"}
      onPointerDown={(e) => { startY.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerUp={(e) => {
        const dy = startY.current == null ? 0 : e.clientY - startY.current;
        startY.current = null;
        if (dy < -24) step(1);
        else if (dy > 24) step(-1);
        else onResize(size === "full" ? "normal" : size === "min" ? "normal" : "full");
      }}
    >
      <span className="mx-auto block h-1.5 w-10 rounded-full bg-[var(--hairline)]" />
    </button>
  );
}

function NearestList({
  title, items, favorites, size, onResize, onSelect,
}: {
  title: string; items: Ranked[]; favorites: Set<number>; size: SheetSize;
  onResize: (s: SheetSize) => void; onSelect: (id: number) => void;
}) {
  const shown = size === "full" ? items : size === "normal" ? items.slice(0, 3) : [];
  return (
    <div>
      <SheetHandle size={size} onResize={onResize} />
      <div className={`flex items-baseline justify-between px-5 pt-1 ${size === "min" ? "pb-4" : "pb-2"}`}>
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
        {items.length > 3 && (
          <button onClick={() => onResize(size === "full" ? "normal" : "full")} className="text-[13px] font-medium text-[var(--accent)]">
            {size === "full" ? "Less" : `Show ${items.length}`}
          </button>
        )}
      </div>
      {size !== "min" && (items.length === 0 ? (
        <p className="px-5 pb-5 text-[14px] text-[var(--muted)]">No stations match. Try a wider radius or a different search.</p>
      ) : (
        <ul className={`overflow-y-auto overscroll-contain px-2 pb-2 ${size === "full" ? "max-h-[62dvh]" : ""}`}>
          {shown.map((s, i) => (
            <li key={s.id}><StationRow s={s} index={i} favorite={favorites.has(s.id)} onSelect={onSelect} /></li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function FavoritesList({ items, onSelect, onClose }: { items: Ranked[]; onSelect: (id: number) => void; onClose: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">Favorites</h2>
        <button onClick={onClose} aria-label="Close favorites" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--press)] text-[var(--muted)]">
          <CloseIcon />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-5 pb-5 pt-1 text-[14px] leading-snug text-[var(--muted)]">
          Tap a station, then the <span className="text-[#f5b301]">☆</span> to save it here. Favorites show as gold stars on the map.
        </p>
      ) : (
        <ul className="max-h-[50dvh] overflow-y-auto overscroll-contain px-2 pb-2">
          {items.map((s) => (
            <li key={s.id}><StationRow s={s} favorite onSelect={onSelect} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectedCard({
  station: s, miles, platform, favorite, onToggleFavorite, onRemove, onClose,
}: {
  station: Station; miles: number | null; platform: Platform; favorite: boolean;
  onToggleFavorite: () => void; onRemove?: () => void; onClose: () => void;
}) {
  return (
    <div className="px-5 pb-4 pt-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold leading-tight tracking-tight text-[var(--ink)]">{titleCase(s.name)}</h2>
          <p className="mt-1 text-[14px] text-[var(--muted)]">{address(s)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[var(--muted)]">
            {miles != null && <span className="font-semibold text-[var(--ink)]">{formatMiles(miles)} away</span>}
            {s.brand && s.brand !== "NONE" && <span>{titleCase(s.brand)}</span>}
            {s.custom && <span className="rounded-md bg-[var(--press)] px-1.5 text-[11px] font-medium">Added by you</span>}
          </div>
          <Octanes octanes={s.octanes} />
        </div>
        <button
          onClick={onToggleFavorite}
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--press)] active:scale-90 ${favorite ? "text-[#f5b301]" : "text-[var(--muted)]"}`}
        >
          <StarIcon size={18} filled={favorite} />
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--press)] text-[var(--muted)] active:scale-95"
        >
          <CloseIcon />
        </button>
      </div>
      <a
        {...mapsLinkProps(s, platform)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-[16px] font-semibold text-[var(--on-accent)] transition active:scale-[0.98]"
      >
        Directions in Google Maps
      </a>
      {(s.city || s.state) && (
        <>
          <a
            href={gasBuddyUrl(s)}
            target="_blank"
            rel="noopener"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-soft)] py-3 text-[15px] font-semibold text-[var(--accent)] transition active:scale-[0.98]"
          >
            Gas prices nearby on GasBuddy ↗
          </a>
          <p className="mt-1.5 text-center text-[11px] text-[var(--muted)]">GasBuddy doesn&apos;t list ethanol-free prices.</p>
        </>
      )}
      {onRemove && (
        <button onClick={onRemove} className="mt-3 w-full text-center text-[13px] font-medium text-[var(--warn)]">
          Remove this station
        </button>
      )}
    </div>
  );
}

function address(s: Station) {
  return [titleCase(s.street), titleCase(s.city), s.state].filter(Boolean).join(", ");
}

function Octanes({ octanes }: { octanes: number[] }) {
  if (!octanes.length) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Octane</span>
      {octanes.map((o) => (
        <span key={o} className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--accent)]">
          {o}
        </span>
      ))}
    </div>
  );
}
