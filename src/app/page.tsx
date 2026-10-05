"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  type Station, type Platform, loadStations, milesBetween, formatMiles, mapsLinkProps, gasBuddyUrl, detectPlatform, titleCase,
} from "@/lib/stations";
import type { LatLng, MapApi } from "@/components/StationMap";
import {
  type Settings, DEFAULT_PALETTE, loadSettings, saveSettings, applyTheme, paletteSwatch, resolveShade,
} from "@/lib/theme";
import { type Filter, NO_FILTER, applyFilter, filterCount, isActive, radiusMiles } from "@/lib/filters";
import { useCustomStations, useFavorites } from "@/lib/storage";
import SettingsPanel from "@/components/SettingsPanel";
import FilterPanel from "@/components/FilterPanel";
import SearchControl from "@/components/SearchControl";
import InstallSheet from "@/components/InstallSheet";
import { useInstall } from "@/lib/install";
import { geocode } from "@/lib/geocode";
import AddStationForm, { type NewStation } from "@/components/AddStationForm";
import { CloseIcon, GearIcon, LocateIcon, PinIcon, PlusIcon, StarIcon } from "@/components/icons";

const StationMap = dynamic(() => import("@/components/StationMap"), { ssr: false });

type LocState = "idle" | "locating" | "denied" | "error" | "ok";
type Ranked = Station & { miles: number };
type Panel = "settings" | "filter" | null;
/** Bottom-sheet list size, changed by dragging or tapping its handle. */
type SheetSize = "open" | "none";

