import { describe, expect, test } from "bun:test";
import { getMeta, openDb } from "../src/db";
import { FixedStore } from "../src/fixed";
import { ImportScheduler, overpassQuery, runImport, type ImportOptions } from "../src/osm/import";
import fixture from "./fixtures/overpass-sample.json";

type Reply = { status: number; body: unknown };

function mockFetch(replies: Record<string, Reply[]>) {
  const calls: { country: string; userAgent: string | null }[] = [];
  const fn = async (_url: string | URL | Request, init?: RequestInit) => {
    const query = new URLSearchParams(String(init?.body)).get("data") ?? "";
    const country = /"ISO3166-1"="(\w+)"/.exec(query)![1]!;
    calls.push({ country, userAgent: new Headers(init?.headers).get("user-agent") });
    const reply = replies[country]?.shift() ?? { status: 504, body: "busy" };
    return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status });
  };
  return { calls, fetch: fn as unknown as typeof fetch };
}

const opts = (fetchImpl: typeof fetch, countries: string[]): ImportOptions => ({
  overpassUrl: "http://overpass.test/api/interpreter",
  countries,
  retries: 2,
  backoffMs: 1,
  pauseMs: 0,
  fetch: fetchImpl,
});

describe("overpass query", () => {
  test("queries speed_camera nodes and enforcement relations by ISO area with members", () => {
    const q = overpassQuery("DE");
    expect(q).toContain('area["ISO3166-1"="DE"][admin_level=2]');
    expect(q).toContain("node(area.a)[highway=speed_camera]");
    expect(q).toContain("relation(area.a)[type=enforcement]");
    expect(q).toContain("[timeout:180]");
    expect(q).toContain("node(r.c)");
  });
});

describe("runImport", () => {
  test("imports per country with retries and the OpenBlitzer User-Agent", async () => {
    const fixed = new FixedStore(openDb());
    const mock = mockFetch({
      LU: [{ status: 504, body: "gateway timeout" }, { status: 200, body: fixture }],
      LI: [{ status: 200, body: { elements: [] } }],
    });
    const result = await runImport(fixed, opts(mock.fetch, ["LU", "LI"]));
    expect(result.failed).toEqual([]);
    expect(result.count).toBeGreaterThan(30);
    expect(fixed.current.count).toBe(result.count);
    expect(mock.calls.map((c) => c.country)).toEqual(["LU", "LU", "LI"]);
    expect(mock.calls[0]!.userAgent).toMatch(/^OpenBlitzer\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/codextde\/openblitzer\)$/);
  });

  test("an Overpass runtime error remark counts as failure", async () => {
    const fixed = new FixedStore(openDb());
    const mock = mockFetch({
      LU: [
        { status: 200, body: { elements: [], remark: "runtime error: Query timed out" } },
        { status: 200, body: fixture },
      ],
    });
    const result = await runImport(fixed, opts(mock.fetch, ["LU"]));
    expect(result.count).toBeGreaterThan(30);
  });

  test("a failed country keeps its previous rows; failing everything throws and keeps the dataset", async () => {
    const fixed = new FixedStore(openDb());
    await runImport(fixed, opts(mockFetch({ LU: [{ status: 200, body: fixture }] }).fetch, ["LU"]));
    const version = fixed.current.version;
    const count = fixed.current.count;

    const partial = await runImport(fixed, opts(mockFetch({ LI: [{ status: 200, body: { elements: [] } }] }).fetch, ["LU", "LI"]));
    expect(partial.failed).toEqual(["LU"]);
    expect(fixed.current.count).toBe(count);
    expect(fixed.current.version).toBe(version);

    await expect(runImport(fixed, opts(mockFetch({}).fetch, ["LU"]))).rejects.toThrow();
    expect(fixed.current.version).toBe(version);
  });

  test("community cameras survive an import", async () => {
    const fixed = new FixedStore(openDb());
    fixed.addCommunity({ id: "c1", lat: 1, lon: 2, maxspeed: null, direction: null });
    await runImport(fixed, opts(mockFetch({ LU: [{ status: 200, body: fixture }] }).fetch, ["LU"]));
    expect(JSON.parse(fixed.current.json).cameras).toContainEqual(["c1", 1, 2, "speed", null, null]);
  });
});

describe("ImportScheduler", () => {
  test("schedules the next run in 7 days on success and 6 h after a total failure", async () => {
    const db = openDb();
    const fixed = new FixedStore(db);
    const ok = new ImportScheduler(db, fixed, { ...opts(mockFetch({ LU: [{ status: 200, body: fixture }] }).fetch, ["LU"]), log: () => {} });
    expect(ok.due()).toBe(true);
    await ok.run();
    const next = Number(getMeta(db, "import_next_at"));
    expect(next - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(ok.due()).toBe(false);

    const failing = new ImportScheduler(db, fixed, { ...opts(mockFetch({}).fetch, ["LU"]), log: () => {} });
    expect(await failing.run()).toBeNull();
    const retry = Number(getMeta(db, "import_next_at")) - Date.now();
    expect(retry).toBeGreaterThan(5.9 * 3_600_000);
    expect(retry).toBeLessThan(6.1 * 3_600_000);
    expect(fixed.current.count).toBeGreaterThan(30);
  });
});
