import { describe, expect, test } from 'bun:test';

import { decodeDataset, sectionKey } from './dataset';
import { angleDiff, bearing, destination, distance } from './geo';
import { Grid } from './grid';
import { nearPhrase, sectionEndPhrase, spokenDistance, warnPhrase } from './speech';
import { formatDistance, limitValue, roundDistance, speedValue } from './units';

describe('geo', () => {
  test('haversine Berlin to Munich', () => {
    expect(Math.round(distance({ lat: 52.52, lon: 13.405 }, { lat: 48.1351, lon: 11.582 }) / 1000)).toBe(504);
  });

  test('bearing and destination round-trip', () => {
    const a = { lat: 50, lon: 8 };
    const b = destination(a, 45, 1000);
    expect(Math.round(distance(a, b))).toBe(1000);
    expect(Math.round(bearing(a, b))).toBe(45);
  });

  test('angle difference wraps', () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
    expect(angleDiff(-90, 270)).toBe(0);
  });
});

describe('grid', () => {
  test('near and bounds queries', () => {
    const base = { lat: 52.5, lon: 13.4 };
    const items = Array.from({ length: 2000 }, (_, i) => ({ id: i, ...destination(base, (i * 37) % 360, (i % 100) * 300) }));
    const grid = new Grid(items);
    expect(grid.size).toBe(2000);
    const near = grid.near(base.lat, base.lon, 1000);
    const brute = items.filter((p) => distance(base, p) <= 1000);
    expect(near.map((p) => p.id).sort()).toEqual(brute.map((p) => p.id).sort());
    expect(grid.inBounds(52.4, 13.3, 52.6, 13.5, 10)).toHaveLength(10);
  });

  test('handles negative coordinates and cell borders', () => {
    const grid = new Grid([
      { lat: -33.85, lon: 151.2 },
      { lat: 40.7, lon: -74.0 },
      { lat: 0.05, lon: -0.05 },
    ]);
    expect(grid.near(40.7, -74.0, 50)).toHaveLength(1);
    expect(grid.near(0.0499, -0.0499, 50)).toHaveLength(1);
  });
});

describe('dataset', () => {
  test('decodes compact rows and drops invalid ones', () => {
    const ds = decodeDataset({
      version: '2026-10-12',
      generatedAt: '2026-10-12T00:00:00Z',
      attribution: '© OpenStreetMap contributors',
      cameras: [
        ['n1', 52.5, 13.4, 'speed', 50, 90],
        ['r2:s', 52.6, 13.5, 'section_start', 100, 370],
        ['r2:e', 52.7, 13.5, 'section_end', 100, null],
        ['n3', 'x', 13.4, 'speed', 50, null],
        ['n4', 52.5, 13.4, 'unknown', 50, null],
        ['n5', 95, 13.4, 'speed', null, null],
      ],
    });
    expect(ds.version).toBe('2026-10-12');
    expect(ds.cameras.map((c) => c.id)).toEqual(['n1', 'r2:s', 'r2:e']);
    expect(ds.cameras[0]).toMatchObject({ type: 'speed', maxspeed: 50, direction: 90, report: false });
    expect(ds.cameras[1].direction).toBe(10);
    expect(sectionKey('r2:s')).toBe(sectionKey('r2:e'));
  });

  test('rejects garbage', () => {
    expect(() => decodeDataset(null)).toThrow();
    expect(() => decodeDataset({ cameras: 'nope' })).toThrow();
  });
});

describe('units', () => {
  test('speed and limits', () => {
    expect(speedValue(100, 'kmh')).toBe(100);
    expect(speedValue(100, 'mph')).toBe(62);
    expect(limitValue(50, 'mph')).toBe(30);
    expect(limitValue(80, 'mph')).toBe(50);
    expect(limitValue(130, 'kmh')).toBe(130);
  });

  test('distance rounding', () => {
    expect(roundDistance(487)).toBe(500);
    expect(roundDistance(312)).toBe(300);
    expect(roundDistance(163)).toBe(150);
    expect(roundDistance(140)).toBe(150);
    expect(roundDistance(20)).toBe(50);
  });

  test('distance labels', () => {
    expect(formatDistance(437, 'kmh', 'de')).toBe('440 m');
    expect(formatDistance(1234, 'kmh', 'de')).toBe('1,2 km');
    expect(formatDistance(1234, 'kmh', 'en')).toBe('1.2 km');
    expect(formatDistance(23456, 'kmh', 'en')).toBe('23 km');
    expect(formatDistance(100, 'mph', 'en')).toBe('330 ft');
    expect(formatDistance(1609.344, 'mph', 'en')).toBe('1.0 mi');
  });
});

describe('phrasing', () => {
  test('German', () => {
    expect(warnPhrase({ type: 'mobile_camera', maxspeed: null }, 487, 'kmh', 'de')).toBe('Mobiler Blitzer in 500 Metern');
    expect(warnPhrase({ type: 'speed', maxspeed: 80 }, 296, 'kmh', 'de')).toBe('Blitzer, Tempo 80, in 300 Metern');
    expect(warnPhrase({ type: 'traffic_jam', maxspeed: null }, 790, 'kmh', 'de')).toBe('Stauende in 800 Metern');
    expect(warnPhrase({ type: 'redlight', maxspeed: 50 }, 160, 'kmh', 'de')).toBe('Rotlichtblitzer in 150 Metern');
    expect(warnPhrase({ type: 'section_start', maxspeed: 100 }, 1190, 'kmh', 'de')).toBe('Abschnittskontrolle, Tempo 100, in 1,2 Kilometern');
    expect(nearPhrase({ type: 'speed', maxspeed: 50 }, 'kmh', 'de')).toBe('Achtung, Tempo 50');
    expect(sectionEndPhrase(97.4, 'kmh', 'de')).toBe('Abschnittskontrolle beendet, Durchschnitt 97');
  });

  test('English', () => {
    expect(warnPhrase({ type: 'mobile_camera', maxspeed: null }, 512, 'kmh', 'en')).toBe('Mobile speed camera in 500 meters');
    expect(warnPhrase({ type: 'speed', maxspeed: 80 }, 300, 'kmh', 'en')).toBe('Speed camera, limit 80, in 300 meters');
    expect(warnPhrase({ type: 'accident', maxspeed: null }, 300, 'kmh', 'en')).toBe('Accident in 300 meters');
    expect(nearPhrase({ type: 'redlight', maxspeed: null }, 'kmh', 'en')).toBe('Attention, red light camera');
  });

  test('imperial', () => {
    expect(warnPhrase({ type: 'speed', maxspeed: 48 }, 300, 'mph', 'en')).toBe('Speed camera, limit 30, in 1000 feet');
    expect(spokenDistance(800, 'mph', 'en')).toBe('in 0.5 miles');
    expect(spokenDistance(1609, 'mph', 'en')).toBe('in 1 mile');
    expect(spokenDistance(150, 'mph', 'en')).toBe('in 500 feet');
  });
});
