"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Station } from "@/lib/stations";
import { basemapUrl, START_BOUNDS, STATION_COLORS, applyRoamStyle } from "@/lib/mapStyle";

export type LatLng = { lat: number; lng: number };

/**
 * How stations are drawn when zoomed out:
 *  - dots:  every station as a small dot that grows with zoom
 *  - heat:  a density glow that resolves into dots as you zoom in
 *  - pumps: tiny dots far out, gas-pump pins once you're at city level
 */
export type MarkerLook = "dots" | "heat" | "pumps";
export const MARKER_LOOKS: MarkerLook[] = ["dots", "heat", "pumps"];

type Props = {
  stations: Station[];
  user: LatLng | null;
  /** Stations to frame alongside the user (nearest few). */
  focus: Station[];
  selectedId: number | null;
  onSelect: (s: Station | null) => void;
  dark: boolean;
  look: MarkerLook;
};

/** Layers a tap can select a station from. */
const HIT_LAYERS = ["station-points", "station-pins"];
const OUR_LAYERS = ["station-heat", "station-points", "station-pins", "station-selected", "station-labels"];

// Material "local_gas_station" glyph (Apache 2.0), 24×24 viewBox.
const PUMP_PATH =
  "M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z";

function pumpIcon(fill: string, ring: string): ImageData {
  const size = 64; // drawn at 2× for crisp retina rendering
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.translate(size / 2 - 17, size / 2 - 17);
  ctx.scale(34 / 24, 34 / 24);
  ctx.fillStyle = "#ffffff";
  ctx.fill(new Path2D(PUMP_PATH));
  return ctx.getImageData(0, 0, size, size);
}

function installStationLayers(map: maplibregl.Map, look: MarkerLook, dark: boolean) {
  const c = dark ? STATION_COLORS.dark : STATION_COLORS.light;
  for (const id of OUR_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  if (!map.getSource("stations")) {
    map.addSource("stations", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }

  if (look === "heat") {
    map.addLayer({
      id: "station-heat",
      type: "heatmap",
      source: "stations",
      maxzoom: 10,
      paint: {
        "heatmap-weight": 0.6,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 9, 1.4],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 6, 6, 12, 9, 18],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7.5, 0.85, 9.5, 0],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(15,138,95,0)",
          0.2, dark ? "rgba(52,196,139,0.35)" : "rgba(15,138,95,0.25)",
          0.5, dark ? "rgba(52,196,139,0.65)" : "rgba(15,138,95,0.55)",
          0.8, dark ? "#7be0b4" : "#0b6b49",
          1, dark ? "#d5f7e7" : "#064030",
        ],
      },
    });
  }

  // Dots: always for "dots"; fade in for "heat"; far-out only for "pumps".
  const dotRadius: maplibregl.ExpressionSpecification =
    ["interpolate", ["linear"], ["zoom"], 3, 1.8, 6, 3.2, 9, 5, 14, 8];
  map.addLayer({
    id: "station-points",
    type: "circle",
    source: "stations",
    ...(look === "pumps" ? { maxzoom: 9 } : {}),
    paint: {
      "circle-color": c.accent,
      "circle-radius": dotRadius,
      "circle-stroke-color": c.stroke,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0, 8, 1.5, 12, 2],
      "circle-opacity": look === "heat"
        ? ["interpolate", ["linear"], ["zoom"], 7.5, 0, 9, 1]
        : ["interpolate", ["linear"], ["zoom"], 3, 0.75, 8, 1],
      "circle-stroke-opacity": look === "heat" ? ["interpolate", ["linear"], ["zoom"], 7.5, 0, 9, 1] : 1,
    },
  });

  if (look === "pumps") {
    if (map.hasImage("pump")) map.removeImage("pump");
    map.addImage("pump", pumpIcon(c.accent, c.stroke), { pixelRatio: 2 });
    map.addLayer({
      id: "station-pins",
      type: "symbol",
      source: "stations",
      minzoom: 9,
      layout: {
        "icon-image": "pump",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.7, 14, 1],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
  }

  map.addLayer({
    id: "station-selected",
    type: "circle",
    source: "stations",
    filter: ["==", ["get", "id"], -1],
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 9, 14, 20],
      "circle-stroke-color": c.selected,
      "circle-stroke-width": 3,
    },
  });
  map.addLayer({
    id: "station-labels",
    type: "symbol",
    source: "stations",
    minzoom: 12,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.5 },
  });
}

