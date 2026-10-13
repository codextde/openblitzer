import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoiIcon } from '@/components/poi-icon';
import { PressableScale } from '@/components/pressable-scale';
import { tap } from '@/components/ui';
import { REPORT_TYPES, type ReportType } from '@/core/types';
import { useT } from '@/i18n';
import { fonts, radius, space, type, useColors } from '@/theme';
import { queueReport } from '@/warn/report';

export default function ReportSheet() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  const pick = (type: ReportType) => {
    tap();
    router.back();
    queueReport(type);
  };

  return (
    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
      <View style={styles.head}>
        <Text style={[type.title, { color: c.text, fontSize: 24, lineHeight: 30 }]}>{t('report.title')}</Text>
        <Text style={[type.callout, { color: c.textSecondary }]}>{t('report.subtitle')}</Text>
      </View>
      <View style={styles.grid}>
        {REPORT_TYPES.map((type) => (
          <PressableScale
            key={type}
            scaleTo={0.95}
            onPress={() => pick(type)}
            accessibilityRole="button"
            accessibilityLabel={t(`types.${type}`)}
            style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
            <PoiIcon type={type} size={52} />
            <Text style={[styles.label, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {t(`tiles.${type}`)}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.lg, paddingTop: space.xl + 4, gap: space.lg },
  head: { gap: 4, paddingHorizontal: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48.6%',
    height: 92,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
  },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.2 },
});
