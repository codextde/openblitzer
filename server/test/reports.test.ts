import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { openDb } from "../src/db";
import { FixedStore } from "../src/fixed";
import { checkLimits, RateLimiter } from "../src/ratelimit";
import { hashDevice, LIFETIME, Reports, type NewReport } from "../src/reports";

const MIN = 60_000;
let t = 0;
let db: Database;
let fixed: FixedStore;
let reports: Reports;

const base: NewReport = { type: "mobile_camera", lat: 52.52, lon: 13.405, heading: 90, maxspeed: 50 };
const report = (over: Partial<NewReport> = {}, device = "dev-a") => reports.create({ ...base, ...over }, device);
const id = (r: { id: string }) => Number(r.id);

beforeEach(() => {
  t = Date.parse("2026-10-12T12:00:00Z");
  db = openDb();
  fixed = new FixedStore(db, () => t);
  reports = new Reports(db, fixed, () => t);
});

describe("create + merge", () => {
  test("new report starts with the reporter as one up vote and type lifetime", () => {
    const { report: r, merged } = report();
    expect(merged).toBe(false);
    expect(r).toMatchObject({ type: "mobile_camera", up: 1, down: 0, heading: 90, maxspeed: 50 });
    expect(Date.parse(r.expiresAt) - Date.parse(r.confirmedAt)).toBe(2.5 * 60 * MIN);
  });

  test("same type within 200 m and heading within 60 deg merges as an up vote", () => {
    const first = report().report;
    t += 10 * MIN;
    const second = report({ lat: 52.5212, heading: 140 }, "dev-b");
    expect(second.merged).toBe(true);
    expect(second.report.id).toBe(first.id);
    expect(second.report.up).toBe(2);
    expect(second.report.confirmedAt).toBe(new Date(t).toISOString());
  });

  test("no merge for other type, > 200 m, or heading difference > 60 deg", () => {
    report();
    expect(report({ type: "accident" }, "b").merged).toBe(false);
    expect(report({ lat: 52.5225 }, "c").merged).toBe(false);
    expect(report({ heading: 160 }, "d").merged).toBe(false);
    expect(reports.list(52.52, 13.405, 1).reports).toHaveLength(4);
  });

  test("heading is ignored for merging when one side has none", () => {
    report({ heading: null });
    const r = report({ heading: 270 }, "b");
    expect(r.merged).toBe(true);
    expect(r.report.heading).toBe(270);
  });

  test("merging from the same device does not add a second up vote", () => {
    report();
    expect(report({}, "dev-a").report.up).toBe(1);
  });
});

describe("expiry", () => {
  test("reports disappear after their lifetime (filter on read) and are swept", () => {
    report({ type: "traffic_jam" });
    t += LIFETIME.traffic_jam - 1;
    expect(reports.list(52.52, 13.405, 5).reports).toHaveLength(1);
    t += 1;
    expect(reports.list(52.52, 13.405, 5).reports).toHaveLength(0);
    expect(reports.counts().active).toBe(0);
    reports.sweep();
    expect(db.query("SELECT COUNT(*) AS n FROM reports").get()).toEqual({ n: 0 });
    expect(db.query("SELECT COUNT(*) AS n FROM votes").get()).toEqual({ n: 0 });
  });

  test("up vote extends lifetime from the confirmation, down vote does not", () => {
    const r = report({ type: "accident" }).report;
    t += 60 * MIN;
    const up = reports.vote(id(r), "up", "b")!.report;
    expect(Date.parse(up.expiresAt)).toBe(t + LIFETIME.accident);
    t += 10 * MIN;
    const down = reports.vote(id(r), "down", "c")!.report;
    expect(down.expiresAt).toBe(up.expiresAt);
    expect(down.confirmedAt).toBe(up.confirmedAt);
  });

  test("votes on expired reports are rejected", () => {
    const r = report().report;
    t += LIFETIME.mobile_camera;
    expect(reports.vote(id(r), "up", "b")).toBeNull();
  });
});

