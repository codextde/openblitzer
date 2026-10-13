import * as Location from 'expo-location';

import { DemoDriver, demoCameras, demoReports } from '@/core/demo';
import { enabled, type EngineEvent, type EngineOutput, type EngineSettings, isAhead, matchesDirection, WarningEngine } from '@/core/engine';
import { distance } from '@/core/geo';
import { Grid } from '@/core/grid';
import { nearPhrase, sectionEndPhrase, warnPhrase } from '@/core/speech';
import { type Fix, isCamera, type Poi, type Report, reportToPoi } from '@/core/types';
import { formatDistance, limitValue, speedUnit } from '@/core/units';
import { fixedGrid, loadFixed } from '@/data/fixed';
import { activeReports, refreshReports, useReports } from '@/data/reports';
import { currentLang, t } from '@/i18n';
import { showToast, useLive } from '@/store/live';
import { settings, syncStorage, useSettings } from '@/store/settings';

import { announce, notifyBackground, play, vibrate } from './output';

export const WARN_TASK = 'openblitzer-warn';
const RUNNING_KEY = 'warner-running';
const CONFIRM_MS = 12000;

const engineSettings = (): EngineSettings => {
  const s = settings();
  return { categories: s.categories, overspeed: s.overspeed, tolerance: s.tolerance };
};

let reportGrid = new Grid<Poi>();
let demoGrid = new Grid<Poi>();

function rebuildReports() {
  const live = useLive.getState();
  if (live.demo) {
    reportGrid = new Grid(activeReports(live.demoReports).map((r) => reportToPoi(r, live.demoOwn.includes(r.id))));
    return;
  }
  const { reports, own } = useReports.getState();
  reportGrid = new Grid(activeReports(reports).map((r) => reportToPoi(r, own.includes(r.id))));
}

const engine = new WarningEngine(
  {
    near(lat, lon, radius) {
      const fixed = useLive.getState().demo ? demoGrid.near(lat, lon, radius) : fixedGrid().near(lat, lon, radius);
      return [...fixed, ...reportGrid.near(lat, lon, radius)];
    },
  },
  engineSettings(),
);

rebuildReports();
useReports.subscribe((s, prev) => {
  if (s.reports !== prev.reports || s.own !== prev.own) rebuildReports();
});
useLive.subscribe((s, prev) => {
  if (s.demoReports !== prev.demoReports || s.demo !== prev.demo || s.demoOwn !== prev.demoOwn) rebuildReports();
});
useSettings.subscribe(() => {
  engine.settings = engineSettings();
});

const IDLE = { alerts: [], primary: null, overspeed: null, section: null, confirm: null };

function describe(poi: Poi, meters: number) {
  const { units } = settings();
  const lang = currentLang();
  const parts = [formatDistance(meters, units, lang)];
  if (poi.maxspeed != null && isCamera(poi.type)) parts.push(`${limitValue(poi.maxspeed, units)} ${speedUnit(units)}`);
  return parts.join(' · ');
}

function handle(events: EngineEvent[]) {
  const s = settings();
  const lang = currentLang();
  const warns = events.filter((e) => e.type === 'warn').sort((a, b) => a.distance - b.distance);
  const first = warns[0];
  if (first) {
    announce({ chime: s.sound, text: s.voice ? warnPhrase(first.poi, first.distance, s.units, lang) : null, lang });
    if (s.vibration) vibrate();
    notifyBackground(t(`types.${first.poi.type}`), describe(first.poi, first.distance), 'warning');
  }
  const near = events.find((e) => e.type === 'near');
  if (near && !first) {
    announce({ chime: s.sound, text: s.voice ? nearPhrase(near.poi, s.units, lang) : null, lang });
    if (s.vibration) vibrate();
  }
  for (const e of events) {
    if (e.type === 'overspeed') {
      play('beep');
      if (s.vibration) vibrate(true);
    } else if (e.type === 'confirm') {
      useLive.setState({ confirm: { poi: e.poi, until: Date.now() + CONFIRM_MS } });
      setTimeout(() => {
        if (useLive.getState().confirm?.poi.id === e.poi.id) useLive.setState({ confirm: null });
      }, CONFIRM_MS);
      notifyBackground(t(`types.${e.poi.type}`), t('notify.confirmBody'), 'confirm');
    } else if (e.type === 'sectionEnd' && s.voice && !first) {
      announce({ chime: false, text: sectionEndPhrase(e.average, s.units, lang), lang });
    }
  }
}

function publish(fix: Fix, out: EngineOutput) {
  useLive.setState({
    fix,
    speedKmh: out.speedKmh,
    heading: out.heading ?? useLive.getState().heading,
    alerts: out.alerts,
    primary: out.primary,
    overspeed: out.overspeed,
    section: out.section,
  });
}

export function showFix(fix: Fix) {
  const live = useLive.getState();
  if (live.demo || live.running) return;
  const speedKmh = fix.speed != null && fix.speed >= 0 ? fix.speed * 3.6 : null;
  const heading = speedKmh != null && speedKmh >= 5 && fix.heading != null && fix.heading >= 0 ? fix.heading : live.heading;
  useLive.setState({ fix, speedKmh, heading });
}

