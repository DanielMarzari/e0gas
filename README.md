# e0 gas

Find the nearest ethanol-free (E0) gas station in the US — **https://e0gas.danmarzari.com**

- Mobile-first map (MapLibre + OpenFreeMap, same basemap styling as ROAM), opening on the Lehigh Valley
- Side buttons: search (opens a search bar with filters: favorites only, minimum octane, distance or rough drive time), settings, + add, locate
- + adds a station that pure-gas.org is missing; "No ethanol-free here anymore" hides one (restore in Settings). Both are shared through a small API on the server (see `server/README.md`; no login needed); favorites stay per device
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
