import type { Server } from "bun";
import { timingSafeEqual } from "node:crypto";
import { ATTRIBUTION, GITHUB_URL, VERSION } from "./config";
import type { FixedStore } from "./fixed";
import { checkLimits, RateLimiter } from "./ratelimit";
import { hashDevice, REPORT_TYPES, type NewReport, type Reports, type ReportType } from "./reports";

const HOUR = 3_600_000;
const MAX_BODY = 8 * 1024;

export type AppDeps = {
  fixed: FixedStore;
  reports: Reports;
  salt: string;
  adminToken: string | null;
  now?: () => number;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, If-None-Match",
  "Access-Control-Expose-Headers": "ETag, Retry-After",
  "Access-Control-Max-Age": "86400",
};

const acceptsGzip = (req: Request) => {
  const ae = req.headers.get("accept-encoding") ?? "";
  return /\bgzip\b/i.test(ae) && !/\bgzip\s*;\s*q=0(\.0*)?\s*(,|$)/i.test(ae);
};

function json(req: Request, body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const text = JSON.stringify(body);
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Accept-Encoding",
    ...CORS,
    ...headers,
  };
  if (text.length > 1024 && acceptsGzip(req)) {
    return new Response(Bun.gzipSync(text), { status, headers: { ...h, "Content-Encoding": "gzip" } });
  }
  return new Response(text, { status, headers: h });
}

function num(v: unknown, name: string, min: number, max: number, optional: true): number | null;
function num(v: unknown, name: string, min: number, max: number, optional?: false): number;
function num(v: unknown, name: string, min: number, max: number, optional = false): number | null {
  if (optional && (v === undefined || v === null)) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new HttpError(400, `${name} must be a number between ${min} and ${max}`);
  }
  return v;
}

function device(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(v)) {
    throw new HttpError(400, "device must be a random hex id");
  }
  return v;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw new HttpError(413, "body too large");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "body too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "body must be a JSON object");
  return body as Record<string, unknown>;
}

function parseReport(body: Record<string, unknown>): NewReport {
  if (!REPORT_TYPES.includes(body.type as ReportType)) {
    throw new HttpError(400, `type must be one of ${REPORT_TYPES.join(", ")}`);
  }
  const heading = num(body.heading, "heading", 0, 359.999, true);
  const maxspeed = num(body.maxspeed, "maxspeed", 5, 200, true);
  num(body.speed, "speed", 0, 1000, true);
  return {
    type: body.type as ReportType,
    lat: num(body.lat, "lat", -90, 90),
    lon: num(body.lon, "lon", -180, 180),
    heading: heading === null ? null : Math.round(heading) % 360,
    maxspeed: maxspeed === null ? null : Math.round(maxspeed),
  };
}

const IP_HEADER = (process.env.OPENBLITZER_IP_HEADER ?? "x-forwarded-for").toLowerCase();

function clientIp(req: Request, server: Server<unknown> | undefined): string {
  const hops = req.headers.get(IP_HEADER)?.split(",").map((s) => s.trim()).filter(Boolean);
  return hops?.at(-1) || server?.requestIP(req)?.address || "unknown";
}

