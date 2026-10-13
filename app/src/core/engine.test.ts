import { describe, expect, test } from 'bun:test';

import { DEMO_LENGTH, DEMO_ROUTE, DemoDriver, demoCameras, demoReports } from './demo';
import { type EngineEvent, type EngineSettings, lookAhead, nearDistance, WarningEngine } from './engine';
import { destination, type LatLon } from './geo';
import { Grid } from './grid';
import { type Fix, type Poi, reportToPoi } from './types';

const START: LatLon = { lat: 52.5, lon: 13.4 };
const NORTH = 0;

const settings = (patch: Partial<EngineSettings> = {}): EngineSettings => ({
  categories: { fixed: true, redlight: true, section: true, mobile: true, traffic: true },
  overspeed: true,
  tolerance: 3,
  ...patch,
});

function cam(id: string, metersNorth: number, extra: Partial<Poi> = {}): Poi {
  const p = destination(START, NORTH, metersNorth);
  return { id, lat: p.lat, lon: p.lon, type: 'speed', maxspeed: 50, direction: null, report: false, ...extra };
}

function drive(engine: WarningEngine, from: number, to: number, kmh: number, heading = NORTH, stepM = 10) {
  const events: EngineEvent[] = [];
  const outputs = [];
  let t = 1_000_000;
  const sign = to >= from ? 1 : -1;
  for (let m = from; sign > 0 ? m <= to : m >= to; m += stepM * sign) {
    const p = destination(START, NORTH, m);
    const fix: Fix = { lat: p.lat, lon: p.lon, speed: kmh / 3.6, heading, accuracy: 5, time: (t += (stepM / (kmh / 3.6)) * 1000) };
    const out = engine.update(fix);
    events.push(...out.events);
    outputs.push({ m, out });
  }
  return { events, outputs };
}

const types = (events: EngineEvent[], id?: string) =>
  events.filter((e) => !id || ('poi' in e && e.poi?.id === id)).map((e) => e.type);

describe('look-ahead', () => {
  test('distance by speed', () => {
    expect(lookAhead(30)).toBe(300);
    expect(lookAhead(59)).toBe(300);
    expect(lookAhead(60)).toBe(500);
    expect(lookAhead(100)).toBe(800);
    expect(lookAhead(130)).toBe(1200);
    expect(nearDistance(50)).toBe(150);
    expect(nearDistance(120)).toBe(300);
  });
});

describe('ahead / behind', () => {
  test('warns for a camera ahead', () => {
    const engine = new WarningEngine(new Grid([cam('a', 1000)]), settings());
    const { events, outputs } = drive(engine, 0, 1200, 50);
    expect(types(events, 'a')).toEqual(['warn', 'near', 'passed']);
    const warnAt = outputs.find((o) => o.out.events.some((e) => e.type === 'warn'))!.m;
    expect(1000 - warnAt).toBeLessThanOrEqual(300);
    expect(1000 - warnAt).toBeGreaterThan(280);
  });

  test('ignores a camera behind', () => {
    const engine = new WarningEngine(new Grid([cam('b', -200)]), settings());
    const { events } = drive(engine, 0, 600, 50);
    expect(events).toHaveLength(0);
  });

  test('ignores a camera outside the +-35 deg cone', () => {
    const side = destination(START, 60, 250);
    const poi: Poi = { id: 's', lat: side.lat, lon: side.lon, type: 'speed', maxspeed: 50, direction: null, report: false };
    const engine = new WarningEngine(new Grid([poi]), settings());
    const { events } = drive(engine, 0, 50, 50);
    expect(events).toHaveLength(0);
  });

  test('no warning without heading at walking speed', () => {
    const engine = new WarningEngine(new Grid([cam('a', 150)]), settings());
    const { events } = drive(engine, 0, 60, 5, NORTH, 2);
    expect(events).toHaveLength(0);
  });
});

describe('direction filter', () => {
  test('camera for our direction warns', () => {
    const engine = new WarningEngine(new Grid([cam('d', 600, { direction: 20 })]), settings());
    expect(types(drive(engine, 0, 700, 50).events, 'd')).toContain('warn');
  });

  test('camera for the opposite direction stays silent', () => {
    const engine = new WarningEngine(new Grid([cam('o', 600, { direction: 180 })]), settings());
    expect(drive(engine, 0, 700, 50).events).toHaveLength(0);
  });

  test('camera at 60 deg off is outside the +-50 deg direction cone', () => {
    const engine = new WarningEngine(new Grid([cam('o', 600, { direction: 60 })]), settings());
    expect(drive(engine, 0, 700, 50).events).toHaveLength(0);
  });
});

