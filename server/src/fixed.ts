import type { Database } from "bun:sqlite";
import { ATTRIBUTION } from "./config";
import { getMeta, setMeta } from "./db";

export type FixedKind = "speed" | "redlight" | "speed_redlight" | "section_start" | "section_end";
export type FixedRow = [string, number, number, FixedKind, number | null, number | null];
export type FixedCamera = {
  id: string;
  lat: number;
  lon: number;
  kind: FixedKind;
  maxspeed: number | null;
  direction: number | null;
  country: string | null;
};

type Snapshot = {
  version: string;
  generatedAt: string;
  count: number;
  json: string;
  gzip: Uint8Array;
};

export class FixedStore {
  private snapshot!: Snapshot;

  constructor(
    private db: Database,
    private now: () => number = Date.now,
  ) {
    this.rebuild();
  }

  get current(): Snapshot {
    return this.snapshot;
  }

  meta() {
    const { version, generatedAt, count } = this.snapshot;
    return { version, generatedAt, count, attribution: ATTRIBUTION };
  }

  rebuild(): void {
    const cameras = this.db
      .query<{ id: string; lat: number; lon: number; kind: FixedKind; maxspeed: number | null; direction: number | null }, []>(
        "SELECT id, lat, lon, kind, maxspeed, direction FROM fixed_cameras ORDER BY id",
      )
      .all()
      .map((r): FixedRow => [r.id, r.lat, r.lon, r.kind, r.maxspeed, r.direction]);
    const content = JSON.stringify(cameras);
    const version = new Bun.CryptoHasher("sha256").update(content).digest("hex").slice(0, 12);
    let generatedAt = getMeta(this.db, "fixed_generated_at");
    if (getMeta(this.db, "fixed_version") !== version || !generatedAt) {
      generatedAt = new Date(this.now()).toISOString();
      setMeta(this.db, "fixed_version", version);
      setMeta(this.db, "fixed_generated_at", generatedAt);
    }
    const json = `{"version":${JSON.stringify(version)},"generatedAt":${JSON.stringify(generatedAt)},"attribution":${JSON.stringify(ATTRIBUTION)},"cameras":${content}}`;
    this.snapshot = { version, generatedAt, count: cameras.length, json, gzip: Bun.gzipSync(json) };
  }

  replaceOsm(cameras: FixedCamera[]): void {
    const insert = this.db.query(
      "INSERT OR REPLACE INTO fixed_cameras (id, lat, lon, kind, maxspeed, direction, country, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'osm')",
    );
    this.db.transaction(() => {
      this.db.exec("DELETE FROM fixed_cameras WHERE source = 'osm'");
      for (const c of cameras) insert.run(c.id, c.lat, c.lon, c.kind, c.maxspeed, c.direction, c.country);
    })();
    this.rebuild();
  }

  osmRows(): FixedCamera[] {
    return this.db
      .query<FixedCamera, []>("SELECT id, lat, lon, kind, maxspeed, direction, country FROM fixed_cameras WHERE source = 'osm'")
      .all();
  }

  addCommunity(camera: Omit<FixedCamera, "kind" | "country">): void {
    this.db
      .query(
        "INSERT OR REPLACE INTO fixed_cameras (id, lat, lon, kind, maxspeed, direction, country, source) VALUES (?, ?, ?, 'speed', ?, ?, NULL, 'community')",
      )
      .run(camera.id, camera.lat, camera.lon, camera.maxspeed, camera.direction);
    this.rebuild();
  }

  deleteCommunity(id: string): boolean {
    const changed = this.db.query("DELETE FROM fixed_cameras WHERE id = ? AND source = 'community'").run(id).changes > 0;
    if (changed) this.rebuild();
    return changed;
  }

  countries(): number {
    return this.db
      .query<{ n: number }, []>("SELECT COUNT(DISTINCT country) AS n FROM fixed_cameras WHERE country IS NOT NULL")
      .get()!.n;
  }
}
