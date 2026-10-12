import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pkg from "../package.json";

export const VERSION: string = pkg.version;
export const USER_AGENT = `OpenBlitzer/${VERSION} (+https://github.com/codextde/openblitzer)`;
export const GITHUB_URL = "https://github.com/codextde/openblitzer";
export const ATTRIBUTION = "© OpenStreetMap contributors";

export type Config = {
  port: number;
  dataDir: string;
  salt: string;
  adminToken: string | null;
  overpassUrl: string;
  autoImport: boolean;
  countries: string[] | null;
};

export function resolveSalt(dataDir: string, envSalt: string | undefined): string {
  if (envSalt) return envSalt;
  const file = join(dataDir, "salt");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  writeFileSync(file, salt + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  return salt;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const dataDir = resolve(env.DATA_DIR || "./data");
  mkdirSync(dataDir, { recursive: true });
  const countries = env.OPENBLITZER_COUNTRIES?.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  return {
    port: Number(env.PORT) || 8080,
    dataDir,
    salt: resolveSalt(dataDir, env.OPENBLITZER_SALT),
    adminToken: env.OPENBLITZER_ADMIN_TOKEN || null,
    overpassUrl: env.OVERPASS_URL || "https://overpass-api.de/api/interpreter",
    autoImport: env.OPENBLITZER_IMPORT !== "0",
    countries: countries?.length ? countries : null,
  };
}
