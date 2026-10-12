import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { openDb } from "../src/db";
import { FixedStore } from "../src/fixed";
import { mergeCountries, parseOverpass, type OverpassElement } from "../src/osm/parse";
import { Reports } from "../src/reports";
import fixture from "./fixtures/overpass-sample.json";

const ADMIN = "test-admin-token";
const dev = (n: number) => n.toString(16).padStart(32, "0");
let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  const db = openDb();
  const fixed = new FixedStore(db);
  fixed.replaceOsm(mergeCountries([parseOverpass(fixture.elements as OverpassElement[], "LU")]));
  const reports = new Reports(db, fixed);
  const app = createApp({ fixed, reports, salt: "salt", adminToken: ADMIN });
  server = Bun.serve({ port: 0, fetch: app.fetch });
  base = `http://localhost:${server.port}`;
});
afterAll(() => server.stop(true));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const newReport = (over: Record<string, unknown> = {}) => ({ type: "mobile_camera", lat: 49.6, lon: 6.1, heading: 10, device: dev(1), ...over });

describe("meta endpoints", () => {
  test("GET / points to docs", async () => {
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json() as any;
    expect(body.github).toBe("https://github.com/codextde/openblitzer");
    expect(body.docs).toContain("docs/API.md");
  });

  test("GET /v1/health", async () => {
    const body = await (await fetch(base + "/v1/health")).json() as any;
    expect(body).toMatchObject({ ok: true, version: "1.0.0" });
    expect(body.fixed).toBeGreaterThan(30);
    expect(body.reports).toBe(0);
  });

  test("OPTIONS preflight", async () => {
    const res = await fetch(base + "/v1/reports", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("unknown route 404, wrong method 405", async () => {
    expect((await fetch(base + "/nope")).status).toBe(404);
    expect((await fetch(base + "/v1/fixed", { method: "POST" })).status).toBe(405);
  });
});

describe("fixed dataset", () => {
  test("meta + dataset share the version; gzip, ETag and 304", async () => {
    const meta = await (await fetch(base + "/v1/fixed/meta")).json() as any;
    expect(meta.attribution).toBe("© OpenStreetMap contributors");
    expect(meta.version).toMatch(/^[0-9a-f]{12}$/);

    const res = await fetch(base + "/v1/fixed", { headers: { "Accept-Encoding": "gzip" }, decompress: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    expect(res.headers.get("etag")).toBe(`"${meta.version}"`);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const data = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await res.arrayBuffer()))));
    expect(data.version).toBe(meta.version);
    expect(data.cameras.length).toBe(meta.count);
    const [id, lat, lon, kind] = data.cameras[0];
    expect(typeof id).toBe("string");
    expect(typeof lat).toBe("number");
    expect(typeof lon).toBe("number");
    expect(["speed", "redlight", "speed_redlight", "section_start", "section_end"]).toContain(kind);

    const plain = await fetch(base + "/v1/fixed", { headers: { "Accept-Encoding": "identity" } });
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect((await plain.json() as any).version).toBe(meta.version);

    const cached = await fetch(base + "/v1/fixed", { headers: { "If-None-Match": `"${meta.version}"` } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
  });
});

describe("reports", () => {
  let id: string;

  test("validation errors are 400 with {error}", async () => {
    for (const bad of [
      newReport({ type: "ufo" }),
      newReport({ lat: 91 }),
      newReport({ lon: "6.1" }),
      newReport({ lat: null }),
      newReport({ heading: 360 }),
      newReport({ maxspeed: 4 }),
      newReport({ maxspeed: 201 }),
      newReport({ device: "x" }),
    ]) {
      const res = await post("/v1/reports", bad);
      expect(res.status).toBe(400);
      expect(typeof (await res.json() as any).error).toBe("string");
    }
    const res = await fetch(base + "/v1/reports", { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
    expect((await fetch(base + "/v1/reports?lat=abc&lon=1")).status).toBe(400);
  });

  test("POST creates, second nearby report merges", async () => {
    const res = await post("/v1/reports", newReport({ maxspeed: 50, speed: 13.4 }));
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.merged).toBe(false);
    expect(body.report).toMatchObject({ type: "mobile_camera", lat: 49.6, lon: 6.1, heading: 10, maxspeed: 50, up: 1, down: 0 });
    id = body.report.id;

    const merged = await (await post("/v1/reports", newReport({ lat: 49.6005, device: dev(2) }))).json() as any;
    expect(merged).toMatchObject({ merged: true, report: { id, up: 2 } });
  });

  test("GET /v1/reports by position and radius", async () => {
    const body = await (await fetch(`${base}/v1/reports?lat=49.61&lon=6.1&radius=5`)).json() as any;
    expect(Date.parse(body.now)).toBeGreaterThan(0);
    expect(body.reports.map((r: { id: string }) => r.id)).toEqual([id]);
    const far = await (await fetch(`${base}/v1/reports?lat=52.5&lon=13.4`)).json() as any;
    expect(far.reports).toEqual([]);
  });

  test("votes: validation, 404, removal returns null", async () => {
    expect((await post(`/v1/reports/${id}/votes`, { vote: "maybe", device: dev(3) })).status).toBe(400);
    expect((await post(`/v1/reports/99999/votes`, { vote: "up", device: dev(3) })).status).toBe(404);
    const up = await (await post(`/v1/reports/${id}/votes`, { vote: "up", device: dev(3) })).json() as any;
    expect(up.report).toMatchObject({ id, up: 3, down: 0 });
    for (const n of [4, 5, 6, 7]) await post(`/v1/reports/${id}/votes`, { vote: "down", device: dev(n) });
    const last = await (await post(`/v1/reports/${id}/votes`, { vote: "down", device: dev(8) })).json() as any;
    expect(last).toEqual({ report: null });
  });

  test("fixed_camera promotion shows up in /v1/fixed", async () => {
    const before = await (await fetch(base + "/v1/fixed/meta")).json() as any;
    const created = await (await post("/v1/reports", newReport({ type: "fixed_camera", lat: 48, lon: 11, maxspeed: 80, device: dev(20) }))).json() as any;
    await post(`/v1/reports/${created.report.id}/votes`, { vote: "up", device: dev(21) });
    const result = await (await post(`/v1/reports/${created.report.id}/votes`, { vote: "up", device: dev(22) })).json() as any;
    expect(result).toEqual({ report: null, promoted: `c${created.report.id}` });
    const data = await (await fetch(base + "/v1/fixed")).json() as any;
    expect(data.version).not.toBe(before.version);
    expect(data.cameras).toContainEqual([`c${created.report.id}`, 48, 11, "speed", 80, 10]);
  });

  test("admin delete", async () => {
    const created = await (await post("/v1/reports", newReport({ type: "hazard", lat: 40, lon: 3, device: dev(30) }))).json() as any;
    const path = `/v1/reports/${created.report.id}`;
    expect((await fetch(base + path, { method: "DELETE" })).status).toBe(401);
    expect((await fetch(base + path, { method: "DELETE", headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    const ok = await fetch(base + path, { method: "DELETE", headers: { Authorization: `Bearer ${ADMIN}` } });
    expect(ok.status).toBe(200);
    expect((await fetch(base + path, { method: "DELETE", headers: { Authorization: `Bearer ${ADMIN}` } })).status).toBe(404);
  });

  test("stats", async () => {
    const body = await (await fetch(base + "/v1/stats")).json() as any;
    expect(body.fixed).toBeGreaterThan(30);
    expect(body.countries).toBe(1);
    expect(body.reportsActive).toBe(0);
    expect(body.reports24h).toBe(3);
  });
});

describe("rate limits", () => {
  test("12 reports per device per hour, then 429 with Retry-After", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await post("/v1/reports", newReport({ type: "hazard", lat: 30 + i, device: dev(100) }), { "X-Forwarded-For": "10.0.0.1" });
      expect(res.status).toBe(201);
    }
    const res = await post("/v1/reports", newReport({ type: "hazard", lat: 50, device: dev(100) }), { "X-Forwarded-For": "10.0.0.1" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(3000);
    expect((await res.json() as any).error).toBeString();
  });

  test("40 reports per IP per hour (CF-Connecting-IP / first X-Forwarded-For entry)", async () => {
    let status = 0;
    for (let i = 0; i < 41; i++) {
      const headers: Record<string, string> = i % 2 ? { "CF-Connecting-IP": "10.0.0.2" } : { "X-Forwarded-For": "10.0.0.2, 172.16.0.1" };
      status = (await post("/v1/reports", newReport({ type: "hazard", lat: -40 + i, device: dev(200 + i) }), headers)).status;
      if (i < 40) expect(status).toBe(201);
    }
    expect(status).toBe(429);
  });
});
