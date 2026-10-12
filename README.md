# OpenBlitzer

Free, ad-free and open-source speed camera and road hazard warner for iOS and Android. It does what the Blitzer.de app
does: warns you about fixed and mobile speed cameras, red light cameras, section control, traffic jam ends,
accidents, roadworks and other hazards, and lets drivers report and confirm them for each other. No account, no ads,
no tracking.

Made by [Codext GmbH](https://codext.de). Website: [openblitzer.codext.de](https://openblitzer.codext.de)

## Apps

- iOS: App Store (in review)
- Android: Google Play (in review), APKs on the [releases page](https://github.com/codextde/openblitzer/releases)

## Features

- Map with fixed speed cameras, red light cameras and section control from OpenStreetMap
- Live community reports: mobile speed cameras, traffic jam ends, accidents, roadworks, hazards, road closures, poor
  visibility and new fixed cameras, reported with one tap
- "Still there?" prompt after you pass a report; votes keep reports fresh and remove stale ones
- Direction-aware warnings: only what is ahead of you, in your direction of travel
- Visual alert, chime and spoken warning (German and English), vibration
- Speedometer, speed limit of the next camera and an overspeed alarm
- Keeps warning in the background, also while a navigation app is in front
- Offline: all fixed cameras are stored on the device
- HUD mode for the windshield
- Demo drive to try everything without driving
- Light and dark map, km/h and mph

Not yet: CarPlay and Android Auto, widgets. Pull requests welcome.

## Repository

| Folder | What |
|---|---|
| [`app/`](app) | Expo (React Native) app for iOS and Android, MapLibre map with OpenFreeMap tiles |
| [`server/`](server) | API for community reports and the fixed camera dataset (Bun + SQLite, Docker) |
| [`website/`](website) | openblitzer.codext.de (Cloudflare Worker) |
| [`deploy/coolify/`](deploy/coolify) | Docker Compose file for Coolify v4 |
| [`docs/`](docs) | [Spec](docs/SPEC.md) and [API reference](docs/API.md) |

## Run it yourself

Server (Docker):

```sh
OPENBLITZER_ADMIN_TOKEN=change-me docker compose up -d
curl http://localhost:8080/v1/health
```

The server imports all fixed cameras in Europe from OpenStreetMap on the first start (takes a while) and then once a
week. See [server/README.md](server/README.md).

App:

```sh
cd app
bun install
EXPO_PUBLIC_API_URL=http://<your-ip>:8080 bunx expo run:ios   # or run:android
```

## Legal note

In Germany (§ 23 Abs. 1c StVO) and several other countries the driver must not use a speed camera warner while
driving. OpenBlitzer is meant for passengers and for planning. Speed camera warnings are prohibited in Switzerland, so
the app is not offered there. Drive carefully and respect the speed limits.

## Data and licenses

- Code: [MIT](LICENSE)
- Fixed speed cameras: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the
  Open Database License (ODbL). Improve the data by mapping cameras in OpenStreetMap.
- Map tiles: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, © OpenStreetMap contributors
- Map rendering: [MapLibre](https://maplibre.org)
