import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PoiIcon } from '@/components/poi-icon';
import { PressableScale } from '@/components/pressable-scale';
import { Notice, tap } from '@/components/ui';
import { distance } from '@/core/geo';
import type { Report } from '@/core/types';
import { formatDistance } from '@/core/units';
import { activeReports, refreshReports, useReports } from '@/data/reports';
import { useT } from '@/i18n';
import { useLive } from '@/store/live';
import { useSettings } from '@/store/settings';
import { fonts, radius, space, type, useColors } from '@/theme';

function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export default function ReportsScreen() {
  const c = useColors();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const units = useSettings((s) => s.units);
  const now = useNow();
  const demo = useLive((s) => s.demo);
  const demoReports = useLive((s) => s.demoReports);
  const demoOwn = useLive((s) => s.demoOwn);
  const fix = useLive((s) => s.fix);
  const { reports, error, own, center } = useReports();
  const [refreshing, setRefreshing] = useState(false);

  const origin = fix ?? center;
  const items = useMemo(() => {
    const list = activeReports(demo ? demoReports : reports, now);
    return list
      .map((r) => ({ report: r, distance: origin ? distance(origin, r) : null }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }, [demo, demoReports, reports, now, origin]);

  const refresh = useCallback(async () => {
    if (demo || !origin) return;
    setRefreshing(true);
    await refreshReports(origin.lat, origin.lon, true);
    setRefreshing(false);
  }, [demo, origin]);

  const ago = (iso: string) => {
    const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
    if (min < 1) return t('reports.justNow');
    if (min < 60) return t('reports.ago', { n: min });
    return t('reports.agoH', { n: Math.floor(min / 60) });
  };

  const open = (r: Report) => {
    tap();
    useLive.setState({ focus: { lat: r.lat, lon: r.lon, at: Date.now() } });
    router.navigate('/');
  };

  const header = (
    <View style={{ gap: space.md, marginBottom: space.md }}>
      <View style={{ gap: 2, minHeight: 52, justifyContent: 'flex-end' }}>
        <Text style={[type.label, { color: c.textTertiary }]}>{t('reports.subtitle')}</Text>
        <Text style={[type.title, { color: c.text }]}>{t('reports.title')}</Text>
      </View>
      {error && !demo ? <Notice tone="warn" icon="warning" title={t('reports.offline')} /> : null}
      {!origin && !demo ? <Notice tone="info" icon="location" title={t('reports.noLocation')} /> : null}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: space.lg,
        paddingTop: Platform.OS === 'ios' ? space.sm : insets.top + space.md,
        paddingBottom: Platform.OS === 'ios' ? 120 : insets.bottom + 110,
        gap: space.sm,
        flexGrow: 1,
      }}
      data={items}
      keyExtractor={(i) => i.report.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.textSecondary} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: c.surfaceSunken }]}>
            <Icon name="checkCircle" size={34} color={c.good} />
          </View>
          <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{t('reports.empty')}</Text>
          <Text style={[type.body, { color: c.textSecondary, textAlign: 'center' }]}>{t('reports.emptyBody')}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const r = item.report;
        const mine = demo ? demoOwn.includes(r.id) : own.includes(r.id);
        const confirmations = Math.max(0, r.up);
        return (
          <PressableScale scaleTo={0.98} onPress={() => open(r)} accessibilityRole="button" style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
            <PoiIcon type={r.type} size={46} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                {t(`types.${r.type}`)}
              </Text>
              <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                {[ago(r.createdAt), mine ? t('reports.own') : confirmations === 1 ? t('reports.confirmationsOne') : t('reports.confirmations', { n: confirmations })].join(' · ')}
              </Text>
            </View>
            {item.distance != null ? <Text style={[styles.distance, { color: c.text }]}>{formatDistance(item.distance, units, lang)}</Text> : null}
            <Icon name="chevronRight" size={13} color={c.textTertiary} />
          </PressableScale>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, minHeight: 72 },
  distance: { fontFamily: fonts.numSemibold, fontSize: 19, fontVariant: ['tabular-nums'] },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.xxxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
