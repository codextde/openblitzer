import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { loadConfig, USER_AGENT } from "../config";
import { getMeta, openDb, setMeta } from "../db";
import { FixedStore } from "../fixed";
import { mergeCountries, parseOverpass, type OverpassElement, type ParseResult } from "./parse";

export const EUROPE = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
  "AL", "BA", "ME", "MK", "RS", "XK", "TR",
  "AD", "MC", "SM",
];

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function overpassQuery(country: string): string {
  return `[out:json][timeout:180];
area["ISO3166-1"="${country}"][admin_level=2]->.a;
(
  node(area.a)[highway=speed_camera];
  relation(area.a)[type=enforcement][enforcement~"^(maxspeed|traffic_signals|average_speed|maxspeed;traffic_signals|traffic_signals;maxspeed)$"];
)->.c;
.c out body;
node(r.c);
out skel qt;`;
}

export type ImportOptions = {
  overpassUrl: string;
  countries?: string[];
  retries?: number;
  backoffMs?: number;
  pauseMs?: number;
  keepOtherCountries?: boolean;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
};

export async function fetchCountry(country: string, opts: ImportOptions): Promise<OverpassElement[]> {
  const doFetch = opts.fetch ?? fetch;
  const retries = opts.retries ?? 4;
  const backoff = opts.backoffMs ?? 15_000;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoff * 2 ** (attempt - 1));
    try {
      const res = await doFetch(opts.overpassUrl, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQuery(country) }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
      if (body.remark && /error/i.test(body.remark)) throw new Error(body.remark);
      if (!Array.isArray(body.elements)) throw new Error("no elements");
      return body.elements;
    } catch (err) {
      lastError = err;
      opts.log?.(`import ${country}: attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  throw lastError;
}

export type ImportResult = { count: number; failed: string[]; ms: number };

export async function runImport(fixed: FixedStore, opts: ImportOptions): Promise<ImportResult> {
  const started = Date.now();
  const countries = opts.countries ?? EUROPE;
  const results: ParseResult[] = [];
  const failed: string[] = [];
  for (const [i, country] of countries.entries()) {
    if (i > 0) await sleep(opts.pauseMs ?? 3000);
    try {
      const t = Date.now();
      const parsed = parseOverpass(await fetchCountry(country, opts), country);
      results.push(parsed);
      opts.log?.(`import ${country}: ${parsed.cameras.length} cameras in ${Date.now() - t} ms`);
    } catch {
      failed.push(country);
      results.push({ cameras: fixed.osmRows().filter((c) => c.country === country), consumed: new Set() });
      opts.log?.(`import ${country}: failed, keeping previous data`);
    }
  }
  if (failed.length === countries.length) throw new Error("import failed for all countries");
  if (opts.keepOtherCountries) {
    const others = fixed.osmRows().filter((c) => !countries.includes(c.country ?? ""));
    results.push({ cameras: others, consumed: new Set() });
  }
  const cameras = mergeCountries(results);
  fixed.replaceOsm(cameras);
  return { count: cameras.length, failed, ms: Date.now() - started };
}

export class ImportScheduler {
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private db: Database,
    private fixed: FixedStore,
    private opts: ImportOptions,
  ) {}

  due(now = Date.now()): boolean {
    return now >= Number(getMeta(this.db, "import_next_at") ?? 0);
  }

  async run(): Promise<ImportResult | null> {
    if (this.running) return null;
    this.running = true;
    const log = this.opts.log ?? console.log;
    try {
      const result = await runImport(this.fixed, this.opts);
      const now = Date.now();
      setMeta(this.db, "import_last_at", new Date(now).toISOString());
      setMeta(this.db, "import_next_at", String(now + (result.failed.length ? DAY : WEEK)));
      log(`import done: ${result.count} cameras in ${Math.round(result.ms / 1000)} s, failed: ${result.failed.join(",") || "none"}`);
      return result;
    } catch (err) {
      setMeta(this.db, "import_next_at", String(Date.now() + 6 * 3_600_000));
      log(`import failed, keeping previous dataset: ${err instanceof Error ? err.message : err}`);
      return null;
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.fixed.current.count === 0 || this.due()) void this.run();
    this.timer = setInterval(() => {
      if (this.due()) void this.run();
    }, 3_600_000);
  }

  stop(): void {
    clearInterval(this.timer);
  }
}

if (import.meta.main) {
  const config = loadConfig();
  const db = openDb(join(config.dataDir, "openblitzer.db"));
  const fixed = new FixedStore(db);
  const countries = process.argv.slice(2).map((c) => c.toUpperCase());
  const scheduler = new ImportScheduler(db, fixed, {
    overpassUrl: config.overpassUrl,
    countries: countries.length ? countries : (config.countries ?? undefined),
    keepOtherCountries: countries.length > 0,
  });
  const result = await scheduler.run();
  db.close();
  process.exit(result ? 0 : 1);
}
