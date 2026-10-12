# OpenBlitzer spec (v1.0)

Free, ad-free, open-source speed camera and hazard warner for iOS and Android, feature-equivalent to the
Blitzer.de app. Published by Codext GmbH. MIT. Monorepo:

```
app/        Expo SDK 57 app (de.codext.openblitzer, scheme openblitzer)
server/     Bun + bun:sqlite API, Docker image, OSM importer
website/    Cloudflare Worker static site (openblitzer.codext.de): landing, privacy, imprint, support
deploy/coolify/docker-compose.yml   Coolify v4 deployment of server/ (api.openblitzer.codext.de)
docs/       SPEC.md (this file), API.md
```

## Features (parity with Blitzer.de)

1. Map of fixed speed cameras, red light cameras, section control (average speed), plus live community reports.
2. Live community reports: mobile speed camera, traffic jam end, accident, roadworks, hazard on the road, road
   closure, poor visibility, and new fixed camera. One-tap reporting while driving (big targets, max 2 taps).
3. Confirm or deny: after passing a community report the app asks "Still there?" (Yes / No, auto-dismiss 12 s).
   Votes extend or remove reports.
4. Direction-aware warnings: only cameras ahead in the driving direction and for that direction. Visual alert
   (full-width banner with type, distance countdown, speed limit) + chime + spoken voice (de/en), vibration.
5. Speedometer (GPS speed), speed limit of the next camera, overspeed alarm (configurable tolerance).
6. Background warnings (screen off / other app in front, e.g. navigation): iOS background location while in
   use, Android foreground service. Audio ducks other audio (music / navigation).
7. Offline: all fixed cameras are stored on the device and warn without network; reports need network and are
   cached for their lifetime.
8. HUD mode: mirrored, high-contrast speed + next warning for windshield reflection.
9. Demo drive: simulated drive past cameras (for trying the app and for App Review outside Germany).
10. Light + dark map, de + en, km/h + mph.
11. Legal note during onboarding: in Germany (§ 23 Abs. 1c StVO) and other countries the driver must not use
    a speed camera warner while driving; the app is meant for passengers / planning. Not offered in Switzerland.

Not in v1 (roadmap in README): CarPlay / Android Auto (needs Apple entitlement), widgets, routing.

## Data

- Fixed cameras: OpenStreetMap (ODbL, attribution "© OpenStreetMap contributors" in app, website, API).
  - `node[highway=speed_camera]` (tags `maxspeed`, `direction` in degrees or cardinal letters)
  - `relation[type=enforcement]` with `enforcement=maxspeed|traffic_signals|average_speed`, members `device`,
    `from`, `to`, tag `maxspeed`. Direction = bearing from the `from` node to the `device` node. `average_speed`
    gives a section (start = `from`, end = `to`).
  - Dedupe: a relation's device node equal to a speed_camera node is one camera (relation data wins).
- Community reports: stored on the server, anonymous.

## API v1 (base https://api.openblitzer.codext.de)

All JSON, CORS open, gzip. Device id = random 128-bit hex generated on install (never tied to a person);
server stores only `sha256(device + SERVER_SALT)`.

```
GET  /v1/health                 -> { ok: true, version, fixed: number, reports: number }
GET  /v1/fixed/meta             -> { version, generatedAt, count, attribution }
GET  /v1/fixed                  -> FixedDataset (ETag = version, If-None-Match -> 304)
GET  /v1/reports?lat&lon&radius -> { now, reports: Report[] }        radius km, default 50, max 150
POST /v1/reports                -> 201 { report: Report, merged: boolean }
     body { type, lat, lon, heading?, speed?, maxspeed?, device }
POST /v1/reports/:id/votes      -> { report: Report | null }            null = removed by the vote
     body { vote: "up" | "down", device }
GET  /v1/stats                  -> { fixed, reportsActive, reports24h, countries }
DELETE /v1/reports/:id          Authorization: Bearer OPENBLITZER_ADMIN_TOKEN
```

```ts
type FixedKind = "speed" | "redlight" | "speed_redlight" | "section_start" | "section_end";
type FixedDataset = {
  version: string; generatedAt: string; attribution: string;
  // compact rows: [id, lat, lon, kind, maxspeed | null, direction | null]
  // id = "n123" (node) | "r456" (relation) | "c789" (community); lat/lon 5 decimals; direction = bearing 0..359 of the
  // monitored driving direction, null = both / unknown; section rows share the relation id + suffix ":s" / ":e"
  cameras: [string, number, number, FixedKind, number | null, number | null][];
};
type ReportType = "mobile_camera" | "fixed_camera" | "traffic_jam" | "accident" | "roadworks" | "hazard" | "closure" | "visibility";
type Report = {
  id: string; type: ReportType; lat: number; lon: number; heading: number | null; maxspeed: number | null;
  createdAt: string; confirmedAt: string; expiresAt: string; up: number; down: number;
};
```

Rules:
- Lifetime after the last confirmation: mobile_camera 2.5 h, traffic_jam 45 min, accident 90 min, hazard 60 min,
  visibility 2 h, closure 12 h, roadworks 72 h, fixed_camera 30 days (becomes part of the fixed dataset as
  kind "speed" with id "c..." once it has 3 up votes from distinct devices).
- A new report of the same type within 200 m (and heading within 60 deg when both have one) merges into the
  existing one as an up vote.
- Removed when `down - up >= 2` (the reporter counts as 1 up). One vote per device per report (latest wins).
- Rate limits: per device 12 reports/h and 120 votes/h, per IP 40 reports/h. 429 with Retry-After.
- Validation: lat/lon finite, type known, heading 0..359, maxspeed 5..200.
- Import: on start when the dataset is missing or older than 7 days, then weekly. Overpass, sequential per
  country (Europe), User-Agent "OpenBlitzer/<version> (+https://github.com/codextde/openblitzer)". A failed import
  keeps the previous dataset.

## Warning engine (app, pure TypeScript, unit tested)

- Inputs: GPS fixes (lat, lon, speed m/s, heading, accuracy, time), fixed cameras, active reports, settings.
- Look-ahead distance by speed: < 60 km/h 300 m, < 90 km/h 500 m, < 130 km/h 800 m, else 1200 m; second
  "now" alert at 150 m (city) / 300 m (highway) for cameras.
- A POI is ahead when the bearing from the car to it is within +-35 deg of the travel heading (heading from
  GPS course or from the last fixes when speed >= 10 km/h). A camera with a direction only counts when the
  travel heading is within +-50 deg of that direction.
- States per POI: approaching -> warned -> near -> passed (distance grows for 3 fixes or > 60 m behind).
  Passed community reports trigger the confirm prompt (not for own reports).
- Overspeed: speed > camera maxspeed + tolerance (default 3 km/h) while warned -> repeating beep.
- Spatial grid index (0.05 deg cells) for fast lookups of 100k cameras.