describe('two-stage alerts and passing', () => {
  test('warned at look-ahead, near at 150 m in the city', () => {
    const engine = new WarningEngine(new Grid([cam('a', 800)]), settings());
    const { outputs } = drive(engine, 0, 900, 50);
    const at = (type: string) => outputs.find((o) => o.out.events.some((e) => e.type === type && 'poi' in e && e.poi?.id === 'a'))!.m;
    expect(800 - at('warn')).toBeLessThanOrEqual(300);
    expect(800 - at('near')).toBeLessThanOrEqual(150);
    expect(800 - at('near')).toBeGreaterThan(130);
  });

  test('highway uses 800 m and 300 m', () => {
    const engine = new WarningEngine(new Grid([cam('h', 2000, { maxspeed: 120 })]), settings());
    const { outputs } = drive(engine, 0, 2100, 110, NORTH, 20);
    const at = (type: string) => outputs.find((o) => o.out.events.some((e) => e.type === type))!.m;
    expect(2000 - at('warn')).toBeLessThanOrEqual(800);
    expect(2000 - at('warn')).toBeGreaterThan(770);
    expect(2000 - at('near')).toBeLessThanOrEqual(300);
  });

  test('passed after 60 m behind, alert list empties', () => {
    const engine = new WarningEngine(new Grid([cam('a', 500)]), settings());
    const { outputs } = drive(engine, 0, 600, 50);
    const passedAt = outputs.find((o) => o.out.events.some((e) => e.type === 'passed'))!.m;
    expect(passedAt - 500).toBeGreaterThan(0);
    expect(passedAt - 500).toBeLessThanOrEqual(70);
    expect(outputs.at(-1)!.out.primary).toBeNull();
  });

  test('passed when distance grows for 3 fixes (turned away)', () => {
    const engine = new WarningEngine(new Grid([cam('a', 400)]), settings());
    drive(engine, 0, 200, 50);
    const { events } = drive(engine, 200, 150, 50, 180);
    expect(types(events, 'a')).toEqual(['passed']);
  });

  test('a passed camera does not warn again right away', () => {
    const engine = new WarningEngine(new Grid([cam('a', 300)]), settings());
    drive(engine, 0, 400, 50);
    expect(types(drive(engine, 0, 400, 50).events, 'a')).toEqual([]);
  });

  test('primary alert is the closest one', () => {
    const engine = new WarningEngine(new Grid([cam('far', 280), cam('close', 200)]), settings());
    const { outputs } = drive(engine, 0, 30, 50);
    expect(outputs.at(-1)!.out.primary?.poi.id).toBe('close');
    expect(outputs.at(-1)!.out.alerts).toHaveLength(2);
  });

  test('categories can be switched off', () => {
    const red = cam('r', 300, { type: 'redlight', maxspeed: null });
    const engine = new WarningEngine(new Grid([red]), settings({ categories: { fixed: true, redlight: false, section: true, mobile: true, traffic: true } }));
    expect(drive(engine, 0, 400, 50).events).toHaveLength(0);
  });

  test('traffic reports have no near stage', () => {
    const jam = cam('j', 300, { type: 'traffic_jam', maxspeed: null, report: true });
    const engine = new WarningEngine(new Grid([jam]), settings());
    expect(types(drive(engine, 0, 400, 50).events, 'j')).toEqual(['warn', 'passed', 'confirm']);
  });
});

describe('confirm prompt', () => {
  test('asks for others reports, not for own', () => {
    const other = cam('x', 300, { type: 'mobile_camera', report: true });
    const own = cam('y', 600, { type: 'mobile_camera', report: true, own: true });
    const engine = new WarningEngine(new Grid([other, own]), settings());
    const { events } = drive(engine, 0, 750, 50);
    expect(events.filter((e) => e.type === 'confirm').map((e) => ('poi' in e ? e.poi?.id : null))).toEqual(['x']);
  });

  test('fixed cameras never ask', () => {
    const engine = new WarningEngine(new Grid([cam('f', 300)]), settings());
    expect(types(drive(engine, 0, 400, 50).events)).not.toContain('confirm');
  });
});

