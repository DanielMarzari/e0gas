// e0 gas station API: stations people add with the + button, stored in SQLite.
//
//   GET    /api/stations        list (public)
//   POST   /api/stations        add one (needs the write key)
//   DELETE /api/stations/:id    remove one (needs the write key)
//   GET    /api/hidden          stations flagged "no ethanol-free anymore" (public)
//   POST   /api/hidden          flag one {station_id, name} (needs the write key)
//   DELETE /api/hidden/:id      restore one (needs the write key)
//
// Flags never delete anything: pure-gas.org stations keep coming back from the
// weekly sync, and the app simply hides any station whose id is flagged here.
//
// Zero dependencies: Node's built-in HTTP server and node:sqlite (Node 22.13+).
// Caddy proxies /api/* here; see server/README.md for setup.
//
// Env:
//   E0GAS_WRITE_KEY  required; sent by the app as the x-e0gas-key header to add/remove
//   E0GAS_DB         SQLite file (default /var/lib/e0gas/stations.db)
//   PORT             default 8787 (listens on 127.0.0.1 only)
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { timingSafeEqual } from "node:crypto";

const KEY = process.env.E0GAS_WRITE_KEY ?? "";
const DB_PATH = process.env.E0GAS_DB ?? "/var/lib/e0gas/stations.db";
const PORT = Number(process.env.PORT ?? 8787);
const MAX_STATIONS = 5000;
if (KEY.length < 8) {
  console.error("Set E0GAS_WRITE_KEY (8+ characters) before starting.");
  process.exit(1);
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lat REAL NOT NULL, lng REAL NOT NULL,
  name TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '',
  octanes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS hidden (
  station_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
const listHidden = db.prepare("SELECT * FROM hidden ORDER BY created_at DESC");
const hideStmt = db.prepare("INSERT OR REPLACE INTO hidden (station_id, name) VALUES (?, ?) RETURNING *");
const unhideStmt = db.prepare("DELETE FROM hidden WHERE station_id = ?");
const listStmt = db.prepare("SELECT * FROM stations ORDER BY id");
const countStmt = db.prepare("SELECT COUNT(*) AS n FROM stations");
const insertStmt = db.prepare(
  "INSERT INTO stations (lat, lng, name, brand, street, city, state, octanes) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
);
const deleteStmt = db.prepare("DELETE FROM stations WHERE id = ?");

const row = (r) => ({ ...r, octanes: JSON.parse(r.octanes) });
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function authorized(req) {
  const got = Buffer.from(String(req.headers["x-e0gas-key"] ?? ""));
  const want = Buffer.from(KEY);
  return got.length === want.length && timingSafeEqual(got, want);
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 10_000) throw new Error("too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** Validate a new station; returns [values] or an error message. */
function parseStation(b) {
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 15 || lat > 72 || lng < -170 || lng > -60) {
    return "lat/lng must be a US location";
  }
  const name = text(b.name, 80);
  if (!name) return "name is required";
  const octanes = Array.isArray(b.octanes)
    ? [...new Set(b.octanes.map(Number).filter((o) => Number.isInteger(o) && o >= 80 && o <= 120))].sort((a, z) => a - z).slice(0, 10)
    : [];
  return [
    +lat.toFixed(5), +lng.toFixed(5), name, text(b.brand, 60),
    text(b.street, 120), text(b.city, 60), text(b.state, 2).toUpperCase(), JSON.stringify(octanes),
  ];
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/stations" && req.method === "GET") {
      return send(res, 200, listStmt.all().map(row));
    }
    if (url.pathname === "/api/stations" && req.method === "POST") {
      if (!authorized(req)) return send(res, 401, { error: "wrong or missing key" });
      if (countStmt.get().n >= MAX_STATIONS) return send(res, 507, { error: "station limit reached" });
      const v = parseStation(await readJson(req));
      if (typeof v === "string") return send(res, 400, { error: v });
      return send(res, 201, row(insertStmt.get(...v)));
    }
    const del = url.pathname.match(/^\/api\/stations\/(\d+)$/);
    if (del && req.method === "DELETE") {
      if (!authorized(req)) return send(res, 401, { error: "wrong or missing key" });
      deleteStmt.run(Number(del[1]));
      return send(res, 204);
    }
    if (url.pathname === "/api/hidden" && req.method === "GET") {
      return send(res, 200, listHidden.all());
    }
    if (url.pathname === "/api/hidden" && req.method === "POST") {
      if (!authorized(req)) return send(res, 401, { error: "wrong or missing key" });
      const b = await readJson(req);
      const id = Number(b.station_id);
      if (!Number.isSafeInteger(id)) return send(res, 400, { error: "station_id must be an integer" });
      return send(res, 201, hideStmt.get(id, text(b.name, 120)));
    }
    const unhide = url.pathname.match(/^\/api\/hidden\/(-?\d+)$/);
    if (unhide && req.method === "DELETE") {
      if (!authorized(req)) return send(res, 401, { error: "wrong or missing key" });
      unhideStmt.run(Number(unhide[1]));
      return send(res, 204);
    }
    if (url.pathname === "/api/health") return send(res, 200, { ok: true });
    return send(res, 404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return send(res, 400, { error: "bad request" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`e0gas api on 127.0.0.1:${PORT}, db ${DB_PATH}`));
