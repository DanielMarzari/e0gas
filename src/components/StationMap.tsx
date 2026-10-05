"use client";

import { type RefObject, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapUrl, START_BOUNDS, STATION_COLORS, applyRoamStyle } from "@/lib/mapStyle";
import { type Station, titleCase } from "@/lib/stations";
import type { Shade } from "@/lib/theme";
import { circle } from "@/lib/filters";

export type LatLng = { lat: number; lng: number };

/** Imperative helpers the page needs (placing a new station, framing a search). */
export type MapApi = {
  /** Map coordinate under a screen point (CSS px from the top-left of the map). */
  latLngAt: (x: number, y: number) => LatLng;
  center: () => LatLng;
  /** Move so p sits at screen height y (default: the middle). */
  flyTo: (p: LatLng, zoom?: number, y?: number) => void;
};

type Props = {
  /** Stations to draw (already search-filtered). */
  stations: Station[];
  /** Always drawn on top with a star, unclustered. */
  favorites: Station[];
  user: LatLng | null;
  /** Stations to frame alongside the user (nearest few). */
  focus: Station[];
  selected: Station | null;
  onSelect: (id: number | null) => void;
  /** Search radius bubble. */
  radius: { center: LatLng; miles: number } | null;
  shade: Shade;
  /** Theme accent color for stations and cluster bubbles. */
  accent: string;
  apiRef: RefObject<MapApi | null>;
};

/** Layers a tap can select a station (or expand a cluster) from, in priority order. */
const HIT_LAYERS = ["favorite-stars", "clusters", "station-points"];
const OUR_LAYERS = [
  "radius-fill", "radius-line", "clusters", "cluster-count", "station-points",
  "station-selected", "station-labels", "favorite-stars",
];
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const toFeatures = (list: Station[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: list.map((s) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    properties: { id: s.id, name: titleCase(s.name) },
  })),
});

