import { sectionKey } from './dataset';
import { angleDiff, bearing, distance } from './geo';
import { categoriesOf, type Category, type Fix, isCamera, type Poi } from './types';

export type AlertState = 'approaching' | 'warned' | 'near' | 'passed';

export type Alert = {
  poi: Poi;
  state: AlertState;
  distance: number;
};

export type EngineEvent =
  | { type: 'warn'; poi: Poi; distance: number }
  | { type: 'near'; poi: Poi; distance: number }
  | { type: 'passed'; poi: Poi }
  | { type: 'confirm'; poi: Poi }
  | { type: 'overspeed'; limit: number; speed: number }
  | { type: 'sectionStart'; poi: Poi }
  | { type: 'sectionEnd'; poi: Poi | null; average: number | null };

export type Section = { key: string; maxspeed: number | null; startedAt: number; meters: number; average: number | null };

export type EngineOutput = {
  speedKmh: number | null;
  heading: number | null;
  alerts: Alert[];
  primary: Alert | null;
  overspeed: { limit: number; speed: number } | null;
  section: Section | null;
  events: EngineEvent[];
};

export type EngineSettings = {
  categories: Record<Category, boolean>;
  overspeed: boolean;
  tolerance: number;
};

export type PoiSource = { near(lat: number, lon: number, radius: number): Poi[] };

export const AHEAD_CONE = 35;
export const DIRECTION_CONE = 50;
export const MIN_HEADING_SPEED = 10;
export const PASSED_BEHIND = 60;
export const GROW_FIXES = 3;
export const CONFIRM_MAX_DISTANCE = 150;
export const OVERSPEED_REPEAT_MS = 3000;
const SECTION_TIMEOUT_MS = 45 * 60000;
const SECTION_MAX_METERS = 40000;
const REARM_MS = 10 * 60000;
const REARM_METERS = 2000;

export function lookAhead(speedKmh: number) {
  if (speedKmh < 60) return 300;
  if (speedKmh < 90) return 500;
  if (speedKmh < 130) return 800;
  return 1200;
}

export function nearDistance(speedKmh: number) {
  return speedKmh >= 90 ? 300 : 150;
}

export function isAhead(car: { lat: number; lon: number }, heading: number, poi: { lat: number; lon: number }) {
  return angleDiff(bearing(car, poi), heading) <= AHEAD_CONE;
}

export function matchesDirection(heading: number, direction: number | null) {
  return direction == null || angleDiff(heading, direction) <= DIRECTION_CONE;
}

export function enabled(settings: EngineSettings, poi: Poi) {
  return categoriesOf(poi.type).some((c) => settings.categories[c]);
}

type Track = { poi: Poi; state: AlertState; distance: number; min: number; grows: number };

export class WarningEngine {
  private tracks = new Map<string, Track>();
  private done = new Map<string, { at: number; lat: number; lon: number }>();
  private prev: Fix | null = null;
  private heading: number | null = null;
  private section: Section | null = null;
  private lastBeep = 0;

  constructor(
    public source: PoiSource,
    public settings: EngineSettings,
  ) {}

  setSource(source: PoiSource) {
    this.source = source;
  }

  reset() {
    this.tracks.clear();
    this.done.clear();
    this.prev = null;
    this.heading = null;
    this.section = null;
    this.lastBeep = 0;
  }

  private speedOf(fix: Fix): number | null {
    if (fix.speed != null && fix.speed >= 0) return fix.speed * 3.6;
    const prev = this.prev;
    if (!prev || fix.time <= prev.time) return null;
    return (distance(prev, fix) / ((fix.time - prev.time) / 1000)) * 3.6;
  }

  private headingOf(fix: Fix, speedKmh: number | null): number | null {
    if (speedKmh == null || speedKmh < MIN_HEADING_SPEED) return null;
    if (fix.heading != null && fix.heading >= 0) return fix.heading;
    const prev = this.prev;
    if (prev && distance(prev, fix) >= 5) return bearing(prev, fix);
    return this.heading;
  }

