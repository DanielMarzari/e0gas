import type { LatLng } from "@/components/StationMap";

/**
 * Free address lookup via OpenStreetMap's Nominatim (fine for light personal use:
 * max ~1 request/second, which a "Find" button never comes close to).
 */
export async function geocode(address: string, near?: LatLng | null): Promise<LatLng | null> {
  const params = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", countrycodes: "us" });
  if (near) {
    // Prefer matches around where you're looking, without excluding others.
    const d = 1.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: +hit.lat, lng: +hit.lon } : null;
}
