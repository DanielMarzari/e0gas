// Pulls every ethanol-free station in the US from pure-gas.org (CC BY-NC 3.0)
// and writes a compact public/stations.json.
// Row format: [lat, lng, name, street, city, state, brand, octanes[], id]
import { writeFileSync } from "node:fs";

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const QUERY = `query StationsByState($code: ID!) {
  stationsByState(code: $code) {
    id name streetaddress city state { code } brand { name }
    location { latitude longitude } octanes removed
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const brandName = (b) => {
  const n = clean(b?.name);
  return !n || /^(unbranded|other|independent)$/i.test(n) ? "" : n;
};

// Some entries repeat the state inside the city ("Lancaster, Pa").
const cleanCity = (city, state) => clean(city).replace(new RegExp(`[,\\s]+${state}\\.?$`, "i"), "");

const rows = [];
for (const code of STATES) {
  const res = await fetch("https://www.pure-gas.org/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "e0gas.danmarzari.com weekly sync" },
    body: JSON.stringify({ query: QUERY, variables: { code } }),
  });
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(`${code}: ${errors[0].message}`);
  let n = 0;
  for (const s of data.stationsByState ?? []) {
    const lat = s.location?.latitude, lng = s.location?.longitude;
    if (s.removed || !lat || !lng) continue;
    rows.push([
      +lat.toFixed(5), +lng.toFixed(5),
      clean(s.name), clean(s.streetaddress), cleanCity(s.city, s.state?.code ?? code), s.state?.code ?? code,
      brandName(s.brand), (s.octanes ?? []).filter(Boolean).sort((a, b) => a - b), +s.id,
    ]);
    n++;
  }
  console.log(code, n);
  await sleep(750);
}

if (rows.length < 10000) throw new Error(`Only ${rows.length} stations — refusing to overwrite`);
writeFileSync("public/stations.json", JSON.stringify({ updated: new Date().toISOString().slice(0, 10), stations: rows }));
console.log("total", rows.length);
