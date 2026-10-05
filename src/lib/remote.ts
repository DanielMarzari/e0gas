import type { Station } from "@/lib/stations";

/** Same-origin API on the e0gas server (Caddy proxies /api to server/api.mjs). */
const API = "/api/stations";
const KEY_STORAGE = "e0gas:write-key";

type Row = Omit<Station, "custom" | "serverId"> & { id: number };

/** Server rows get small negative ids so they never collide with pure-gas.org ids. */
const toStation = (r: Row): Station => ({ ...r, id: -r.id, serverId: r.id, custom: true });

export function getWriteKey(): string {
  try { return localStorage.getItem(KEY_STORAGE) ?? ""; } catch { return ""; }
}
export function setWriteKey(k: string) {
  try { localStorage.setItem(KEY_STORAGE, k); } catch { /* private mode */ }
}

/** Stations saved on the server, or null if the API isn't reachable (e.g. not set up yet). */
export async function fetchRemote(): Promise<Station[] | null> {
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    return ((await res.json()) as Row[]).map(toStation);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function addRemote(s: Station, key: string): Promise<Station> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-e0gas-key": key },
    body: JSON.stringify({
      lat: s.lat, lng: s.lng, name: s.name, brand: s.brand,
      street: s.street, city: s.city, state: s.state, octanes: s.octanes,
    }),
  });
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "save failed");
  return toStation(await res.json());
}

export async function deleteRemote(serverId: number, key: string) {
  const res = await fetch(`${API}/${serverId}`, { method: "DELETE", headers: { "x-e0gas-key": key } });
  if (!res.ok) throw new ApiError(res.status, "delete failed");
}

export type HiddenEntry = { station_id: number; name: string };
const HIDDEN = "/api/hidden";

/** Stations flagged as no longer selling ethanol-free gas, or null if the API is unreachable. */
export async function fetchHidden(): Promise<HiddenEntry[] | null> {
  try {
    const res = await fetch(HIDDEN, { cache: "no-store" });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    return (await res.json()) as HiddenEntry[];
  } catch {
    return null;
  }
}

export async function hideRemote(e: HiddenEntry, key: string) {
  const res = await fetch(HIDDEN, {
    method: "POST",
    headers: { "content-type": "application/json", "x-e0gas-key": key },
    body: JSON.stringify(e),
  });
  if (!res.ok) throw new ApiError(res.status, "hide failed");
}

export async function unhideRemote(stationId: number, key: string) {
  const res = await fetch(`${HIDDEN}/${stationId}`, { method: "DELETE", headers: { "x-e0gas-key": key } });
  if (!res.ok) throw new ApiError(res.status, "restore failed");
}
