import { Redirect, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';

import type { Report, ReportType } from '@/core/types';
import { useReports } from '@/data/reports';
import { SCREENSHOT_MODE } from '@/lib/demo-mode';
import { useLive } from '@/store/live';
import { useSettings } from '@/store/settings';
import { startDemo } from '@/warn/session';

const SHOT_AT = 470;

// Stuttgart has one of the densest sets of OSM cameras in Germany; the reports are local-only screenshot data.
const MAP = { lat: 48.79, lon: 9.19, zoom: 11.7 };
const SEED: [ReportType, number, number][] = [
  ['mobile_camera', 0.012, -0.031],
  ['traffic_jam', -0.021, 0.026],
  ['roadworks', 0.027, 0.041],
  ['accident', -0.009, -0.052],
  ['hazard', 0.034, -0.008],
  ['mobile_camera', -0.035, 0.012],
];

function seedReports(now: number): Report[] {
  return SEED.map(([type, dLat, dLon], i) => ({
    id: `shot-${i}`,
    type,
    lat: MAP.lat + dLat,
    lon: MAP.lon + dLon,
    heading: null,
    maxspeed: null,
    createdAt: new Date(now - (6 + i * 7) * 60000).toISOString(),
    confirmedAt: new Date(now - (2 + i * 3) * 60000).toISOString(),
    expiresAt: new Date(now + 90 * 60000).toISOString(),
    up: 2 + (i % 3),
    down: 0,
  }));
}

const TARGETS: Record<string, string> = { reports: '/reports', settings: '/settings', hud: '/hud', report: '/report' };

export default function Demo() {
  const { at, lang, theme, to, hold, map } = useLocalSearchParams<{ at?: string; lang?: string; theme?: string; to?: string; hold?: string; map?: string }>();
  const done = useRef(false);
  if (SCREENSHOT_MODE && !done.current) {
    done.current = true;
    useSettings.getState().set({
      onboarded: true,
      legalAccepted: true,
      ...(lang === 'de' || lang === 'en' ? { language: lang } : {}),
      ...(theme === 'light' || theme === 'dark' || theme === 'auto' ? { mapStyle: theme } : {}),
    });
    if (map === '1') {
      useReports.setState({ reports: seedReports(Date.now()), fetchedAt: Date.now() });
      useLive.setState({ focus: { ...MAP, at: Date.now() } });
    }
    if (at !== 'off') startDemo(at == null ? SHOT_AT : Number(at) || 0, hold === '1');
  }
  return <Redirect href={(to && TARGETS[to]) || '/'} />;
}