describe("votes", () => {
  test("removed when down - up >= 2 (reporter counts as one up)", () => {
    const r = report().report;
    expect(reports.vote(id(r), "down", "b")!.removed).toBe(false);
    expect(reports.vote(id(r), "down", "c")!.removed).toBe(false);
    const last = reports.vote(id(r), "down", "d")!;
    expect(last.removed).toBe(true);
    expect(last.report).toMatchObject({ up: 1, down: 3 });
    expect(reports.list(52.52, 13.405, 5).reports).toHaveLength(0);
  });

  test("one vote per device, latest wins", () => {
    const r = report().report;
    reports.vote(id(r), "down", "b");
    reports.vote(id(r), "down", "b");
    expect(reports.vote(id(r), "down", "b")!.report).toMatchObject({ up: 1, down: 1 });
    expect(reports.vote(id(r), "up", "b")!.report).toMatchObject({ up: 2, down: 0 });
    expect(reports.vote(id(r), "down", "dev-a")!.report).toMatchObject({ up: 1, down: 1 });
  });

  test("unknown report", () => {
    expect(reports.vote(999, "up", "b")).toBeNull();
  });
});

describe("fixed_camera promotion", () => {
  test("3 distinct up votes promote into the fixed dataset as c<id>", () => {
    const before = fixed.current.version;
    const r = report({ type: "fixed_camera", heading: 180, maxspeed: 70 }).report;
    reports.vote(id(r), "up", "dev-a");
    expect(reports.vote(id(r), "up", "b")!.promoted).toBeUndefined();
    const result = reports.vote(id(r), "up", "c")!;
    expect(result.promoted).toBe(`c${r.id}`);
    expect(result.removed).toBe(true);
    expect(fixed.current.version).not.toBe(before);
    const dataset = JSON.parse(fixed.current.json);
    expect(dataset.cameras).toEqual([[`c${r.id}`, 52.52, 13.405, "speed", 70, 180]]);
    expect(reports.list(52.52, 13.405, 5).reports).toHaveLength(0);
    expect(Date.parse(r.expiresAt) - Date.parse(r.createdAt)).toBe(30 * 24 * 60 * MIN);
  });

  test("promotion also happens through merged reports", () => {
    report({ type: "fixed_camera" });
    report({ type: "fixed_camera" }, "b");
    const third = report({ type: "fixed_camera" }, "c");
    expect(third.merged).toBe(true);
    expect(third.promoted).toMatch(/^c\d+$/);
    expect(fixed.current.count).toBe(1);
  });

  test("other types never promote", () => {
    const r = report().report;
    reports.vote(id(r), "up", "b");
    expect(reports.vote(id(r), "up", "c")!.promoted).toBeUndefined();
    expect(fixed.current.count).toBe(0);
  });
});

describe("list", () => {
  test("filters by radius with haversine and sorts by distance", () => {
    report({ lat: 52.6 }, "a");
    report({ lat: 52.53 }, "b");
    report({ lat: 53.0 }, "c");
    const list = reports.list(52.52, 13.405, 10).reports;
    expect(list.map((r) => r.lat)).toEqual([52.53, 52.6]);
  });

  test("bounding box handles high longitudes", () => {
    report({ lat: 0, lon: 179.999 });
    expect(reports.list(0, 179.99, 5).reports).toHaveLength(1);
  });
});

describe("stats counters", () => {
  test("reports24h counts new reports, not merges", () => {
    report();
    report({}, "b");
    report({ type: "hazard" }, "c");
    expect(reports.counts()).toEqual({ active: 2, last24h: 2 });
    t += 25 * 60 * MIN;
    reports.sweep();
    expect(reports.counts()).toEqual({ active: 0, last24h: 0 });
  });
});

describe("rate limiter", () => {
  test("sliding window with Retry-After seconds", () => {
    const l = new RateLimiter(3, 60 * MIN);
    for (let i = 0; i < 3; i++) expect(checkLimits([[l, "k"]], i * MIN)).toBe(0);
    expect(checkLimits([[l, "k"]], 10 * MIN)).toBe(50 * 60);
    expect(checkLimits([[l, "other"]], 10 * MIN)).toBe(0);
    expect(checkLimits([[l, "k"]], 60 * MIN + 1)).toBe(0);
  });

  test("a blocked check does not consume quota on the other limiter", () => {
    const device = new RateLimiter(1, MIN);
    const ip = new RateLimiter(2, MIN);
    expect(checkLimits([[device, "d"], [ip, "i"]], 0)).toBe(0);
    expect(checkLimits([[device, "d"], [ip, "i"]], 1)).toBeGreaterThan(0);
    expect(checkLimits([[device, "d2"], [ip, "i"]], 2)).toBe(0);
  });

  test("device hash is salted sha256", () => {
    expect(hashDevice("abc", "s1")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDevice("abc", "s1")).not.toBe(hashDevice("abc", "s2"));
  });
});
