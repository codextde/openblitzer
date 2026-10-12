# OpenBlitzer API v1

Base URL: `https://api.openblitzer.codext.de`. Every response is JSON, CORS is open (`*`), and responses are
gzip-compressed when the client sends `Accept-Encoding: gzip`. Errors look like `{ "error": "message" }` and use
these status codes: 400 (validation), 401/403 (admin), 404, 405, 413 (body over 8 KB), 429 (rate limit, with a
`Retry-After` header in seconds), 500.

Fixed camera data: © OpenStreetMap contributors, ODbL. Anyone who shows the data must show this attribution.

## Device id

On install the app creates a random 128-bit hex id, for example `3f9c0a6e1b2d4c5e8f7a6b5c4d3e2f10`.
The server only stores `sha256(device + OPENBLITZER_SALT)`. Accepted format: 16 to 128 characters of
`[A-Za-z0-9_-]`.

## Endpoints

### `GET /`

Returns links to these docs and to the GitHub repository.

### `GET /v1/health`

```sh
curl https://api.openblitzer.codext.de/v1/health
# {"ok":true,"version":"1.0.0","dataset":"a1b2c3d4e5f6","fixed":24873,"reports":12}
```

`version` is the server version, `dataset` is the fixed dataset version, `fixed` is the number of fixed cameras
and `reports` is the number of active reports.

### `GET /v1/fixed/meta`

```sh
curl https://api.openblitzer.codext.de/v1/fixed/meta
# {"version":"a1b2c3d4e5f6","generatedAt":"2026-10-12T22:10:00.000Z","count":24873,"attribution":"© OpenStreetMap contributors"}
```

This response is small, so apps can call it often and download `/v1/fixed` only when `version` changes.
It is cached for 5 minutes (`Cache-Control: public, max-age=300`).

### `GET /v1/fixed`

Returns the full offline dataset. It is precompressed and served with `Content-Encoding: gzip` when the client
accepts gzip. `ETag` is `"<version>"`. Send `If-None-Match` to get `304 Not Modified` when nothing changed.

```sh
curl --compressed -D - https://api.openblitzer.codext.de/v1/fixed -o fixed.json
curl -s -o /dev/null -w '%{http_code}\n' -H 'If-None-Match: "a1b2c3d4e5f6"' https://api.openblitzer.codext.de/v1/fixed
# 304
```

```ts
type FixedKind = "speed" | "redlight" | "speed_redlight" | "section_start" | "section_end";
type FixedDataset = {
  version: string;      // first 12 hex chars of sha256(cameras)
  generatedAt: string;  // ISO time when this version was first built
  attribution: string;
  cameras: [id: string, lat: number, lon: number, kind: FixedKind, maxspeed: number | null, direction: number | null][];
};
```

- `id`: `n<osm node>`, `r<osm relation>` (`r<id>:<n>` for the 2nd and later device of one relation), `r<id>:s` and
  `r<id>:e` for the start and end of an average speed section, `c<report id>` for confirmed community cameras.
- `lat` and `lon` have 5 decimals. `maxspeed` is in km/h (mph values are converted).
- `direction` is the monitored driving direction in degrees (0 to 359). `null` means both directions or unknown.
  For enforcement relations it is the bearing from `from` to `device`. For sections it is the bearing from `from`
  to `to`.

### `GET /v1/reports?lat=&lon=&radius=`

Returns the active community reports within `radius` km (default 50, max 150), sorted by distance.

```sh
curl 'https://api.openblitzer.codext.de/v1/reports?lat=52.52&lon=13.405&radius=30'
# {"now":"2026-10-12T22:15:00.000Z","reports":[{"id":"42","type":"mobile_camera","lat":52.5201,"lon":13.4049,
#   "heading":90,"maxspeed":50,"createdAt":"...","confirmedAt":"...","expiresAt":"...","up":2,"down":0}]}
```

```ts
type ReportType = "mobile_camera" | "fixed_camera" | "traffic_jam" | "accident" | "roadworks" | "hazard" | "closure" | "visibility";
type Report = {
  id: string; type: ReportType; lat: number; lon: number; heading: number | null; maxspeed: number | null;
  createdAt: string; confirmedAt: string; expiresAt: string; up: number; down: number;
};
```

### `POST /v1/reports`

Body: `{ type, lat, lon, heading?, speed?, maxspeed?, device }`. Validation rules: `lat` and `lon` must be finite
numbers, `type` must be a known type, `heading` must be between 0 and 359 (rounded to whole degrees), `maxspeed`
must be between 5 and 200 km/h, and `speed` must be at least 0 (it is accepted but not stored).

```sh
curl -X POST https://api.openblitzer.codext.de/v1/reports \
  -H 'Content-Type: application/json' \
  -d '{"type":"mobile_camera","lat":52.52,"lon":13.405,"heading":90,"maxspeed":50,"device":"3f9c0a6e1b2d4c5e8f7a6b5c4d3e2f10"}'
# 201 {"report":{...,"up":1,"down":0},"merged":false}
```

If the same type was already reported within 200 m, and the headings are within 60 degrees of each other (or
one of the reports has no heading), the new report is merged into the existing one as an up vote. The response
is then `"merged": true` and contains the existing report. If that up vote is what promotes a `fixed_camera`
report, the response also contains `"promoted": "c<id>"`.

### `POST /v1/reports/:id/votes`

Body: `{ vote: "up" | "down", device }`.

```sh
curl -X POST https://api.openblitzer.codext.de/v1/reports/42/votes \
  -H 'Content-Type: application/json' -d '{"vote":"down","device":"3f9c0a6e1b2d4c5e8f7a6b5c4d3e2f10"}'
# {"report":{...}}  or  {"report":null}  or  {"report":null,"promoted":"c42"}
```

- Each device has one vote per report, and a new vote replaces the old one. The reporter counts as one up vote.
- An up vote confirms the report and restarts its lifetime from that moment. A down vote does not change the
  lifetime.
- `report: null` means the report was removed by this vote (`down - up >= 2`).
- When a `fixed_camera` report reaches 3 up votes from different devices, it becomes the fixed camera `c<id>`
  (kind `speed`) and leaves the report list. The response is then `{ report: null, promoted: "c<id>" }`.
- Voting on an unknown or expired report returns 404.

### `GET /v1/stats`

```sh
curl https://api.openblitzer.codext.de/v1/stats
# {"fixed":24873,"reportsActive":12,"reports24h":85,"countries":42}
```

`countries` is the number of countries that have fixed cameras. `reports24h` counts new reports created in the
last 24 hours. Merged reports are not counted.

### `DELETE /v1/reports/:id` (admin)

Deletes a report, or a promoted community camera when the id is `c<id>`. Returns 401 when the token is wrong and
403 when `OPENBLITZER_ADMIN_TOKEN` is not set.

```sh
curl -X DELETE -H "Authorization: Bearer $OPENBLITZER_ADMIN_TOKEN" https://api.openblitzer.codext.de/v1/reports/42
# {"ok":true}
```

## Rules

| Type | Lifetime after the last confirmation |
|---|---|
| mobile_camera | 2.5 h |
| traffic_jam | 45 min |
| accident | 90 min |
| hazard | 60 min |
| visibility | 2 h |
| closure | 12 h |
| roadworks | 72 h |
| fixed_camera | 30 days |

Expired reports are hidden from every response right away. The server deletes them once a minute.

| Rate limit | Limit |
|---|---|
| Reports per device | 12 per hour |
| Votes per device | 120 per hour |
| Reports per IP (`CF-Connecting-IP`, otherwise the first `X-Forwarded-For` entry) | 40 per hour |
