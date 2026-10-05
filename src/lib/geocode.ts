import type { LatLng } from "@/components/StationMap";

export type Place = LatLng & { city: string; state: string };

/**
 * Free address lookup via OpenStreetMap's Nominatim (fine for light personal use:
 * max ~1 request/second; callers debounce).
 */
export async function geocode(address: string, near?: LatLng | null): Promise<Place | null> {
  const params = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", countrycodes: "us", addressdetails: "1" });
  if (near) {
    // Prefer matches around where you're looking, without excluding others.
    const d = 1.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  type Hit = { lat: string; lon: string; address?: Record<string, string> };
  const [hit] = (await res.json()) as Hit[];
  if (!hit) return null;
  const a = hit.address ?? {};
  return {
    lat: +hit.lat,
    lng: +hit.lon,
    city: a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? "",
    state: (a["ISO3166-2-lvl4"] ?? "").replace(/^US-/, ""),
  };
}