const LIST_SIZE = 25;
/** Shared spring for the search morph, side buttons and bottom sheet. */
const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;
/** The round buttons' tap: a quick press-in and springy pop back (same as search closing). */
const PRESS = { whileTap: { scale: 0.86 }, transition: { type: "spring", stiffness: 520, damping: 20 } } as const;
/** Where the placement pin sits while adding a station (fraction of screen height). */
const PIN_Y = 0.32;
const FLOAT_BUTTON =
  "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-[0_6px_24px_-8px_rgba(15,23,42,0.25)] ring-1 ring-[var(--ring)] backdrop-blur-md";
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
  // Start low so the map gets the screen.
  const [sheetSize, setSheetSize] = useState<SheetSize>("open");
  const [showInstall, setShowInstall] = useState(false);
  const { platform: installPlatform } = useInstall();
  const [panel, setPanel] = useState<Panel>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Visible map area, for the "in view" count. */
  const [view, setView] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  /** Bottom edge of the open filter card, so the map can frame the radius beneath it. */
  const filterRef = useRef<HTMLDivElement>(null);
  const [filterBottom, setFilterBottom] = useState(0);
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
  const visible = useMemo(() => applyFilter(all, filter, origin, favSet), [all, filter, origin, favSet]);
  // Favorites draw as stars on their own layer; leave them out of the plain dots.
  const mapStations = useMemo(() => visible.filter((s) => !favSet.has(s.id)), [visible, favSet]);
  // …and like everything else, they only show when they match the search and filters.
  const mapFavorites = useMemo(() => {
    if (!filtering) return favorites;
    const ids = new Set(visible.map((s) => s.id));
    return favorites.filter((s) => ids.has(s.id));
  }, [favorites, visible, filtering]);

  const rank = (list: Station[]): Ranked[] =>
    origin
      ? list.map((s) => ({ ...s, miles: milesBetween(origin.lat, origin.lng, s.lat, s.lng) })).sort((a, b) => a.miles - b.miles)
      : list.map((s) => ({ ...s, miles: NaN }));
  const nearest: Ranked[] = useMemo(
    () => (origin && all.length ? rank(visible).slice(0, LIST_SIZE) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [origin, visible, all.length],
  );
  const inView = useMemo(() => {
    if (!view) return null;
    const { west, south, east, north } = view;
    return visible.filter((s) => s.lat >= south && s.lat <= north && s.lng >= west && s.lng <= east).length;
  }, [visible, view]);

  useEffect(() => {
    const el = filterRef.current;
    if (panel !== "filter" || !el) return;
    const ro = new ResizeObserver(() => setFilterBottom(el.getBoundingClientRect().bottom));
    ro.observe(el);
    return () => ro.disconnect();
  }, [panel, searchOpen]);
  // While filters are open, frame the radius (and your pin) in the map below them;
  // afterwards, back to the upper part of the screen above the list.
  const insets = panel === "filter" && filterBottom
    ? { top: Math.round(filterBottom + 16), bottom: 100 }
    : { top: 90, bottom: typeof window === "undefined" ? 300 : Math.round(window.innerHeight * 0.42) };

  // ── Actions ──
  const locate = (then?: (at: LatLng) => void) => {
    if (!("geolocation" in navigator)) return setLoc("error");
    setLoc("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const at = { lat: p.coords.latitude, lng: p.coords.longitude };
        setUser(at);
        setLoc("ok");
        setSelectedId(null);
        then?.(at);
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
    // Filters get the screen: tuck the list away while they're open.
    if (p === "filter") setSheetSize(panel === "filter" ? "open" : "none");
    if (p === "filter" && panel !== "filter") pinSearchCenter();
    setPanel((cur) => (cur === p ? null : p));
  };

  const select = (id: number | null) => {
    setSelectedId(id);
    if (id != null) setPanel(null);
  };

  const openSearch = () => {
    pinSearchCenter();
    setSearchOpen(true);
    setPanel(null);
  };
  /** Collapse the search bar; filters stay on (the search button shows a badge). */
  const closeSearch = () => {
    setFilter((f) => ({ ...f, query: "" }));
    setSearchOpen(false);
    if (panel === "filter") setSheetSize("open");
    setPanel(null);
  };

  const toggleFavorite = (id: number) =>
    setFavoriteIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const startAdding = () => {
    if (adding) return;
    setPanel(null);
    setSelectedId(null);
    setSearchOpen(false);
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
    return hit;
  };

  /** While adding: put the pin on where you are (asking for location if needed). */
  const pinMyLocation = () => {
    const fly = (at: LatLng) => mapApi.current?.flyTo(at, 17, innerHeight * PIN_Y);
    if (user) fly(user);
    else locate(fly);
  };

  const saveStation = (n: NewStation) => {
    const api = mapApi.current;
    if (!api) return;
    const at = api.latLngAt(innerWidth / 2, innerHeight * PIN_Y);
    const s: Station = {
      id: -Date.now(), lat: +at.lat.toFixed(5), lng: +at.lng.toFixed(5),
      name: n.name, brand: n.brand, street: n.street, city: n.city, state: n.state, octanes: n.octanes, custom: true,
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
    // dvh: stays clear of mobile browser toolbars, so the bottom card is never hidden behind them.
    <div className="fixed inset-x-0 top-0 h-[100dvh] overflow-hidden bg-[var(--bg)]">
      <StationMap
        stations={mapStations}
        favorites={mapFavorites}
        user={user}
        frameUser={!adding}
        focus={nearest}
        selected={selected}
        onSelect={adding ? () => {} : select}
        radius={filter.radius && origin ? { center: origin, miles: radiusMiles(filter.radius) } : null}
        shade={shade}
        accent={accent}
        apiRef={mapApi}
        insets={insets}
        onViewChange={setView}
      />

      {adding && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-full" style={{ top: `${PIN_Y * 100}%` }}>
          <PinIcon size={44} className="drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]" />
        </div>
      )}

      {/* Tap outside an open panel to close it */}
      {panel && (
        <div
          className="absolute inset-0 z-10"
          onClick={() => { if (panel === "filter") setSheetSize("open"); setPanel(null); }}
          aria-hidden
        />
      )}

      {/* ── Search: round button that springs open into the search bar ── */}
      <div className="absolute right-4 top-[max(14px,env(safe-area-inset-top))] z-20 flex justify-end">
        <SearchControl
          open={searchOpen}
          query={filter.query}
          onQueryChange={(q) => setFilter({ ...filter, query: q })}
          onOpen={openSearch}
          onClose={closeSearch}
          onInputFocus={() => setPanel(null)}
          filterCount={filterCount(filter)}
          filterOpen={panel === "filter"}
          onToggleFilter={() => togglePanel("filter")}
          closedBadge={isActive(filter) ? filterCount(filter) || 1 : 0}
        />
      </div>

      <AnimatePresence>
        {searchOpen && panel === "filter" && (
          <motion.div
            ref={filterRef}
            className="absolute inset-x-4 top-[calc(max(14px,env(safe-area-inset-top))+60px)] z-20 ml-auto max-w-xl origin-top"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <FilterPanel
              filter={filter}
              hasLocation={!!user}
              favoriteCount={favorites.length}
              matches={visible.length}
              onChange={setFilter}
              onDone={() => { setPanel(null); setSheetSize("open"); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Side buttons under the search spot: settings · add · locate ── */}
      {panel !== "filter" && (
        <div className="absolute right-4 top-[calc(max(14px,env(safe-area-inset-top))+60px)] z-20 flex flex-col items-end gap-2.5">
          <div className="relative">
            <motion.button {...PRESS} onClick={() => togglePanel("settings")} aria-label="Settings" aria-expanded={panel === "settings"} className={FLOAT_BUTTON}>
              <GearIcon />
            </motion.button>
            {panel === "settings" && (
              <div className="absolute right-0 top-[58px]">
                <SettingsPanel
                  settings={settings}
                  shade={shade}
                  updated={updated}
                  onChange={updateSettings}
                  onShowInstallSteps={() => { setPanel(null); setShowInstall(true); }}
                />
              </div>
            )}
          </div>
          {panel !== "settings" && (
            <>
              <motion.button
                {...PRESS}
                onClick={startAdding}
                aria-label="Add a station"
                aria-pressed={adding}
                className={`${FLOAT_BUTTON} ${adding ? "!bg-[var(--accent)] !text-[var(--on-accent)]" : ""}`}
              >
                <PlusIcon />
              </motion.button>
              <motion.button {...PRESS} onClick={() => locate()} aria-label={user ? "Update my location" : "Share my location"} className={FLOAT_BUTTON}>
                <LocateIcon spinning={loc === "locating"} />
              </motion.button>
            </>
          )}
        </div>
      )}

      {/* ── Bottom sheet ── */}
      <section className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="sheet overflow-hidden rounded-[28px] bg-[var(--surface-strong)] shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.3)] ring-1 ring-[var(--ring)] backdrop-blur-xl">
          <AutoHeight>
          {showInstall ? (
            <InstallSheet platform={installPlatform} onClose={() => setShowInstall(false)} />
          ) : adding ? (
            <AddStationForm
              onSave={saveStation}
              onCancel={() => setAdding(false)}
              onFindAddress={findAddress}
              onUseMyLocation={pinMyLocation}
            />
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
          ) : origin && (loc === "ok" || filtering) ? (
            <NearestList
              inView={inView}
              title={filter.favoritesOnly ? "Favorites" : filtering ? (user ? "Matches near you" : "Matches near map center") : "Nearest to you"}
              items={nearest}
              favorites={favSet}
              size={sheetSize}
              onResize={setSheetSize}
              onSelect={select}
            />
          ) : (
            <Intro loc={loc} inView={inView} onLocate={() => locate()} />
          )}
          </AutoHeight>
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────

function inViewLabel(n: number | null) {
  if (n == null) return null;
  return n === 0 ? "No stations in view" : `${n.toLocaleString()} station${n === 1 ? "" : "s"} in view`;
}

function Intro({ loc, inView, onLocate }: { loc: LocState; inView: number | null; onLocate: () => void }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-semibold leading-tight tracking-tight text-[var(--ink)]">Pure gas, close by.</h1>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">
            {inViewLabel(inView) ?? "Nearest ethanol-free (E0) stations."}
          </p>
        </div>
        <button
          onClick={onLocate}
          disabled={loc === "locating"}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-[15px] font-semibold text-[var(--on-accent)] shadow-[0_8px_20px_-10px_var(--accent)] transition active:scale-[0.97] disabled:opacity-80"
        >
          <LocateIcon size={18} spinning={loc === "locating"} />
          {loc === "locating" ? "Finding…" : "Share location"}
        </button>
      </div>
      {loc === "denied" && (
        <p className="mt-2.5 text-[13px] leading-snug text-[var(--warn)]">
          Location is blocked. Allow it for this site in your browser settings (iPhone: Settings → Privacy → Location Services → Safari Websites), then try again.
        </p>
      )}
      {loc === "error" && (
        <p className="mt-2.5 text-[13px] leading-snug text-[var(--warn)]">
          Couldn&apos;t get your location. Check that location services are on and try again.
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

/** The card's top (handle + title): tap to open or close the list, or drag it up/down. */
function SheetHandle({
  size, onResize, children,
}: { size: SheetSize; onResize: (s: SheetSize) => void; children: React.ReactNode }) {
  const startY = useRef<number | null>(null);
  return (
    <button
      className="block w-full touch-none pt-2.5 text-left"
      aria-label={size === "open" ? "Hide list" : "Show list"}
      onPointerDown={(e) => { startY.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerUp={(e) => {
        const dy = startY.current == null ? 0 : e.clientY - startY.current;
        startY.current = null;
        if (dy < -20) onResize("open");
        else if (dy > 20) onResize("none");
        else onResize(size === "open" ? "none" : "open");
      }}
    >
      <span className="mx-auto mb-1 block h-1.5 w-10 rounded-full bg-[var(--hairline)]" />
      {children}
    </button>
  );
}

/** Animates its height to fit whatever is inside — the bottom sheet grows and shrinks smoothly. */
function AutoHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">("auto");
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div animate={{ height: h }} initial={false} transition={SPRING} style={{ overflow: "hidden" }}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

function NearestList({
  title, inView, items, favorites, size, onResize, onSelect,
}: {
  title: string; inView: number | null; items: Ranked[]; favorites: Set<number>; size: SheetSize;
  onResize: (s: SheetSize) => void; onSelect: (id: number) => void;
}) {
  // The list shows three stations, then scrolls.
  const listRef = useRef<HTMLUListElement>(null);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);
  useEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const rows = [...ul.children].slice(0, 3) as HTMLElement[];
    setMaxH(rows.reduce((h, r) => h + r.offsetHeight, 0) + 8);
  }, [items, size]);
  return (
    <div>
      <SheetHandle size={size} onResize={onResize}>
        <div className={`flex items-baseline justify-between gap-3 px-5 pt-0.5 ${size === "none" ? "pb-4" : "pb-1"}`}>
          <h2 className="text-[17px] font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
          {inView != null && (
            <span className="shrink-0 text-[13px] tabular-nums text-[var(--muted)]">{inViewLabel(inView)}</span>
          )}
        </div>
      </SheetHandle>
      {size === "none" ? null : items.length === 0 ? (
        <p className="px-5 pb-5 text-[14px] text-[var(--muted)]">No stations match. Try a wider radius or a different search.</p>
      ) : (
        // No exit animation on rows: the card's height animation does the shrinking,
        // so the list never pops taller before it collapses.
        <ul ref={listRef} className="overflow-y-auto overscroll-contain px-2 pb-2" style={{ maxHeight: maxH }}>
          {items.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i, 3) * 0.03 }}
            >
              <StationRow s={s} index={i} favorite={favorites.has(s.id)} onSelect={onSelect} />
            </motion.li>
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
