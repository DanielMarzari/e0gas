import type maplibregl from "maplibre-gl";

// Same basemap + palette as ROAM's "Topo" style (OpenFreeMap Positron, recolored).
export const BASEMAP_URL = "https://tiles.openfreemap.org/styles/positron";
export const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283];
export const DEFAULT_ZOOM = 3.4;

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

export function applyRoamStyle(map: maplibregl.Map) {
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
