import type maplibregl from "maplibre-gl";

// Same basemaps + palettes as ROAM: "Topo" (Positron, recolored) and "Dark".
export const basemapUrl = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;

/** Initial view: Pennsylvania. */
export const START_BOUNDS: [[number, number], [number, number]] = [[-80.52, 39.72], [-74.69, 42.27]];

export const STATION_COLORS = {
  light: { accent: "#0f8a5f", stroke: "#ffffff", selected: "#111827", label: "#1f2937", halo: "#ffffff" },
  dark: { accent: "#34c48b", stroke: "#191c24", selected: "#f9fafb", label: "#d0d4e0", halo: "#191c24" },
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

export function applyRoamStyle(map: maplibregl.Map, dark: boolean) {
  if (dark) return applyRoamDark(map);
  for (const id of HIGHWAY_LAYERS) paint(map, id, "line-color", id.includes("casing") ? "#a8a8a8" : "#b8b8b8");
  for (const id of MINOR_ROAD_LAYERS) paint(map, id, "line-color", id.includes("casing") ? "#dcdcdc" : "#e8e8e8");
  paint(map, "water", "fill-color", "#aad4e8");
  paint(map, "waterway", "line-color", "#8cc4dc");
  paint(map, "park", "fill-color", "#c2e2b8");
  paint(map, "park", "fill-opacity", 0.8);
  paint(map, "landcover_wood", "fill-color", "#a8d4a0");
  paint(map, "landuse_residential", "fill-color", "#f0eeec");
  for (const id of ["boundary_country_z0-4", "boundary_country_z5-", "boundary_state"]) {
    // keep borders, just quieter
    paint(map, id, "line-opacity", 0.5);
  }
}

/** ROAM's dark-mode contrast tweaks for the OpenFreeMap dark style. */
function applyRoamDark(map: maplibregl.Map) {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id;
    if (id === "background") paint(map, id, "background-color", "#191c24");
    if (layer.type === "fill") {
      if (id.includes("landcover")) paint(map, id, "fill-color", "#1e2e28");
      if (id.includes("landuse")) paint(map, id, "fill-color", "#1c2a24");
      if (id.includes("water")) paint(map, id, "fill-color", "#14253a");
      if (id.includes("building")) paint(map, id, "fill-color", "#252830");
    }
    if (layer.type === "line" && /^(road|bridge|tunnel)/.test(id)) {
      const casing = id.includes("casing");
      const highway = id.includes("motorway") || id.includes("trunk");
      paint(map, id, "line-color", highway ? (casing ? "#3a3e4a" : "#555e70") : (casing ? "#2e3040" : "#404558"));
    }
    if (layer.type === "symbol") {
      paint(map, id, "text-color", "#d0d4e0");
      paint(map, id, "text-halo-color", "#191c24");
      paint(map, id, "text-halo-width", 1.5);
    }
    if (id === "boundary_3") paint(map, id, "line-color", "#6b7280");
  }
}