  update(fix: Fix): EngineOutput {
    const events: EngineEvent[] = [];
    const speedKmh = this.speedOf(fix);
    const heading = this.headingOf(fix, speedKmh);
    if (heading != null) this.heading = heading;
    const speed = speedKmh ?? 0;
    const ahead = lookAhead(speed);
    const near = nearDistance(speed);

    if (this.section && this.prev) {
      this.section.meters += distance(this.prev, fix);
      const seconds = (fix.time - this.section.startedAt) / 1000;
      this.section.average = seconds > 5 ? (this.section.meters / seconds) * 3.6 : null;
      if (fix.time - this.section.startedAt > SECTION_TIMEOUT_MS || this.section.meters > SECTION_MAX_METERS) {
        events.push({ type: 'sectionEnd', poi: null, average: this.section.average });
        this.section = null;
      }
    }

    for (const [id, d] of this.done) {
      if (fix.time - d.at > REARM_MS || distance(d, fix) > REARM_METERS) this.done.delete(id);
    }

    for (const track of this.tracks.values()) {
      const d = distance(fix, track.poi);
      if (d > track.distance + 1) track.grows++;
      else if (d < track.distance) track.grows = 0;
      track.distance = d;
      track.min = Math.min(track.min, d);
    }

    if (heading != null) {
      for (const poi of this.source.near(fix.lat, fix.lon, ahead * 1.5)) {
        if (this.tracks.has(poi.id) || this.done.has(poi.id)) continue;
        if (!enabled(this.settings, poi)) continue;
        if (!isAhead(fix, heading, poi) || !matchesDirection(heading, poi.direction)) continue;
        const d = distance(fix, poi);
        this.tracks.set(poi.id, { poi, state: 'approaching', distance: d, min: d, grows: 0 });
      }
    }

    for (const track of [...this.tracks.values()]) {
      const { poi } = track;
      const behind = heading != null && angleDiff(bearing(fix, poi), heading) > 90;
      let fresh = false;
      if (track.state === 'approaching') {
        const lost = !enabled(this.settings, poi) || track.distance > ahead * 1.6 || (heading != null && (!isAhead(fix, heading, poi) || !matchesDirection(heading, poi.direction)));
        if (lost) {
          this.tracks.delete(poi.id);
          continue;
        }
        if (track.distance <= ahead) {
          track.state = 'warned';
          fresh = true;
          events.push({ type: 'warn', poi, distance: track.distance });
        }
      }
      if (track.state === 'warned' && track.distance <= near) {
        track.state = 'near';
        if (isCamera(poi.type) && !fresh) events.push({ type: 'near', poi, distance: track.distance });
      }
      if (track.state === 'warned' || track.state === 'near') {
        const passed = track.grows >= GROW_FIXES || (behind && track.distance > PASSED_BEHIND) || track.distance > ahead * 2.5;
        if (passed) {
          track.state = 'passed';
          this.tracks.delete(poi.id);
          this.done.set(poi.id, { at: fix.time, lat: poi.lat, lon: poi.lon });
          events.push({ type: 'passed', poi });
          if (poi.report && !poi.own && track.min <= CONFIRM_MAX_DISTANCE) events.push({ type: 'confirm', poi });
          if (poi.type === 'section_start') {
            this.section = { key: sectionKey(poi.id), maxspeed: poi.maxspeed, startedAt: fix.time, meters: 0, average: null };
            events.push({ type: 'sectionStart', poi });
          } else if (poi.type === 'section_end' && this.section) {
            events.push({ type: 'sectionEnd', poi, average: this.section.average });
            this.section = null;
          }
        }
      }
    }

    const alerts = [...this.tracks.values()]
      .filter((t) => t.state === 'warned' || t.state === 'near')
      .map((t) => ({ poi: t.poi, state: t.state, distance: t.distance }))
      .sort((a, b) => a.distance - b.distance);

    let overspeed: EngineOutput['overspeed'] = null;
    if (this.settings.overspeed && speedKmh != null) {
      const limits = alerts.filter((a) => a.poi.maxspeed != null && isCamera(a.poi.type)).map((a) => a.poi.maxspeed as number);
      if (this.section?.maxspeed != null) limits.push(this.section.maxspeed);
      if (limits.length) {
        const limit = Math.min(...limits);
        if (speedKmh > limit + this.settings.tolerance) {
          overspeed = { limit, speed: speedKmh };
          if (fix.time - this.lastBeep >= OVERSPEED_REPEAT_MS) {
            this.lastBeep = fix.time;
            events.push({ type: 'overspeed', limit, speed: speedKmh });
          }
        }
      }
    }

    this.prev = fix;
    return {
      speedKmh,
      heading: this.heading,
      alerts,
      primary: alerts[0] ?? null,
      overspeed,
      section: this.section ? { ...this.section } : null,
      events,
    };
  }
}
