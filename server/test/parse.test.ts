import { describe, expect, test } from "bun:test";
import { bearing } from "../src/geo";
import { mergeCountries, parseDirection, parseMaxspeed, parseOverpass, type OverpassElement } from "../src/osm/parse";
import fixture from "./fixtures/overpass-sample.json";

const elements = fixture.elements as OverpassElement[];

describe("parseMaxspeed", () => {
  test.each([
    ["50", 50],
    ["50 mph", 80],
    ["30mph", 48],
    ["70 km/h", 70],
    ["60;80", 60],
    ["DE:urban", null],
    ["none", null],
    ["signals", null],
    ["", null],
    [undefined, null],
    ["0", null],
  ])("%p -> %p", (input, expected) => expect(parseMaxspeed(input)).toBe(expected));
});

describe("parseDirection", () => {
  test.each([
    ["105", 105],
    ["360", 0],
    ["-90", 270],
    ["12.6", 13],
    ["N", 0],
    ["NNE", 23],
    ["e", 90],
    ["SW", 225],
    ["NNW", 338],
    ["forward", null],
    ["backward", null],
    ["both", null],
    ["90;270", null],
    [undefined, null],
  ])("%p -> %p", (input, expected) => expect(parseDirection(input)).toBe(expected));
});

describe("parseOverpass (fixture: Luxembourg)", () => {
  const { cameras, consumed } = parseOverpass(elements, "LU");
  const byId = new Map(cameras.map((c) => [c.id, c]));

  test("produces cameras of the expected kinds with 5-decimal coordinates", () => {
    expect(cameras.length).toBeGreaterThan(30);
    const kinds = new Set(cameras.map((c) => c.kind));
    for (const k of ["speed", "section_start", "section_end"]) expect(kinds.has(k as never)).toBe(true);
    for (const c of cameras) {
      expect(c.country).toBe("LU");
      expect(Math.round(c.lat * 1e5) / 1e5).toBe(c.lat);
      expect(Math.round(c.lon * 1e5) / 1e5).toBe(c.lon);
      expect(c.direction === null || (c.direction >= 0 && c.direction < 360)).toBe(true);
      expect(c.id).toMatch(/^(n\d+|r\d+(:s|:e|:\d+)?)$/);
    }
  });

  test("maxspeed relation: direction is the bearing from 'from' to 'device'", () => {
    const node = (id: number) => elements.find((e) => e.type === "node" && e.id === id) as { lat: number; lon: number };
    const from = node(2311545878);
    const device = node(4086562927);
    expect(byId.get("r8448033")).toMatchObject({
      kind: "speed",
      maxspeed: 70,
      direction: bearing(from.lat, from.lon, device.lat, device.lon),
    });
  });

  test("device shared by relations for both driving directions has direction null", () => {
    expect(byId.get("r6880694")).toMatchObject({ kind: "speed", maxspeed: 90, direction: null });
    expect(byId.has("r8675305")).toBe(false);
  });

  test("average_speed relation becomes a section start/end pair at from/to", () => {
    const s = byId.get("r9916704:s")!;
    const e = byId.get("r9916704:e")!;
    expect(s.kind).toBe("section_start");
    expect(e.kind).toBe("section_end");
    expect(s.maxspeed).toBe(90);
    expect(s.direction).toBe(e.direction);
    expect(byId.has("r9916704")).toBe(false);
  });

  test("relation devices are not duplicated as speed_camera nodes", () => {
    for (const id of consumed) expect(byId.has(`n${id}`)).toBe(false);
    const taggedDevices = elements.filter(
      (e) => e.type === "node" && e.tags?.highway === "speed_camera" && consumed.has(e.id),
    );
    expect(taggedDevices.length).toBeGreaterThan(0);
  });

  test("device in both a maxspeed and a traffic_signals relation is speed_redlight", () => {
    expect(cameras.some((c) => c.kind === "speed_redlight")).toBe(true);
  });
});

describe("synthetic shapes", () => {
  const node = (id: number, lat: number, lon: number, tags?: Record<string, string>) =>
    ({ type: "node", id, lat, lon, tags }) as OverpassElement;
  const rel = (id: number, enforcement: string, members: [string, number][], tags: Record<string, string> = {}) =>
    ({
      type: "relation",
      id,
      members: members.map(([role, ref]) => ({ type: "node", ref, role })),
      tags: { type: "enforcement", enforcement, ...tags },
    }) as OverpassElement;

  test("node kinds, tags and dedupe", () => {
    const { cameras } = parseOverpass(
      [
        node(1, 52.000001, 13.000004, { highway: "speed_camera", maxspeed: "50 mph", direction: "NE" }),
        node(2, 52.1, 13.1, { highway: "speed_camera", enforcement: "maxspeed;traffic_signals" }),
        node(3, 52.2, 13.2, { highway: "speed_camera", enforcement: "traffic_signals", direction: "forward" }),
        node(10, 52.3, 13.3, { highway: "speed_camera", maxspeed: "30" }),
        node(11, 52.299, 13.3),
        rel(100, "traffic_signals", [["device", 10], ["from", 11]], { maxspeed: "40" }),
        node(10, 52.3, 13.3),
      ],
      "DE",
    );
    const byId = new Map(cameras.map((c) => [c.id, c]));
    expect(byId.get("n1")).toMatchObject({ lat: 52, lon: 13, kind: "speed", maxspeed: 80, direction: 45 });
    expect(byId.get("n2")!.kind).toBe("speed_redlight");
    expect(byId.get("n3")).toMatchObject({ kind: "redlight", direction: null });
    expect(byId.has("n10")).toBe(false);
    expect(byId.get("r100")).toMatchObject({ kind: "redlight", maxspeed: 40, direction: 0 });
  });

  test("device shared by two opposite relations gets no direction; maxspeed + traffic_signals merge", () => {
    const { cameras } = parseOverpass(
      [
        node(1, 50, 8),
        node(2, 49.999, 8),
        node(3, 50.001, 8),
        rel(5, "maxspeed", [["device", 1], ["from", 2]], { maxspeed: "60" }),
        rel(6, "traffic_signals", [["device", 1], ["from", 3]]),
      ],
      "DE",
    );
    expect(cameras).toEqual([{ id: "r5", lat: 50, lon: 8, kind: "speed_redlight", maxspeed: 60, direction: null, country: "DE" }]);
  });

  test("mergeCountries drops cross-border duplicates", () => {
    const a = parseOverpass([node(1, 47.5, 9.5, { highway: "speed_camera" })], "AT");
    const b = parseOverpass(
      [node(1, 47.5, 9.5, { highway: "speed_camera" }), node(2, 47.49, 9.5), rel(9, "maxspeed", [["device", 1], ["from", 2]])],
      "DE",
    );
    const merged = mergeCountries([a, b]);
    expect(merged.map((c) => c.id)).toEqual(["r9"]);
  });
});
