"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapUrl, START_BOUNDS, STATION_COLORS, applyRoamStyle } from "@/lib/mapStyle";
import { type Station, titleCase } from "@/lib/stations";

export type LatLng = { lat: number; lng: number };

type Props = {
  stations: Station[];
  user: LatLng | null;
  /** Stations to frame alongside the user (nearest few). */
  focus: Station[];
  selectedId: number | null;
  onSelect: (s: Station | null) => void;
  dark: boolean;
  /** Theme accent color for stations and cluster bubbles. */
  accent: string;
};

/** Layers a tap can select a station (or expand a cluster) from. */
const HIT_LAYERS = ["clusters", "station-points"];
const OUR_LAYERS = ["clusters", "cluster-count", "station-points", "station-selected", "station-labels"];

function installStationLayers(map: maplibregl.Map, dark: boolean, accent: string) {
  const c = dark ? STATION_COLORS.dark : STATION_COLORS.light;
  for (const id of OUR_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  if (!map.getSource("stations")) {
    map.addSource("stations", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 7,
    });
  }

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "stations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": accent,
      "circle-opacity": 0.88,
      "circle-stroke-color": c.stroke,
      "circle-stroke-width": 2,
      "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 500, 28],
    },
  });
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "stations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
    },
    paint: { "text-color": c.count },
  });
  map.addLayer({
    id: "station-points",
    type: "circle",
    source: "stations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": accent,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 8],
      "circle-stroke-color": c.stroke,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "station-selected",
    type: "circle",
    source: "stations",
    filter: ["==", ["get", "id"], -1],
    paint: {
      "circle-color": c.selected,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 11],
      "circle-stroke-color": c.stroke,
      "circle-stroke-width": 3,
    },
  });
  map.addLayer({
    id: "station-labels",
    type: "symbol",
    source: "stations",
    filter: ["!", ["has", "point_count"]],
    // Regional zoom, so brands like Rutter's / Sheetz are readable without hunting.
    minzoom: 8.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8.5, 10, 14, 12],
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.5 },
  });
}

export default function StationMap({ stations, user, focus, selectedId, onSelect, dark, accent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  /** True while a basemap swap is in flight; style.load will re-decorate. */
  const swappingRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const byIdRef = useRef(new Map<number, Station>());
  const dataRef = useRef<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] });
  const onSelectRef = useRef(onSelect);
  const settingsRef = useRef({ dark, accent, selectedId });
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  /** (Re)build our layers on top of whatever basemap is loaded. */
  const decorate = (map: maplibregl.Map) => {
    const { dark, accent, selectedId } = settingsRef.current;
    applyRoamStyle(map, dark);
    installStationLayers(map, dark, accent);
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
      swappingRef.current = false;
      decorate(map);
      if (!readyRef.current) {
        readyRef.current = true;
        map.fire("e0:ready");
      }
    });

    map.on("click", async (e) => {
      const layers = HIT_LAYERS.filter((id) => map.getLayer(id));
      // Generous hit box so small dots are easy to tap.
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
      const hit = map.queryRenderedFeatures(box, { layers })[0];
      if (hit?.layer.id === "clusters") {
        const src = map.getSource("stations") as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(hit.properties.cluster_id);
        map.easeTo({ center: (hit.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        return;
      }
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
    if (changed) whenReady((map) => {
      swappingRef.current = true;
      map.setStyle(basemapUrl(dark), { diff: false });
    });
     
  }, [dark]);

  // ── Accent color: rebuild station layers only ──
  useEffect(() => {
    const changed = settingsRef.current.accent !== accent;
    settingsRef.current.accent = accent;
    // Toggling dark mode changes the accent too; the basemap swap redraws with it.
    if (changed) whenReady((map) => { if (!swappingRef.current) decorate(map); });
     
  }, [accent]);

  // ── Station data ──
  useEffect(() => {
    byIdRef.current = new Map(stations.map((s) => [s.id, s]));
    dataRef.current = {
      type: "FeatureCollection",
      features: stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: { id: s.id, name: titleCase(s.name) },
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
