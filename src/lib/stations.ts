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
};

type Row = [number, number, string, string, string, string, string, number[], number];

export async function loadStations(): Promise<{ updated: string; stations: Station[] }> {
  const res = await fetch("/stations.json");
  const json: { updated: string; stations: Row[] } = await res.json();
  return {
    updated: json.updated,
    stations: json.stations.map(([lat, lng, name, street, city, state, brand, octanes, id]) => ({
      id, lat, lng, name, street, city, state, brand, octanes,
    })),
  };
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
  const query = [s.name, s.street, s.city, s.state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function titleCase(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
