import { useState } from "react";
import type { Station } from "@/lib/stations";

/** Read a JSON value from localStorage; the fallback covers SSR, private mode and bad data. */
function read<T>(key: string, fallback: T, valid: (v: unknown) => boolean): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return valid(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

/** useState that persists to localStorage on this device. */
export function useStored<T>(key: string, fallback: T, valid: (v: unknown) => boolean) {
  const [value, setValue] = useState<T>(() => read(key, fallback, valid));
  const update = (next: T | ((prev: T) => T)) =>
    setValue((prev) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ }
      return v;
    });
  return [value, update] as const;
}

const isIdList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "number");
const isStationList = (v: unknown) =>
  Array.isArray(v) && v.every((s) => s && typeof s.lat === "number" && typeof s.lng === "number" && typeof s.id === "number");

export const useFavorites = () => useStored<number[]>("e0gas:favorites", [], isIdList);
export const useCustomStations = () => useStored<Station[]>("e0gas:custom-stations", [], isStationList);