describe('overspeed', () => {
  test('beeps above limit + tolerance while warned, repeating', () => {
    const engine = new WarningEngine(new Grid([cam('a', 400, { maxspeed: 50 })]), settings({ tolerance: 3 }));
    const { events, outputs } = drive(engine, 0, 460, 60, NORTH, 5);
    const beeps = events.filter((e) => e.type === 'overspeed');
    expect(beeps.length).toBeGreaterThan(1);
    expect(outputs.find((o) => o.m === 300)!.out.overspeed?.limit).toBe(50);
  });

  test('silent within tolerance', () => {
    const engine = new WarningEngine(new Grid([cam('a', 400, { maxspeed: 50 })]), settings({ tolerance: 3 }));
    expect(drive(engine, 0, 460, 53).events.filter((e) => e.type === 'overspeed')).toHaveLength(0);
  });

  test('tolerance 0 and switch', () => {
    const e1 = new WarningEngine(new Grid([cam('a', 400, { maxspeed: 50 })]), settings({ tolerance: 0 }));
    expect(drive(e1, 0, 460, 52).events.some((e) => e.type === 'overspeed')).toBe(true);
    const e2 = new WarningEngine(new Grid([cam('a', 400, { maxspeed: 50 })]), settings({ overspeed: false }));
    expect(drive(e2, 0, 460, 80).events.some((e) => e.type === 'overspeed')).toBe(false);
  });

  test('no overspeed before the camera is warned', () => {
    const engine = new WarningEngine(new Grid([cam('a', 2000, { maxspeed: 50 })]), settings());
    expect(drive(engine, 0, 500, 80).events).toHaveLength(0);
  });
});

describe('section control', () => {
  test('start, average, end', () => {
    const start = cam('r9:s', 1000, { type: 'section_start', maxspeed: 100 });
    const end = cam('r9:e', 4000, { type: 'section_end', maxspeed: 100 });
    const engine = new WarningEngine(new Grid([start, end]), settings());
    const { events, outputs } = drive(engine, 0, 4200, 90, NORTH, 20);
    expect(types(events)).toEqual(['warn', 'near', 'passed', 'sectionStart', 'warn', 'near', 'passed', 'sectionEnd']);
    const mid = outputs.find((o) => o.m === 3000)!.out;
    expect(mid.section?.key).toBe('r9');
    expect(Math.round(mid.section!.average!)).toBe(90);
    expect(outputs.at(-1)!.out.section).toBeNull();
    const ended = events.find((e) => e.type === 'sectionEnd');
    expect(ended && 'average' in ended ? Math.round(ended.average!) : 0).toBe(90);
  });

  test('overspeed inside a section uses the section limit', () => {
    const start = cam('r9:s', 200, { type: 'section_start', maxspeed: 80 });
    const engine = new WarningEngine(new Grid([start]), settings());
    const { outputs } = drive(engine, 0, 2000, 100, NORTH, 20);
    expect(outputs.at(-1)!.out.overspeed?.limit).toBe(80);
  });
});

describe('heading from fixes', () => {
  test('derives heading from consecutive fixes when GPS course is missing', () => {
    const engine = new WarningEngine(new Grid([cam('a', 250)]), settings());
    let t = 0;
    const events: EngineEvent[] = [];
    for (let m = 0; m <= 300; m += 10) {
      const p = destination(START, NORTH, m);
      events.push(...engine.update({ lat: p.lat, lon: p.lon, speed: null, heading: null, accuracy: 5, time: (t += 720) }).events);
    }
    expect(types(events, 'a')).toContain('warn');
  });
});

describe('demo drive', () => {
  test('route is a realistic stretch with alerts', () => {
    expect(DEMO_ROUTE.length).toBeGreaterThan(100);
    expect(DEMO_LENGTH).toBeGreaterThan(5000);
    const now = Date.now();
    const pois = [...demoCameras(), ...demoReports(now).map((r) => reportToPoi(r))];
    const engine = new WarningEngine(new Grid(pois), settings());
    const driver = new DemoDriver();
    const events: EngineEvent[] = [];
    let t = now;
    for (let i = 0; i < 2000; i++) {
      const { fix, done } = driver.step(1000, (t += 1000));
      events.push(...engine.update(fix).events);
      if (done) break;
    }
    const warned = events.filter((e) => e.type === 'warn').map((e) => ('poi' in e ? e.poi?.id : ''));
    expect(warned).toContain('demo-speed-1');
    expect(warned).toContain('demo-mobile');
    expect(warned).toContain('demo-redlight');
    expect(warned).toContain('demo-jam');
    expect(warned).not.toContain('demo-speed-opposite');
    expect(events.some((e) => e.type === 'confirm')).toBe(true);
    expect(events.some((e) => e.type === 'overspeed')).toBe(true);
  });
});
