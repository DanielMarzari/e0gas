"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Station } from "@/lib/stations";
import { BASEMAP_URL, DEFAULT_CENTER, DEFAULT_ZOOM, applyRoamStyle } from "@/lib/mapStyle";

export type LatLng = { lat: number; lng: number };

type Props = {
  stations: Station[];
  user: LatLng | null;
  /** Stations to frame alongside the user (nearest few). */
  focus: Station[];
  selectedId: number | null;
  onSelect: (s: Station | null) => void;
};

const ACCENT = "#0f8a5f";

export default function StationMap({ stations, user, focus, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const byIdRef = useRef(new Map<number, Station>());
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // ── Init map once ──
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false, // credits live in the bottom sheet footer
      maxBounds: [[-180, 10], [-50, 75]],
    });
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();

    map.on("load", () => {
      applyRoamStyle(map);

      map.addSource("stations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 10,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ACCENT,
          "circle-opacity": 0.88,
          "circle-stroke-color": "#ffffff",
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
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "station-points",
        type: "circle",
        source: "stations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ACCENT,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 8],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "station-selected",
        type: "circle",
        source: "stations",
        filter: ["==", ["get", "id"], -1],
        paint: {
          "circle-color": "#111827",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 8, 14, 11],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        filter: ["!", ["has", "point_count"]],
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.3],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      });

      map.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = map.getSource("stations") as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      map.on("click", "station-points", (e) => {
        const id = e.features?.[0]?.properties?.id;
        const s = byIdRef.current.get(Number(id));
        if (s) onSelectRef.current(s);
      });
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["clusters", "station-points"] });
        if (!hits.length) onSelectRef.current(null);
      });
      for (const layer of ["clusters", "station-points"]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }

      readyRef.current = true;
      map.fire("e0:ready");
    });

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

  // ── Station data ──
  useEffect(() => {
    byIdRef.current = new Map(stations.map((s) => [s.id, s]));
    whenReady((map) => {
      (map.getSource("stations") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: stations.map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: { id: s.id, name: s.name },
        })),
      });
    });
  }, [stations]);

  // ── Selected station highlight ──
  useEffect(() => {
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
