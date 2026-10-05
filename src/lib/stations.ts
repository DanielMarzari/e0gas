export type Station = {
  id: number;
  lat: number;
  lng: number;
  name: string;
  street: string;
  city: string;
  state: string;
  brand: string;
  octanes: number[];
  /** Added with the + button (negative id). */
  custom?: boolean;
  /** Row id on the e0gas server; absent while it's saved only on this device. */
  serverId?: number;
};

type Row = [number, number, string, string, string, string, string, number[], number];

export async function loadStations(): Promise<{ updated: string; stations: Station[] }> {
  const res = await fetch("/stations.json");
  const json: { updated: string; stations: Row[] } = await res.json();
  return {
    updated: json.updated,
    stations: dedupe(json.stations.map(([lat, lng, name, street, city, state, brand, octanes, id]) => ({
      id, lat, lng, name, street, city, state, brand, octanes,
    }))),
  };
}

const brandKey = (s: Station) =>
  (s.brand && s.brand !== "NONE" ? s.brand : s.name.split(" ")[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const streetNo = (s: Station) => s.street.match(/^\s*(\d+)/)?.[1];
const storeNo = (s: Station) => s.name.match(/#\s*(\d+)/)?.[1];

/** Of two listings for one station, keep the more informative one. */
function richness(s: Station) {
  return (storeNo(s) ? 4 : 0) + (/^\d+$/.test(s.city) ? -4 : 0) + s.octanes.length + s.name.length / 100;
}

/**
 * pure-gas.org often lists one station twice (e.g. "Sheetz #746, 951 Trexlertown Rd" and
 * "Sheetz, Rt 100 & Cetronia Rd"). Merge same-brand listings that sit within 150 m, or share
 * a street number within 1 km — unless their store numbers say they're different stores.
 */
export function dedupe(stations: Station[]): Station[] {
  const cell = (lat: number, lng: number) => `${Math.round(lat * 100)},${Math.round(lng * 100)}`;
  const grid = new Map<string, Station[]>();
  const dropped = new Set<number>();
  const merged = new Map<number, number[]>();
  const keys = new Map(stations.map((s) => [s.id, brandKey(s)]));
  for (const s of stations) {
    const k = keys.get(s.id)!;
    for (let dy = -1; dy <= 1 && k; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const t of grid.get(cell(s.lat + dy / 100, s.lng + dx / 100)) ?? []) {
          if (dropped.has(t.id) || keys.get(t.id) !== k) continue;
          const a = storeNo(s), b = storeNo(t);
          if (a && b && a !== b) continue;
          const meters = milesBetween(s.lat, s.lng, t.lat, t.lng) * 1609.34;
          const sameNo = streetNo(s) != null && streetNo(s) === streetNo(t);
          if (meters > 150 && !(sameNo && meters < 1000)) continue;
          const [keep, lose] = richness(s) > richness(t) ? [s, t] : [t, s];
          dropped.add(lose.id);
          merged.set(keep.id, [...(merged.get(keep.id) ?? keep.octanes), ...(merged.get(lose.id) ?? lose.octanes)]);
          if (lose === s) break;
        }
        if (dropped.has(s.id)) break;
      }
      if (dropped.has(s.id)) break;
    }
    if (dropped.has(s.id)) continue;
    const c = cell(s.lat, s.lng);
    const bucket = grid.get(c);
    if (bucket) bucket.push(s);
    else grid.set(c, [s]);
  }
  return stations
    .filter((s) => !dropped.has(s.id))
    .map((s) => {
      const o = merged.get(s.id);
      return o ? { ...s, octanes: [...new Set(o)].sort((a, b) => a - b) } : s;
    });
}

/** Great-circle distance in miles — a rough "as the crow flies" estimate. */
export function milesBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatMiles(mi: number): string {
  if (mi < 0.1) return "< 0.1 mi";
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi).toLocaleString()} mi`;
}

/** Search by name + address so Google Maps opens the actual business listing, not a bare pin. */
export function googleMapsUrl(s: Station): string {
  // A station you added without an address: drop a pin on its coordinates.
  if (s.custom && !s.street) return `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;
  const query = [s.name, s.street, s.city, s.state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * GasBuddy has no public API or stable per-station links, so open its price list for the
 * station's town. Its prices are regular/mid/premium — it doesn't track ethanol-free separately.
 */
export function gasBuddyUrl(s: Station): string {
  const where = /^\d{5}$/.test(s.city) ? s.city : [titleCase(s.city), s.state].filter(Boolean).join(", ");
  return `https://www.gasbuddy.com/home?search=${encodeURIComponent(where)}&fuel=1`;
}

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

/**
 * Link props that open the Google Maps app when it's installed, else the website.
 * - iOS: google.com/maps/search/* is a universal link claimed by the Google Maps app.
 *   It must be a same-tab tap (target=_blank can skip the app hand-off); without
 *   the app it simply loads the website.
 * - Android: an intent:// URL targets the Maps app, with the website as fallback.
 * - Desktop: website in a new tab.
 */
export function mapsLinkProps(s: Station, platform: Platform): { href: string; target?: string; rel?: string } {
  const web = googleMapsUrl(s);
  if (platform === "android") {
    const path = web.replace(/^https:\/\//, "");
    return {
      href: `intent://${path}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(web)};end`,
    };
  }
  if (platform === "ios") return { href: web };
  return { href: web, target: "_blank", rel: "noopener" };
}

export function titleCase(s: string): string {
  // Source data has some half-fixed names like "Rutter’S".
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s.replace(/([a-z])(['’])S\b/g, "$1$2s");
  // Only capitalize after whitespace/punctuation that starts a word — not after
  // apostrophes, so "RUTTER’S" becomes "Rutter’s", not "Rutter’S".
  return s.toLowerCase().replace(/(^|[\s\-/(&.#])([a-z])/g, (_, pre, c) => pre + c.toUpperCase());
}
