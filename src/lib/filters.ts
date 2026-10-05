import { type Station, milesBetween } from "@/lib/stations";

export type Radius = { kind: "mi" | "min"; value: number };
export type Filter = {
  query: string;
  radius: Radius | null;
  /** Sells at least this octane. */
  minOctane: number | null;
  favoritesOnly: boolean;
};
export const NO_FILTER: Filter = { query: "", radius: null, minOctane: null, favoritesOnly: false };

export const MAX_MILES = 50;
export const MAX_MINUTES = 120;
/** Minimum-octane stops; the last one is race fuel ("100+"). */
export const OCTANE_STEPS = [87, 88, 89, 90, 91, 92, 93, 100];

/**
 * Rough drive-time → straight-line radius: ~40 mph on real roads, which wander
 * about 1.3× the crow-flies distance, so about half a mile per minute.
 */
const MILES_PER_MINUTE = 0.5;

export const radiusMiles = (r: Radius) => (r.kind === "mi" ? r.value : r.value * MILES_PER_MINUTE);
export const minutesLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);
export const radiusLabel = (r: Radius) => (r.kind === "mi" ? `${r.value} mi` : `~${minutesLabel(r.value)}`);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * "90" → sells 90 octane; "91+" → 91 or higher; anything else matches brand,
 * name or town ("rutters", "Sheetz", "kutztown").
 */
export function matchesQuery(s: Station, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const oct = q.match(/^(\d{2,3})\s*(\+)?$/);
  if (oct) {
    const n = Number(oct[1]);
    return s.octanes.some((o) => (oct[2] ? o >= n : o === n));
  }
  const nq = norm(q);
  return norm(s.brand).includes(nq) || norm(s.name).includes(nq) || norm(s.city).includes(nq);
}

export function applyFilter(
  stations: Station[], f: Filter, center: { lat: number; lng: number } | null, favorites: Set<number>,
): Station[] {
  if (!isActive(f)) return stations;
  const maxMi = f.radius && center ? radiusMiles(f.radius) : Infinity;
  return stations.filter(
    (s) =>
      (!f.favoritesOnly || favorites.has(s.id)) &&
      (f.minOctane == null || s.octanes.some((o) => o >= f.minOctane!)) &&
      matchesQuery(s, f.query) &&
      (maxMi === Infinity || milesBetween(center!.lat, center!.lng, s.lat, s.lng) <= maxMi),
  );
}

export const isActive = (f: Filter) => !!f.query.trim() || !!f.radius || f.minOctane != null || f.favoritesOnly;
/** Filters other than the typed search. */
export const filterCount = (f: Filter) => +!!f.radius + +(f.minOctane != null) + +f.favoritesOnly;

/** A circle polygon for drawing the radius on the map. */
export function circle(center: { lat: number; lng: number }, miles: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const dLat = miles / 69.0;
  const dLng = miles / (69.0 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    coords.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