/** Gold disc with a white star, drawn at 2× for retina. */
function starIcon(ring: string): ImageData {
  const size = 56;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = "#f5b301";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 8.5 : 19;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(size / 2 + r * Math.cos(a), size / 2 + 1 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function installStationLayers(map: maplibregl.Map, shade: Shade, accent: string) {
  const c = STATION_COLORS[shade];
  for (const id of OUR_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  if (!map.getSource("stations")) {
    map.addSource("stations", {
      type: "geojson",
      data: EMPTY,
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 7,
    });
  }
  for (const id of ["favorites", "selected", "radius"]) {
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
  }
  // Own name so it can't collide with an icon in the basemap's sprite.
  if (map.hasImage("e0-star")) map.removeImage("e0-star");
  map.addImage("e0-star", starIcon(c.stroke), { pixelRatio: 2 });

  map.addLayer({
    id: "radius-fill",
    type: "fill",
    source: "radius",
    paint: { "fill-color": accent, "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "radius-line",
    type: "line",
    source: "radius",
    paint: { "line-color": accent, "line-width": 2, "line-opacity": 0.7, "line-dasharray": [2, 2] },
  });

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
    source: "selected",
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
  map.addLayer({
    id: "favorite-stars",
    type: "symbol",
    source: "favorites",
    layout: {
      "icon-image": "e0-star",
      // Same footprint as a station dot (incl. its ring): ~14px at zoom 8, ~20px at 14.
      "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.42, 8, 0.5, 14, 0.72],
      "icon-allow-overlap": true,
      // Placed first (top layer), so other station names make room for the star.
      "icon-ignore-placement": false,
      "text-field": ["step", ["zoom"], "", 8.5, ["get", "name"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 8.5, 10, 14, 12],
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.5 },
  });
}

export default function StationMap({
  stations, favorites, user, focus, selected, onSelect, radius, shade, accent, apiRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  /** True while a basemap swap is in flight; style.load will re-decorate. */
  const swappingRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  // Latest data for each source, so a basemap swap can restore it.
  const dataRef = useRef<Record<string, GeoJSON.FeatureCollection>>({
    stations: EMPTY, favorites: EMPTY, selected: EMPTY, radius: EMPTY,
  });
  const onSelectRef = useRef(onSelect);
  const settingsRef = useRef({ shade, accent });
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  const setData = (map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection) => {
    dataRef.current[id] = data;
    (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);
  };

  /** (Re)build our layers on top of whatever basemap is loaded. */
  const decorate = (map: maplibregl.Map) => {
    const { shade, accent } = settingsRef.current;
    applyRoamStyle(map, shade);
    installStationLayers(map, shade, accent);
    for (const [id, data] of Object.entries(dataRef.current)) setData(map, id, data);
  };

  // ── Init map once ──
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapUrl(settingsRef.current.shade),
      bounds: START_BOUNDS,
      fitBoundsOptions: { padding: { top: 90, left: 16, right: 16, bottom: 300 } },
      attributionControl: false, // credits live in Settings
      maxBounds: [[-180, 10], [-50, 75]],
    });
    map.touchZoomRotate.disableRotation();
    map.dragRotate.disable();

    // style.load fires on first load and after every setStyle (theme switch).
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
      const hits = map.queryRenderedFeatures(box, { layers });
      const hit = hits.find((h) => h.layer.id === "favorite-stars") ?? hits[0];
      if (hit?.layer.id === "clusters") {
        const src = map.getSource("stations") as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(hit.properties.cluster_id);
        map.easeTo({ center: (hit.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        return;
      }
      onSelectRef.current(hit ? Number(hit.properties?.id) : null);
    });
    for (const layer of HIT_LAYERS) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    mapRef.current = map;
    apiRef.current = {
      latLngAt: (x, y) => {
        const p = map.unproject([x, y]);
        return { lat: p.lat, lng: p.lng };
      },
      center: () => {
        const p = map.getCenter();
        return { lat: p.lat, lng: p.lng };
      },
      flyTo: (p, zoom, y) => map.easeTo({
        center: [p.lng, p.lat],
        zoom: zoom ?? Math.max(map.getZoom(), 13),
        offset: [0, y == null ? 0 : y - map.getContainer().clientHeight / 2],
      }),
    };
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map: maplibregl.Map }).__map = map;
    return () => {
      map.remove();
      mapRef.current = null;
      apiRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Run fn now if the style is loaded, otherwise once it is. */
  const whenReady = (fn: (map: maplibregl.Map) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (readyRef.current) fn(map);
    else map.once("e0:ready", () => fn(map));
  };

  // ── Theme: swap basemap when switching light ↔ dark, else just recolor ──
  useEffect(() => {
    const prev = settingsRef.current.shade;
    settingsRef.current.shade = shade;
    if (prev === shade) return;
    whenReady((map) => {
      if (basemapUrl(prev) !== basemapUrl(shade)) {
        swappingRef.current = true;
        map.setStyle(basemapUrl(shade), { diff: false });
      } else if (!swappingRef.current) {
        decorate(map);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shade]);

  // ── Accent color: rebuild station layers only ──
  useEffect(() => {
    const changed = settingsRef.current.accent !== accent;
    settingsRef.current.accent = accent;
    // Toggling light/dark changes the accent too; the basemap swap redraws with it.
    if (changed) whenReady((map) => { if (!swappingRef.current) decorate(map); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accent]);

  // ── Data ──
  useEffect(() => {
    const data = toFeatures(stations);
    dataRef.current.stations = data;
    whenReady((map) => setData(map, "stations", data));
     
  }, [stations]);

  useEffect(() => {
    const data = toFeatures(favorites);
    dataRef.current.favorites = data;
    whenReady((map) => setData(map, "favorites", data));
     
  }, [favorites]);

  // ── Selected station highlight ──
  useEffect(() => {
    const data = toFeatures(selected ? [selected] : []);
    dataRef.current.selected = data;
    whenReady((map) => {
      setData(map, "selected", data);
      if (selected && !map.getBounds().contains([selected.lng, selected.lat])) {
        map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 12) });
      }
    });
     
  }, [selected]);

  // ── Radius bubble: draw and frame it ──
  const radiusKey = radius ? `${radius.center.lat},${radius.center.lng},${radius.miles}` : "";
  useEffect(() => {
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: radius ? [circle(radius.center, radius.miles)] : [],
    };
    dataRef.current.radius = data;
    whenReady((map) => {
      setData(map, "radius", data);
      if (!radius) return;
      const ring = data.features[0].geometry as GeoJSON.Polygon;
      const bounds = new maplibregl.LngLatBounds();
      for (const p of ring.coordinates[0]) bounds.extend(p as [number, number]);
      map.fitBounds(bounds, {
        padding: { top: 90, left: 24, right: 24, bottom: Math.round(window.innerHeight * 0.42) },
        duration: 900,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKey]);

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