export default function StationMap({ stations, user, focus, selectedId, onSelect, dark, look }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const byIdRef = useRef(new Map<number, Station>());
  const dataRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const onSelectRef = useRef(onSelect);
  const settingsRef = useRef({ dark, look, selectedId });
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  /** (Re)build our layers on top of whatever basemap is loaded. */
  const decorate = (map: maplibregl.Map) => {
    const { dark, look, selectedId } = settingsRef.current;
    applyRoamStyle(map, dark);
    installStationLayers(map, look, dark);
    (map.getSource("stations") as maplibregl.GeoJSONSource).setData(dataRef.current);
    map.setFilter("station-selected", ["==", ["get", "id"], selectedId ?? -1]);
  };

  // ── Init map once ──
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapUrl(settingsRef.current.dark),
      bounds: START_BOUNDS,
      fitBoundsOptions: { padding: { top: 90, left: 16, right: 16, bottom: 300 } },
      attributionControl: false, // credits live in the bottom sheet footer
      maxBounds: [[-180, 10], [-50, 75]],
    });
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();

    // style.load fires on first load and after every setStyle (dark-mode switch).
    map.on("style.load", () => {
      decorate(map);
      if (!readyRef.current) {
        readyRef.current = true;
        map.fire("e0:ready");
      }
    });

    map.on("click", (e) => {
      const layers = HIT_LAYERS.filter((id) => map.getLayer(id));
      // Generous hit box so small dots are easy to tap.
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
      const hit = map.queryRenderedFeatures(box, { layers })[0];
      const s = hit ? byIdRef.current.get(Number(hit.properties?.id)) : null;
      onSelectRef.current(s ?? null);
    });
    for (const layer of HIT_LAYERS) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map: maplibregl.Map }).__map = map;
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
     
  }, []);

  /** Run fn now if the style is loaded, otherwise once it is. */
  const whenReady = (fn: (map: maplibregl.Map) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (readyRef.current) fn(map);
    else map.once("e0:ready", () => fn(map));
  };

  // ── Theme: swap basemap (style.load re-decorates) ──
  useEffect(() => {
    const changed = settingsRef.current.dark !== dark;
    settingsRef.current.dark = dark;
    if (changed) whenReady((map) => map.setStyle(basemapUrl(dark), { diff: false }));
     
  }, [dark]);

  // ── Marker look: rebuild station layers only ──
  useEffect(() => {
    const changed = settingsRef.current.look !== look;
    settingsRef.current.look = look;
    if (changed) whenReady(decorate);
     
  }, [look]);

  // ── Station data ──
  useEffect(() => {
    byIdRef.current = new Map(stations.map((s) => [s.id, s]));
    dataRef.current = {
      type: "FeatureCollection",
      features: stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: { id: s.id, name: s.name },
      })),
    };
    whenReady((map) => (map.getSource("stations") as maplibregl.GeoJSONSource).setData(dataRef.current));
  }, [stations]);

  // ── Selected station highlight ──
  useEffect(() => {
    settingsRef.current.selectedId = selectedId;
    whenReady((map) => {
      map.setFilter("station-selected", ["==", ["get", "id"], selectedId ?? -1]);
      const s = selectedId != null ? byIdRef.current.get(selectedId) : null;
      if (s && !map.getBounds().contains([s.lng, s.lat])) {
        map.easeTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 12) });
      }
    });
  }, [selectedId]);

  // ── User location dot + frame nearest stations ──
  useEffect(() => {
    if (!user) return;
    whenReady((map) => {
      if (!userMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "user-dot";
        userMarkerRef.current = new maplibregl.Marker({ element: el });
      }
      userMarkerRef.current.setLngLat([user.lng, user.lat]).addTo(map);

      const bounds = new maplibregl.LngLatBounds([user.lng, user.lat], [user.lng, user.lat]);
      for (const s of focus.slice(0, 3)) bounds.extend([s.lng, s.lat]);
      map.fitBounds(bounds, {
        padding: { top: 110, left: 48, right: 48, bottom: Math.round(window.innerHeight * 0.48) },
        maxZoom: 14,
        duration: 1200,
      });
    });
    // Only reframe when the user's position changes, not on every list update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // maplibre's CSS forces position:relative on the container, so size it via a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
