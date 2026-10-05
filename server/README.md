# e0gas API

Stores the stations you add with **+** and the stations you flag as
"no ethanol-free here anymore", so every phone sees the same list.
One file, no dependencies: Node's HTTP server + built-in SQLite (Node 22.13+).

No login: anyone using the app can add, archive, hide and restore. Nothing is
ever erased (deleting a station you added only archives it; hiding is a flag),
and writes are capped at 60 per hour per IP.

## One-time setup on the server

```bash
# 1. Put the API somewhere outside the web root (the deploy rsync --deletes /var/www/apps/e0gas)
sudo mkdir -p /opt/e0gas-api /var/lib/e0gas
sudo chown "$USER" /opt/e0gas-api /var/lib/e0gas
curl -fsSL https://raw.githubusercontent.com/DanielMarzari/e0gas/main/server/api.mjs -o /opt/e0gas-api/api.mjs

# 2. Run it with PM2 (listens on 127.0.0.1:8787 only)
pm2 start /opt/e0gas-api/api.mjs --name e0gas-api --node-args="--no-warnings"
pm2 save
curl -s http://127.0.0.1:8787/api/health   # → {"ok":true}
```

## Caddy

In the `e0gas.danmarzari.com` site block, route `/api/*` to the API before the static files:

```caddy
e0gas.danmarzari.com {
	handle /api/* {
		reverse_proxy 127.0.0.1:8787
	}
	handle {
		root * /var/www/apps/e0gas
		file_server
	}
}
```

Then `sudo systemctl reload caddy`. Until this is in place the app keeps
adds and flags on the phone, and uploads them once the API answers.

## Updating the API

```bash
curl -fsSL https://raw.githubusercontent.com/DanielMarzari/e0gas/main/server/api.mjs -o /opt/e0gas-api/api.mjs
pm2 restart e0gas-api
```

Archived stations stay in the `stations` table with `deleted_at` set; to bring one back,
`UPDATE stations SET deleted_at = NULL WHERE id = …`.

Data lives in `/var/lib/e0gas/stations.db` (override with `E0GAS_DB`). Keep it out of `/var/www/apps/e0gas` (the deploy wipes that folder and Caddy would serve the file). Back it up with
`sqlite3 /var/lib/e0gas/stations.db ".backup /path/to/backup.db"` or just copy the file.
