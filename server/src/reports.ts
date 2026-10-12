import type { Database } from "bun:sqlite";
import type { FixedStore } from "./fixed";
import { angleDiff, boundingBox, haversine } from "./geo";

export const REPORT_TYPES = [
  "mobile_camera",
  "fixed_camera",
  "traffic_jam",
  "accident",
  "roadworks",
  "hazard",
  "closure",
  "visibility",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const MIN = 60_000;
const HOUR = 60 * MIN;
export const LIFETIME: Record<ReportType, number> = {
  mobile_camera: 2.5 * HOUR,
  traffic_jam: 45 * MIN,
  accident: 90 * MIN,
  hazard: 60 * MIN,
  visibility: 2 * HOUR,
  closure: 12 * HOUR,
  roadworks: 72 * HOUR,
  fixed_camera: 30 * 24 * HOUR,
};
export const MERGE_RADIUS_M = 200;
export const MERGE_HEADING_DEG = 60;
export const PROMOTE_UP_VOTES = 3;

export type Report = {
  id: string;
  type: ReportType;
  lat: number;
  lon: number;
  heading: number | null;
  maxspeed: number | null;
  createdAt: string;
  confirmedAt: string;
  expiresAt: string;
  up: number;
  down: number;
};

type Row = {
  id: number;
  type: ReportType;
  lat: number;
  lon: number;
  heading: number | null;
  maxspeed: number | null;
  created_at: number;
  confirmed_at: number;
  expires_at: number;
  up: number;
  down: number;
};

export type NewReport = { type: ReportType; lat: number; lon: number; heading: number | null; maxspeed: number | null };
export type VoteResult = { report: Report; removed: boolean; promoted?: string };

const iso = (ms: number) => new Date(ms).toISOString();
const toReport = (r: Row): Report => ({
  id: String(r.id),
  type: r.type,
  lat: r.lat,
  lon: r.lon,
  heading: r.heading,
  maxspeed: r.maxspeed,
  createdAt: iso(r.created_at),
  confirmedAt: iso(r.confirmed_at),
  expiresAt: iso(r.expires_at),
  up: r.up,
  down: r.down,
});

export function hashDevice(device: string, salt: string): string {
  return new Bun.CryptoHasher("sha256").update(device + salt).digest("hex");
}

export class Reports {
  constructor(
    private db: Database,
    private fixed: FixedStore,
    private now: () => number = Date.now,
  ) {}

  private get(id: number, now: number): Row | null {
    return this.db.query<Row, [number, number]>("SELECT * FROM reports WHERE id = ? AND expires_at > ?").get(id, now);
  }

  private inBox(lat: number, lon: number, meters: number, now: number, type?: ReportType): (Row & { distance: number })[] {
    const b = boundingBox(lat, lon, meters);
    const rows = this.db
      .query<Row, [number, number, number, number, number, string | null, string | null]>(
        `SELECT * FROM reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND expires_at > ?
         AND (? IS NULL OR type = ?)`,
      )
      .all(b.minLat, b.maxLat, b.minLon, b.maxLon, now, type ?? null, type ?? null);
    return rows
      .map((r) => ({ ...r, distance: haversine(lat, lon, r.lat, r.lon) }))
      .filter((r) => r.distance <= meters)
      .sort((a, b) => a.distance - b.distance);
  }

  list(lat: number, lon: number, radiusKm: number): { now: string; reports: Report[] } {
    const now = this.now();
    return { now: iso(now), reports: this.inBox(lat, lon, radiusKm * 1000, now).map(toReport) };
  }

  create(input: NewReport, device: string): { report: Report; merged: boolean; promoted?: string } {
    const now = this.now();
    const match = this.inBox(input.lat, input.lon, MERGE_RADIUS_M, now, input.type).find(
      (r) => r.heading === null || input.heading === null || angleDiff(r.heading, input.heading) <= MERGE_HEADING_DEG,
    );
    if (match) {
      this.db
        .query("UPDATE reports SET heading = coalesce(heading, ?), maxspeed = coalesce(maxspeed, ?) WHERE id = ?")
        .run(input.heading, input.maxspeed, match.id);
      const { report, promoted } = this.vote(match.id, "up", device)!;
      return { report, merged: true, promoted };
    }
    const id = this.db.transaction(() => {
      const row = this.db
        .query<{ id: number }, [string, number, number, number | null, number | null, string, number, number, number]>(
          `INSERT INTO reports (type, lat, lon, heading, maxspeed, device, created_at, confirmed_at, expires_at, up, down)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0) RETURNING id`,
        )
        .get(input.type, input.lat, input.lon, input.heading, input.maxspeed, device, now, now, now + LIFETIME[input.type])!;
      this.db.query("INSERT INTO votes (report_id, device, vote, at) VALUES (?, ?, 1, ?)").run(row.id, device, now);
      this.db.query("INSERT INTO report_events (at) VALUES (?)").run(now);
      return row.id;
    })();
    return { report: toReport(this.get(id, now)!), merged: false };
  }

  vote(id: number, vote: "up" | "down", device: string): VoteResult | null {
    const now = this.now();
    const row = this.get(id, now);
    if (!row) return null;
    return this.db.transaction((): VoteResult => {
      this.db
        .query(
          `INSERT INTO votes (report_id, device, vote, at) VALUES (?, ?, ?, ?)
           ON CONFLICT (report_id, device) DO UPDATE SET vote = excluded.vote, at = excluded.at`,
        )
        .run(id, device, vote === "up" ? 1 : -1, now);
      const counts = this.db
        .query<{ up: number; down: number }, [number]>(
          "SELECT coalesce(sum(vote = 1), 0) AS up, coalesce(sum(vote = -1), 0) AS down FROM votes WHERE report_id = ?",
        )
        .get(id)!;
      const up = vote === "up";
      this.db
        .query("UPDATE reports SET up = ?, down = ?, confirmed_at = ?, expires_at = ? WHERE id = ?")
        .run(counts.up, counts.down, up ? now : row.confirmed_at, up ? now + LIFETIME[row.type] : row.expires_at, id);
      const report = toReport(this.get(id, now)!);
      if (counts.down - counts.up >= 2) {
        this.remove(id);
        return { report, removed: true };
      }
      if (row.type === "fixed_camera" && counts.up >= PROMOTE_UP_VOTES) {
        const promoted = `c${id}`;
        this.fixed.addCommunity({ id: promoted, lat: row.lat, lon: row.lon, maxspeed: row.maxspeed, direction: row.heading });
        this.remove(id);
        return { report, removed: true, promoted };
      }
      return { report, removed: false };
    })();
  }

  remove(id: number): boolean {
    return this.db.query("DELETE FROM reports WHERE id = ?").run(id).changes > 0;
  }

  sweep(): void {
    const now = this.now();
    this.db.query("DELETE FROM report_events WHERE at <= ?").run(now - 24 * HOUR);
    this.db.query("DELETE FROM reports WHERE expires_at <= ?").run(now);
  }

  counts(): { active: number; last24h: number } {
    const now = this.now();
    const active = this.db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM reports WHERE expires_at > ?").get(now)!.n;
    const last24h = this.db
      .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM report_events WHERE at > ?")
      .get(now - 24 * HOUR)!.n;
    return { active, last24h };
  }
}
