import { StyleSheet, Text, View } from 'react-native';

import type { Poi } from '@/core/types';
import { formatDistance, limitValue, speedUnit, speedValue } from '@/core/units';
import { useT } from '@/i18n';
import { useSettings } from '@/store/settings';
import { brand, fonts, radius, space, type, useColors } from '@/theme';

import { Icon } from './icon';
import { PoiIcon } from './poi-icon';
import { PressableScale } from './pressable-scale';
import { SpeedSign } from './speed-sign';
import { tap } from './ui';

export function DriveCard({
  speedKmh,
  overspeed,
  limitKmh,
  next,
  running,
  demo,
  onToggle,
  onReport,
}: {
  speedKmh: number | null;
  overspeed: boolean;
  limitKmh: number | null;
  next: { poi: Poi; distance: number } | null;
  running: boolean;
  demo: boolean;
  onToggle: () => void;
  onReport: () => void;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const units = useSettings((s) => s.units);
  const speed = speedKmh != null ? speedValue(Math.max(0, speedKmh), units) : null;

  return (
    <View style={[styles.card, { backgroundColor: c.glass, borderColor: c.border }]}>
      <View style={styles.top}>
        <View style={styles.speed}>
          <Text style={[type.speed, { color: overspeed ? c.danger : c.text }]} numberOfLines={1} accessibilityLabel={`${speed ?? 0} ${speedUnit(units)}`}>
            {speed ?? '–'}
          </Text>
          <Text style={[styles.unit, { color: c.textSecondary }]}>{speedUnit(units)}</Text>
        </View>
        <View style={styles.next}>
          <Text style={[type.label, { color: c.textTertiary }]} numberOfLines={1}>
            {t('drive.nextWarning')}
          </Text>
          {next ? (
            <View style={styles.nextRow}>
              <PoiIcon type={next.poi.type} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={[type.valueSmall, { color: c.text }]} numberOfLines={1}>
                  {formatDistance(next.distance, units, lang)}
                </Text>
                <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                  {t(`types.${next.poi.type}`)}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[type.callout, { color: c.textSecondary, marginTop: 4 }]} numberOfLines={2}>
              {running ? t('drive.clear') : t('drive.clearIdle')}
            </Text>
          )}
        </View>
        {limitKmh != null ? <SpeedSign value={limitValue(limitKmh, units)} size={60} /> : null}
      </View>
      <View style={styles.actions}>
        <PressableScale
          onPress={() => {
            tap();
            onToggle();
          }}
          accessibilityRole="button"
          accessibilityLabel={running ? (demo ? t('drive.demoStop') : t('drive.stop')) : t('drive.start')}
          style={[styles.action, { flex: 1.25, backgroundColor: running ? c.hero : brand.amber }]}>
          <Icon name={running ? 'stop' : 'play'} size={20} color={running ? '#FFFFFF' : brand.ink} />
          <Text style={[styles.actionText, { color: running ? '#FFFFFF' : brand.ink }]} numberOfLines={1} adjustsFontSizeToFit>
            {running ? (demo ? t('drive.demoStop') : t('drive.stop')) : t('drive.start')}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={() => {
            tap();
            onReport();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('drive.report')}
          style={[styles.action, { flex: 1, backgroundColor: brand.red }]}>
          <Icon name="report" size={20} color="#FFFFFF" />
          <Text style={[styles.actionText, { color: '#FFFFFF' }]} numberOfLines={1}>
            {t('drive.report')}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl + 2,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xs },
  speed: { alignItems: 'center', minWidth: 92 },
  unit: { fontFamily: fonts.semibold, fontSize: 12, marginTop: -4, letterSpacing: 0.5 },
  next: { flex: 1, gap: 4 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  action: { height: 60, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md },
  actionText: { fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.2 },
});
