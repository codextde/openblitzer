import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DriveCard } from '@/components/drive-card';
import { DriveMap } from '@/components/drive-map';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { ConfirmPrompt, ToastView } from '@/components/overlays';
import { PressableScale } from '@/components/pressable-scale';
import { tap } from '@/components/ui';
import { WarningBanner } from '@/components/warning-banner';
import { useFixed } from '@/data/fixed';
import { useT } from '@/i18n';
import { showToast, useLive } from '@/store/live';
import { useSettings } from '@/store/settings';
import { brand, fonts, radius, space, type, useColors } from '@/theme';
import { answerConfirm } from '@/warn/report';
import { ensureLocationPermission, nextAhead, showFix, startWarner, stopDemo, stopWarner, toFix } from '@/warn/session';

function FloatButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.float, { backgroundColor: c.glass, borderColor: c.border }]}>
      <Icon name={icon} size={22} color={c.text} />
    </PressableScale>
  );
}

function StatusPill() {
  const c = useColors();
  const { t, lang } = useT();
  const running = useLive((s) => s.running);
  const demo = useLive((s) => s.demo);
  const denied = useLive((s) => s.locationDenied);
  const hasFix = useLive((s) => !!s.fix);
  const fixed = useFixed();

  if (denied && !demo) {
    return (
      <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" style={[styles.pill, { backgroundColor: brand.red }]}>
        <Icon name="location" size={14} color="#FFFFFF" />
        <Text style={[styles.pillText, { color: '#FFFFFF' }]} numberOfLines={1}>
          {t('drive.locationDenied')} · {t('drive.openSettings')}
        </Text>
      </Pressable>
    );
  }

  let text: string;
  let loading = false;
  if (demo) text = t('drive.active');
  else if (fixed.status === 'loading' || (fixed.status !== 'ready' && fixed.updating)) {
    text = t('drive.loadingData');
    loading = true;
  } else if (fixed.status === 'empty') text = t('drive.noData');
  else if (running && !hasFix) text = t('drive.noLocation');
  else text = `${running ? t('drive.active') : t('drive.inactive')} · ${t('drive.cameras', { n: fixed.count.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') })}`;

  return (
    <View style={[styles.pill, { backgroundColor: c.glass, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth }]}>
      {demo ? (
        <View style={[styles.demo, { backgroundColor: brand.amber }]}>
          <Text style={[styles.demoText, { color: brand.ink }]}>{t('drive.demo')}</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator size="small" color={c.textSecondary} />
      ) : (
        <View style={[styles.statusDot, { backgroundColor: running ? brand.green : c.textTertiary }]} />
      )}
      <Text style={[styles.pillText, { color: c.text }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export default function DriveScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const c = useColors();
  const { t } = useT();
  const [follow, setFollow] = useState(true);
  const keepScreenOn = useSettings((s) => s.keepScreenOn);
  const running = useLive((s) => s.running);
  const demo = useLive((s) => s.demo);
  const fix = useLive((s) => s.fix);
  const heading = useLive((s) => s.heading);
  const speedKmh = useLive((s) => s.speedKmh);
  const primary = useLive((s) => s.primary);
  const overspeed = useLive((s) => s.overspeed);
  const section = useLive((s) => s.section);
  const confirm = useLive((s) => s.confirm);
  const toast = useLive((s) => s.toast);
  const focus = useLive((s) => s.focus);

  useFocusEffect(
    useCallback(() => {
      if (keepScreenOn) activateKeepAwakeAsync('drive').catch(() => undefined);
      return () => {
        deactivateKeepAwake('drive').catch(() => undefined);
      };
    }, [keepScreenOn]),
  );

  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      (async () => {
        if (!(await ensureLocationPermission(false))) return;
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last && !cancelled) showFix(toFix(last));
        const next = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 }, (l) => showFix(toFix(l))).catch(() => null);
        if (cancelled) next?.remove();
        else sub = next;
      })();
      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, []),
  );

  useEffect(() => {
    if (focus) setFollow(false);
  }, [focus]);

  useEffect(() => {
    if (demo) setFollow(true);
  }, [demo]);

  const next = useMemo(() => (primary ? { poi: primary.poi, distance: primary.distance } : nextAhead(fix, heading)), [primary, fix, heading]);
  const limitKmh = primary?.poi.maxspeed ?? section?.maxspeed ?? (next && next.distance < 2000 ? next.poi.maxspeed : null) ?? null;

  const bottomGap = Platform.OS === 'ios' ? insets.bottom + 58 : space.md;
  const cardHeight = 196;
  const mapPadding = useMemo(() => ({ top: Math.round(height * 0.48), bottom: Math.round(cardHeight + bottomGap), left: 0, right: 0 }), [height, bottomGap]);

  const toggle = async () => {
    if (demo) {
      stopDemo(false);
      return;
    }
    if (running) {
      await stopWarner();
      return;
    }
    const ok = await startWarner();
    if (!ok) showToast(t('drive.locationDenied'), 'danger', { label: t('drive.openSettings'), run: () => Linking.openSettings() }, 5000);
    else setFollow(true);
  };

  const report = () => {
    if (!fix) {
      showToast(t('report.needLocation'), 'danger');
      return;
    }
    router.push('/report');
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <DriveMap follow={follow} onUserMove={() => setFollow(false)} padding={mapPadding} />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        {primary || section ? <WarningBanner alert={primary} overspeed={!!overspeed} section={section} /> : <StatusPill />}
        {demo && (primary || section) ? (
          <View style={[styles.demo, styles.demoFloat, { backgroundColor: brand.ink }]}>
            <Text style={[styles.demoText, { color: brand.amber }]}>{t('drive.demo')}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: bottomGap }]} pointerEvents="box-none">
        <View style={styles.floats} pointerEvents="box-none">
          {!follow && fix ? <FloatButton icon="recenter" label={t('drive.recenter')} onPress={() => setFollow(true)} /> : null}
          <FloatButton icon="hud" label={t('drive.hud')} onPress={() => router.push('/hud')} />
        </View>
        {toast ? <ToastView toast={toast} /> : null}
        {confirm ? (
          <ConfirmPrompt poi={confirm.poi} until={confirm.until} onAnswer={(still) => answerConfirm(confirm.poi, still)} />
        ) : (
          <DriveCard speedKmh={speedKmh} overspeed={!!overspeed} limitKmh={limitKmh} next={next} running={running} demo={demo} onToggle={toggle} onReport={report} />
        )}
        <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} accessibilityRole="link" style={styles.attribution}>
          <Text style={[styles.attributionText, { color: c.textSecondary, backgroundColor: c.glass }]} numberOfLines={1}>
            {t('drive.attribution')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.md, alignItems: 'stretch' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, gap: space.sm },
  floats: { alignItems: 'flex-end', gap: space.sm },
  float: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 40,
    borderRadius: radius.pill,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pillText: { ...type.callout, fontFamily: fonts.semibold, flexShrink: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  demo: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginLeft: -6 },
  demoFloat: { alignSelf: 'flex-end', marginTop: space.sm, marginLeft: 0, paddingHorizontal: 10, paddingVertical: 4 },
  demoText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  attribution: { alignSelf: 'flex-start', marginTop: -2 },
  attributionText: { fontFamily: fonts.medium, fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
});
