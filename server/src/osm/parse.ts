import type { FixedCamera, FixedKind } from "../fixed";
import { angleDiff, bearing, round5 } from "../geo";

type Tags = Record<string, string>;
export type OverpassNode = { type: "node"; id: number; lat: number; lon: number; tags?: Tags };
export type OverpassRelation = {
  type: "relation";
  id: number;
  members: { type: string; ref: number; role: string }[];
  tags?: Tags;
};
export type OverpassElement = OverpassNode | OverpassRelation | { type: "way"; id: number };
export type ParseResult = { cameras: FixedCamera[]; consumed: Set<number> };

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function parseMaxspeed(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?\s*$/i.exec(value.split(";")[0]!);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.toLowerCase() === "mph" ? 1.609344 : 1);
  const kmh = Math.round(n);
  return kmh >= 5 && kmh <= 300 ? kmh : null;
}

export function parseDirection(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (/^-?\d+(\.\d+)?$/.test(v)) return ((Math.round(Number(v)) % 360) + 360) % 360;
  const i = CARDINALS.indexOf(v);
  return i >= 0 ? Math.round(i * 22.5) % 360 : null;
}

function kindOf(enforcement: Set<string>): FixedKind {
  const speed = enforcement.has("maxspeed");
  const red = enforcement.has("traffic_signals");
  return speed && red ? "speed_redlight" : red ? "redlight" : "speed";
}

const splitValues = (v: string | undefined) => new Set((v ?? "").split(";").map((s) => s.trim()).filter(Boolean));

type DeviceCamera = FixedCamera & { enforcement: Set<string>; directions: number[] };

export function parseOverpass(elements: OverpassElement[], country: string): ParseResult {
  const nodes = new Map<number, OverpassNode>();
  const relations: OverpassRelation[] = [];
  for (const el of elements) {
    if (el.type === "node") {
      const prev = nodes.get(el.id);
      nodes.set(el.id, { ...el, tags: el.tags ?? prev?.tags });
    } else if (el.type === "relation") relations.push(el);
  }
  relations.sort((a, b) => a.id - b.id);

  const consumed = new Set<number>();
  const sections: FixedCamera[] = [];
  const devices = new Map<number, DeviceCamera>();
  const member = (r: OverpassRelation, role: string) =>
    r.members.filter((m) => m.type === "node" && m.role === role).map((m) => nodes.get(m.ref)).filter((n) => !!n);

  for (const r of relations) {
    const tags = r.tags ?? {};
    const enforcement = splitValues(tags.enforcement);
    const from = member(r, "from")[0];
    const to = member(r, "to")[0];
    const devs = member(r, "device");
    if (enforcement.has("average_speed")) {
      if (!from || !to) continue;
      const maxspeed = parseMaxspeed(tags.maxspeed) ?? parseMaxspeed(devs[0]?.tags?.maxspeed);
      const direction = bearing(from.lat, from.lon, to.lat, to.lon);
      const base = { maxspeed, direction, country };
      sections.push({ id: `r${r.id}:s`, lat: round5(from.lat), lon: round5(from.lon), kind: "section_start", ...base });
      sections.push({ id: `r${r.id}:e`, lat: round5(to.lat), lon: round5(to.lon), kind: "section_end", ...base });
      for (const d of devs) consumed.add(d.id);
      continue;
    }
    devs.forEach((d, i) => {
      const direction = from
        ? from.id === d.id ? null : bearing(from.lat, from.lon, d.lat, d.lon)
        : to && to.id !== d.id
          ? bearing(d.lat, d.lon, to.lat, to.lon)
          : parseDirection(d.tags?.direction);
      const maxspeed = parseMaxspeed(tags.maxspeed) ?? parseMaxspeed(d.tags?.maxspeed);
      consumed.add(d.id);
      const existing = devices.get(d.id);
      if (existing) {
        for (const e of enforcement) existing.enforcement.add(e);
        existing.kind = kindOf(existing.enforcement);
        existing.maxspeed ??= maxspeed;
        if (direction !== null) existing.directions.push(direction);
        return;
      }
      devices.set(d.id, {
        id: i === 0 ? `r${r.id}` : `r${r.id}:${i + 1}`,
        lat: round5(d.lat),
        lon: round5(d.lon),
        kind: kindOf(enforcement),
        maxspeed,
        direction: null,
        country,
        enforcement: new Set(enforcement),
        directions: direction === null ? [] : [direction],
      });
    });
  }

  const cameras: FixedCamera[] = [...sections];
  for (const { enforcement: _e, directions, ...cam } of devices.values()) {
    const first = directions[0];
    const agree = first !== undefined && directions.every((d) => angleDiff(d, first) <= 30);
    cameras.push({ ...cam, direction: agree ? first : null });
  }
  for (const n of nodes.values()) {
    if (n.tags?.highway !== "speed_camera" || consumed.has(n.id)) continue;
    cameras.push({
      id: `n${n.id}`,
      lat: round5(n.lat),
      lon: round5(n.lon),
      kind: kindOf(splitValues(n.tags.enforcement)),
      maxspeed: parseMaxspeed(n.tags.maxspeed),
      direction: parseDirection(n.tags.direction),
      country,
    });
  }
  return { cameras, consumed };
}

export function mergeCountries(results: ParseResult[]): FixedCamera[] {
  const consumed = new Set<number>();
  for (const r of results) for (const id of r.consumed) consumed.add(id);
  const byId = new Map<string, FixedCamera>();
  const seen = new Set<string>();
  for (const r of results) {
    for (const c of r.cameras) {
      if (byId.has(c.id)) continue;
      if (c.id.startsWith("n") && consumed.has(Number(c.id.slice(1)))) continue;
      const key = `${c.lat},${c.lon},${c.kind},${c.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);
      byId.set(c.id, c);
    }
  }
  return [...byId.values()];
}
