import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import type { Alert, Section } from '@/core/engine';
import { isCamera } from '@/core/types';
import { formatDistance, limitValue, speedValue, speedUnit } from '@/core/units';
import { useT } from '@/i18n';
import { severity } from '@/lib/poi';
import { useSettings } from '@/store/settings';
import { brand, fonts, radius, space, type } from '@/theme';

import { PoiIcon } from './poi-icon';
import { SpeedSign } from './speed-sign';

function splitDistance(label: string) {
  const i = label.lastIndexOf(' ');
  return i > 0 ? [label.slice(0, i), label.slice(i + 1)] : [label, ''];
}

export function WarningBanner({ alert, overspeed, section }: { alert: Alert | null; overspeed: boolean; section: Section | null }) {
  const { t, lang } = useT();
  const units = useSettings((s) => s.units);

  if (!alert && section) {
    return (
      <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(200)} style={[styles.banner, { backgroundColor: overspeed ? brand.red : brand.ink }]}>
        <PoiIcon type="section_start" size={52} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: '#FFFFFF' }]} numberOfLines={1}>
            {t('drive.section')}
          </Text>
          <Text style={[styles.sub, { color: 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>
            {section.average != null ? `${t('drive.average', { v: speedValue(section.average, units) })} ${speedUnit(units)}` : overspeed ? t('drive.overspeed') : ' '}
          </Text>
        </View>
        {section.maxspeed != null ? <SpeedSign value={limitValue(section.maxspeed, units)} size={58} /> : null}
      </Animated.View>
    );
  }
  if (!alert) return null;

  const danger = overspeed || severity(alert.poi.type) === 'danger';
  const bg = danger ? brand.red : brand.amber;
  const fg = danger ? '#FFFFFF' : brand.ink;
  const [value, unit] = splitDistance(formatDistance(alert.distance, units, lang));
  const limit = alert.poi.maxspeed != null && isCamera(alert.poi.type) ? limitValue(alert.poi.maxspeed, units) : null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.banner, { backgroundColor: bg }]}
      accessibilityRole="alert"
      accessibilityLabel={`${t(`types.${alert.poi.type}`)}, ${value} ${unit}`}>
      <PoiIcon type={alert.poi.type} size={52} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
          {t(`types.${alert.poi.type}`)}
        </Text>
        <View style={styles.distanceRow}>
          <Text style={[styles.distance, { color: fg }]}>{value}</Text>
          <Text style={[styles.unit, { color: fg }]}>{unit}</Text>
          {overspeed ? (
            <View style={[styles.tag, { backgroundColor: '#FFFFFF' }]}>
              <Text style={[styles.tagText, { color: brand.red }]}>{t('drive.overspeed')}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {limit != null ? <SpeedSign value={limit} size={62} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.md,
    paddingRight: space.lg,
    borderRadius: radius.xl,
    minHeight: 92,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  body: { flex: 1, gap: 0 },
  title: { ...type.headline, fontFamily: fonts.bold, fontSize: 19 },
  sub: { ...type.callout },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  distance: { ...type.hero, fontSize: 44, lineHeight: 48 },
  unit: { fontFamily: fonts.numSemibold, fontSize: 22 },
  tag: { marginLeft: space.sm, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'center' },
  tagText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
});
