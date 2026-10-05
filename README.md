# e0 gas

Find the nearest ethanol-free (E0) gas station in the US — **https://e0gas.danmarzari.com**

- Mobile-first map (MapLibre + OpenFreeMap, same basemap styling as ROAM), opening on the Lehigh Valley
- Top bar: ★ favorites · search (brand, town, octane, radius or rough drive time) · ⚙ settings (color, Auto/Light/Dim/Dark, Add to Home Screen, credits)
- + adds a station that pure-gas.org is missing; favorites and added stations are saved per device
- Station card links to Google Maps for directions and GasBuddy for nearby prices
- Duplicate pure-gas.org listings (same brand, same spot) are merged on load
- "Share my location" sorts every station by straight-line distance
- Tapping a station opens the business in Google Maps (searched by name + address)

## Data

Station data comes from [pure-gas.org](https://www.pure-gas.org) (CC BY-NC 3.0) via its public GraphQL API.
`npm run sync` regenerates `public/stations.json`; the deploy workflow also re-syncs every Monday.

## Develop

```bash
npm install
npm run dev
```

## Deploy

Push to `main`. GitHub Actions builds a static export (`out/`) and rsyncs it to
`/var/www/apps/e0gas/` on the server, where Caddy serves it as static files.