export async function ingest(fixes: Fix[], origin: 'gps' | 'demo') {
  const live = useLive.getState();
  if (live.demo && origin === 'gps') return;
  if (origin === 'gps' && !live.running) {
    if (syncStorage.getItem(RUNNING_KEY) !== '1') return;
    useLive.setState({ running: true });
  }
  await loadFixed();
  for (const fix of [...fixes].sort((a, b) => a.time - b.time)) {
    if (fix.accuracy != null && fix.accuracy > 100) continue;
    const out = engine.update(fix);
    publish(fix, out);
    if (out.events.length) handle(out.events);
  }
  const last = useLive.getState().fix;
  if (origin === 'gps' && last) refreshReports(last.lat, last.lon).catch(() => undefined);
}

export function toFix(l: Location.LocationObject): Fix {
  return {
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
    heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
    accuracy: l.coords.accuracy ?? null,
    time: l.timestamp,
  };
}

export async function ensureLocationPermission(ask = true) {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) {
      useLive.setState({ locationDenied: false });
      return true;
    }
    if (!ask || !current.canAskAgain) {
      useLive.setState({ locationDenied: !current.canAskAgain });
      return false;
    }
    const next = await Location.requestForegroundPermissionsAsync();
    useLive.setState({ locationDenied: !next.granted });
    return next.granted;
  } catch {
    return false;
  }
}

async function startUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(WARN_TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(WARN_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 10,
    timeInterval: 1000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: t('notify.serviceTitle'),
      notificationBody: t('notify.serviceBody'),
      notificationColor: '#FFB800',
      killServiceOnDestroy: false,
    },
  });
}

async function stopUpdates() {
  if (await Location.hasStartedLocationUpdatesAsync(WARN_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(WARN_TASK).catch(() => undefined);
  }
}

export async function startWarner(): Promise<boolean> {
  if (useLive.getState().demo) stopDemo(false);
  if (!(await ensureLocationPermission())) return false;
  engine.reset();
  useLive.setState({ running: true, ...IDLE });
  syncStorage.setItem(RUNNING_KEY, '1');
  try {
    await startUpdates();
  } catch {
    useLive.setState({ running: false });
    syncStorage.removeItem(RUNNING_KEY);
    return false;
  }
  loadFixed().catch(() => undefined);
  Location.getLastKnownPositionAsync()
    .then((l) => {
      if (l) refreshReports(l.coords.latitude, l.coords.longitude).catch(() => undefined);
    })
    .catch(() => undefined);
  return true;
}

export async function stopWarner() {
  syncStorage.removeItem(RUNNING_KEY);
  useLive.setState({ running: false, ...IDLE });
  engine.reset();
  await stopUpdates();
}

export async function resumeWarner() {
  const started = await Location.hasStartedLocationUpdatesAsync(WARN_TASK).catch(() => false);
  const wanted = syncStorage.getItem(RUNNING_KEY) === '1';
  if (started && !useLive.getState().demo) useLive.setState({ running: true });
  else if (wanted && !started && !useLive.getState().demo) {
    if (await ensureLocationPermission(false)) await startUpdates().catch(() => syncStorage.removeItem(RUNNING_KEY));
    else syncStorage.removeItem(RUNNING_KEY);
    useLive.setState({ running: syncStorage.getItem(RUNNING_KEY) === '1' });
  }
}

let demoTimer: ReturnType<typeof setInterval> | null = null;

export async function startDemo(at = 0, hold = false) {
  if (useLive.getState().running && !useLive.getState().demo) await stopWarner();
  if (demoTimer) clearInterval(demoTimer);
  demoGrid = new Grid(demoCameras());
  engine.reset();
  const driver = new DemoDriver(at);
  useLive.setState({ demo: true, running: true, ...IDLE, demoReports: demoReports(Date.now()), demoOwn: [] });
  const tick = () => {
    const { fix, done } = driver.step(1000, Date.now(), hold);
    ingest([fix], 'demo');
    if (done) stopDemo(true);
  };
  tick();
  demoTimer = setInterval(tick, 1000);
}

export function stopDemo(ended: boolean) {
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = null;
  engine.reset();
  useLive.setState({ demo: false, running: false, ...IDLE, fix: null, speedKmh: null, heading: null, demoReports: [], demoOwn: [] });
  if (ended) showToast(t('drive.demoEnded'), 'good');
}

export function addDemoReport(report: Report) {
  useLive.setState((s) => ({ demoReports: [report, ...s.demoReports], demoOwn: [...s.demoOwn, report.id] }));
}

export function voteDemo(id: string, value: 'up' | 'down') {
  useLive.setState((s) => ({
    demoReports: value === 'down' ? s.demoReports.filter((r) => r.id !== id) : s.demoReports.map((r) => (r.id === id ? { ...r, up: r.up + 1, confirmedAt: new Date().toISOString() } : r)),
  }));
}

export function nextAhead(fix: Fix | null, heading: number | null, radius = 5000): { poi: Poi; distance: number } | null {
  if (!fix || heading == null) return null;
  const s = engine.settings;
  let best: { poi: Poi; distance: number } | null = null;
  for (const poi of engine.source.near(fix.lat, fix.lon, radius)) {
    if (!enabled(s, poi) || !isAhead(fix, heading, poi) || !matchesDirection(heading, poi.direction)) continue;
    const d = distance(fix, poi);
    if (d > 30 && (!best || d < best.distance)) best = { poi, distance: d };
  }
  return best;
}
