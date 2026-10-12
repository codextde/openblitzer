import { join } from "node:path";
import { createApp } from "./app";
import { loadConfig, VERSION } from "./config";
import { openDb } from "./db";
import { FixedStore } from "./fixed";
import { ImportScheduler } from "./osm/import";
import { Reports } from "./reports";

const config = loadConfig();
const db = openDb(join(config.dataDir, "openblitzer.db"));
const fixed = new FixedStore(db);
const reports = new Reports(db, fixed);
const app = createApp({ fixed, reports, salt: config.salt, adminToken: config.adminToken });

const server = Bun.serve({
  port: config.port,
  maxRequestBodySize: 64 * 1024,
  fetch: app.fetch,
});

const sweeper = setInterval(() => {
  reports.sweep();
  for (const l of Object.values(app.limits)) l.prune(Date.now());
}, 60_000);

const scheduler = new ImportScheduler(db, fixed, {
  overpassUrl: config.overpassUrl,
  countries: config.countries ?? undefined,
  log: console.log,
});
if (config.autoImport) scheduler.start();

console.log(
  `OpenBlitzer API ${VERSION} on :${server.port}, data ${config.dataDir}, ${fixed.current.count} fixed cameras (${fixed.current.version})`,
);

function shutdown() {
  clearInterval(sweeper);
  scheduler.stop();
  server.stop();
  db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
