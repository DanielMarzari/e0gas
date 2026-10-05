import type maplibregl from "maplibre-gl";
import type { Shade } from "@/lib/theme";

// Same basemaps + palettes as ROAM: "Topo" (Positron, recolored) and "Dark".
export const basemapUrl = (shade: Shade) =>
  `https://tiles.openfreemap.org/styles/${shade === "light" ? "positron" : "dark"}`;

/** Initial view before location is shared: Lehigh Valley, Kutztown to Easton. */
export const START_BOUNDS: [[number, number], [number, number]] = [[-75.80, 40.47], [-75.19, 40.73]];

/** Non-accent station colors; the accent comes from the chosen theme palette. */
export const STATION_COLORS = {
  light: { stroke: "#ffffff", selected: "#111827", label: "#1f2937", halo: "#ffffff", count: "#ffffff" },
  dark: { stroke: "#2b303b", selected: "#f9fafb", label: "#e3e6ee", halo: "#2b303b", count: "#08130e" },
} satisfies Record<Shade, unknown>;

/** Basemap recolors for dark mode: a soft slate with bright roads. */
const DARK_MAP = {
  dark: {
    bg: "#2b303b", landcover: "#33423b", landuse: "#313e38", water: "#22374f", building: "#3b404b",
    highway: "#7a8398", highwayCasing: "#4c5263", road: "#5a6175", roadCasing: "#40454f",
    text: "#e3e6ee", boundary: "#8a92a0",
  },

};

const HIGHWAY_LAYERS = [
  "road_motorway", "road_motorway_casing", "road_motorway_link", "road_motorway_link_casing",
  "road_trunk_primary", "road_trunk_primary_casing",
  "bridge_motorway", "bridge_motorway_casing", "bridge_motorway_link", "bridge_motorway_link_casing",
  "bridge_trunk_primary", "bridge_trunk_primary_casing",
  "tunnel_motorway", "tunnel_motorway_casing", "tunnel_motorway_link", "tunnel_motorway_link_casing",
  "tunnel_trunk_primary", "tunnel_trunk_primary_casing",
];
const MINOR_ROAD_LAYERS = [
  "road_secondary_tertiary", "road_secondary_tertiary_casing",
  "road_link", "road_link_casing",
  "road_minor", "road_minor_casing",
  "road_service_track", "road_service_track_casing",
];

function paint(map: maplibregl.Map, id: string, prop: string, value: unknown) {
  if (!map.getLayer(id)) return;
  try { map.setPaintProperty(id, prop, value); } catch { /* layer lacks prop */ }
}

/**
 * Keep country and state lines, drop counties and towns (OpenMapTiles admin_level 5+),
 * whichever basemap layer draws them.
 */
function hideMinorBoundaries(map: maplibregl.Map, opacity: number) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "line" || (layer as { "source-layer"?: string })["source-layer"] !== "boundary") continue;
    paint(map, layer.id, "line-opacity", ["case", [">", ["to-number", ["get", "admin_level"], 2], 4], 0, opacity]);
  }
}

export function applyRoamStyle(map: maplibregl.Map, shade: Shade) {
  hideMinorBoundaries(map, shade === "light" ? 0.5 : 0.7);
  if (shade !== "light") return applyRoamDark(map, DARK_MAP.dark);
  for (const id of HIGHWAY_LAYERS) paint(map, id, "line-color", id.includes("casing") ? "#a8a8a8" : "#b8b8b8");
  for (const id of MINOR_ROAD_LAYERS) paint(map, id, "line-color", id.includes("casing") ? "#dcdcdc" : "#e8e8e8");
  paint(map, "water", "fill-color", "#aad4e8");
  paint(map, "waterway", "line-color", "#8cc4dc");
  paint(map, "park", "fill-color", "#c2e2b8");
  paint(map, "park", "fill-opacity", 0.8);
  paint(map, "landcover_wood", "fill-color", "#a8d4a0");
  paint(map, "landuse_residential", "fill-color", "#f0eeec");
}

/** ROAM's dark-mode contrast tweaks for the OpenFreeMap dark style. */
function applyRoamDark(map: maplibregl.Map, c: (typeof DARK_MAP)["dark"]) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (id === "background") paint(map, id, "background-color", c.bg);
    if (layer.type === "fill") {
      if (id.includes("landcover")) paint(map, id, "fill-color", c.landcover);
      if (id.includes("landuse")) paint(map, id, "fill-color", c.landuse);
      if (id.includes("water")) paint(map, id, "fill-color", c.water);
      if (id.includes("building")) paint(map, id, "fill-color", c.building);
    }
    if (layer.type === "line" && /^(road|bridge|tunnel)/.test(id)) {
      const casing = id.includes("casing");
      const highway = id.includes("motorway") || id.includes("trunk");
      paint(map, id, "line-color", highway ? (casing ? c.highwayCasing : c.highway) : (casing ? c.roadCasing : c.road));
    }
    if (layer.type === "symbol") {
      paint(map, id, "text-color", c.text);
      paint(map, id, "text-halo-color", c.bg);
      paint(map, id, "text-halo-width", 1.5);
    }
    if (id === "boundary_3") paint(map, id, "line-color", c.boundary);
  }
}