function sameSecret(a: string, b: string): boolean {
  const h = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((t) => {
    const v = t.trim().replace(/^W\//, "");
    return v === "*" || v === etag;
  });
}

export function createApp({ fixed, reports, salt, adminToken, now = Date.now }: AppDeps) {
  const limits = {
    deviceReports: new RateLimiter(12, HOUR),
    deviceVotes: new RateLimiter(120, HOUR),
    ipReports: new RateLimiter(40, HOUR),
  };

  const limit = (checks: [RateLimiter, string][]) => {
    const wait = checkLimits(checks, now());
    if (wait) throw new HttpError(429, "rate limit exceeded, try again later", { "Retry-After": String(wait) });
  };

  async function route(req: Request, server?: Server<unknown>): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method === "HEAD" ? "GET" : req.method;

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (path === "/" && method === "GET") {
      return json(req, {
        name: "OpenBlitzer API",
        version: VERSION,
        docs: `${GITHUB_URL}/blob/main/docs/API.md`,
        github: GITHUB_URL,
        attribution: ATTRIBUTION,
      });
    }

    if (path === "/v1/health" && method === "GET") {
      const snap = fixed.current;
      return json(req, { ok: true, version: VERSION, dataset: snap.version, fixed: snap.count, reports: reports.counts().active });
    }

    if (path === "/v1/fixed/meta" && method === "GET") {
      return json(req, fixed.meta(), 200, { "Cache-Control": "public, max-age=300", ETag: `"${fixed.current.version}"` });
    }

    if (path === "/v1/fixed" && method === "GET") {
      const snap = fixed.current;
      const etag = `"${snap.version}"`;
      const headers: Record<string, string> = {
        ...CORS,
        ETag: etag,
        "Cache-Control": "public, max-age=3600",
        Vary: "Accept-Encoding",
      };
      if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
      headers["Content-Type"] = "application/json; charset=utf-8";
      if (acceptsGzip(req)) return new Response(snap.gzip, { headers: { ...headers, "Content-Encoding": "gzip" } });
      return new Response(snap.json, { headers });
    }

    if (path === "/v1/stats" && method === "GET") {
      const { active, last24h } = reports.counts();
      return json(
        req,
        { fixed: fixed.current.count, reportsActive: active, reports24h: last24h, countries: fixed.countries() },
        200,
        { "Cache-Control": "public, max-age=60" },
      );
    }

    if (path === "/v1/reports" && method === "GET") {
      const q = url.searchParams;
      const lat = num(q.get("lat") === null ? undefined : Number(q.get("lat")), "lat", -90, 90);
      const lon = num(q.get("lon") === null ? undefined : Number(q.get("lon")), "lon", -180, 180);
      const radius = q.get("radius") === null ? 50 : num(Number(q.get("radius")), "radius", 0.001, Infinity);
      return json(req, reports.list(lat, lon, Math.min(radius, 150)));
    }

    if (path === "/v1/reports" && method === "POST") {
      const body = await readBody(req);
      const input = parseReport(body);
      const hash = hashDevice(device(body.device), salt);
      limit([
        [limits.deviceReports, hash],
        [limits.ipReports, clientIp(req, server)],
      ]);
      const { report, merged, promoted } = reports.create(input, hash);
      return json(req, promoted ? { report, merged, promoted } : { report, merged }, 201);
    }

    const vote = /^\/v1\/reports\/([^/]+)\/votes$/.exec(path);
    if (vote && method === "POST") {
      const body = await readBody(req);
      if (body.vote !== "up" && body.vote !== "down") throw new HttpError(400, 'vote must be "up" or "down"');
      const hash = hashDevice(device(body.device), salt);
      limit([[limits.deviceVotes, hash]]);
      const id = /^\d+$/.test(vote[1]!) ? Number(vote[1]) : NaN;
      const result = Number.isSafeInteger(id) ? reports.vote(id, body.vote, hash) : null;
      if (!result) throw new HttpError(404, "report not found or expired");
      return json(req, result.promoted ? { report: null, promoted: result.promoted } : { report: result.removed ? null : result.report });
    }

    const del = /^\/v1\/reports\/([^/]+)$/.exec(path);
    if (del && method === "DELETE") {
      if (!adminToken) throw new HttpError(403, "admin API disabled");
      const auth = req.headers.get("authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (!token || !sameSecret(token, adminToken)) throw new HttpError(401, "unauthorized");
      const id = del[1]!;
      const removed = /^\d+$/.test(id) ? reports.remove(Number(id)) : /^c\d+$/.test(id) ? fixed.deleteCommunity(id) : false;
      if (!removed) throw new HttpError(404, "not found");
      return json(req, { ok: true });
    }

    const known = ["/", "/v1/health", "/v1/fixed", "/v1/fixed/meta", "/v1/stats", "/v1/reports"].includes(path) || vote || del;
    throw new HttpError(known ? 405 : 404, known ? "method not allowed" : "not found");
  }

  return {
    limits,
    async fetch(req: Request, server?: Server<unknown>): Promise<Response> {
      try {
        const res = await route(req, server);
        return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
      } catch (err) {
        if (err instanceof HttpError) return json(req, { error: err.message }, err.status, err.headers);
        console.error(err);
        return json(req, { error: "internal error" }, 500);
      }
    },
  };
}
