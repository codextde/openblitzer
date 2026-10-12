# OpenBlitzer server

The API behind OpenBlitzer, built with Bun, TypeScript and `bun:sqlite` (WAL). It serves the offline dataset of
fixed cameras imported from OpenStreetMap, and stores anonymous community reports with voting, expiry and rate
limits. See [docs/API.md](../docs/API.md) for the API reference and [docs/SPEC.md](../docs/SPEC.md) for the rules.

## Run

```sh
cd server
bun install
bun run dev          # watch mode on :8080, data in ./data
bun run start
bun test
bun run typecheck
bun run import DE AT # one-off import of the listed countries (other countries stay); no arguments = all of Europe
```

On startup the server checks the fixed dataset. If the dataset is empty, or the last import is older than 7 days,
it imports it again in the background, and the API keeps answering during the import. After that it checks every
hour whether the weekly import is due. The import runs one country after another through Overpass, with a 3 s pause
between countries and retries with backoff. Countries covered: EU, EEA, UK, CH, the Balkans, TR, AD, MC and SM.

A failed import never destroys data:

- If one country fails, its previous rows are kept and that run is retried after 1 day.
- If every country fails, the old dataset stays as it is and the import is retried after 6 h.

Community cameras (`c<id>`) are kept across imports.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database (`openblitzer.db`) and the generated salt |
| `OPENBLITZER_SALT` | generated | Salt for device hashes. If it is empty, a random salt is created once and saved in `DATA_DIR/salt` (mode 0600). Keep it stable: changing it resets vote identity |
| `OPENBLITZER_ADMIN_TOKEN` | unset | Bearer token for `DELETE /v1/reports/:id`. If it is unset, the endpoint is disabled |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | Overpass endpoint |
| `OPENBLITZER_COUNTRIES` | all of Europe | Comma-separated ISO codes to import, e.g. `DE,AT,LU` |
| `OPENBLITZER_IMPORT` | `1` | Set to `0` to disable automatic imports |

## Self-host

From the repository root:

```sh
OPENBLITZER_ADMIN_TOKEN=$(openssl rand -hex 32) docker compose up -d --build
curl localhost:8080/v1/health
```

The image (`server/Dockerfile`) runs as a non-root user and stores its data in the volume `/data`. It has a
health check on `/v1/health`.

For Coolify v4, create a "Docker Compose" resource from this repository:

- Base directory: `/deploy/coolify`
- Compose file: `docker-compose.yml`
- Required variable: `OPENBLITZER_ADMIN_TOKEN`

Coolify sets the domain through `SERVICE_FQDN_API_8080`. Put the API behind a proxy that sets `X-Forwarded-For` or
`CF-Connecting-IP`, because the IP rate limit uses the first entry of those headers.

## Layout

```
src/index.ts       Bun.serve, minute sweeper, import scheduler
src/app.ts         routing, validation, CORS, gzip, ETag
src/reports.ts     report rules: merge, votes, expiry, removal, promotion
src/fixed.ts       fixed dataset build + precompressed cache
src/osm/import.ts  Overpass import, scheduler, CLI
src/osm/parse.ts   OSM -> camera rows (kinds, maxspeed, direction, dedupe)
src/ratelimit.ts   sliding window limiter
src/db.ts          schema, pragmas
test/              bun test suites, real Overpass fixture (Luxembourg)
```

Data: © OpenStreetMap contributors, ODbL.
