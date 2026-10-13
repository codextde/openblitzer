import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { SpeedSign } from '@/components/speed-sign';
import { tap } from '@/components/ui';
import { isCamera } from '@/core/types';
import { formatDistance, limitValue, speedUnit, speedValue } from '@/core/units';
import { useT } from '@/i18n';
import { severity } from '@/lib/poi';
import { useLive } from '@/store/live';
import { useSettings } from '@/store/settings';
import { brand, fonts, space } from '@/theme';

function Control({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.control, active && { backgroundColor: 'rgba(255,184,0,0.2)' }]}>
      <Icon name={icon} size={22} color={active ? brand.amber : 'rgba(255,255,255,0.75)'} />
    </Pressable>
  );
}

export default function HudScreen() {
  useKeepAwake('hud');
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [mirror, setMirror] = useState(true);
  const units = useSettings((s) => s.units);
  const speedKmh = useLive((s) => s.speedKmh);
  const primary = useLive((s) => s.primary);
  const overspeed = useLive((s) => s.overspeed);
  const section = useLive((s) => s.section);

  const speed = speedKmh != null ? speedValue(Math.max(0, speedKmh), units) : null;
  const danger = !!overspeed || (primary ? severity(primary.poi.type) === 'danger' : false);
  const accent = danger ? brand.red : brand.amber;
  const limitKmh = primary?.poi.maxspeed != null && isCamera(primary.poi.type) ? primary.poi.maxspeed : (section?.maxspeed ?? null);
  const speedSize = Math.min(landscape ? height * 0.62 : width * 0.52, 260);

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <View style={[styles.content, { transform: [{ scaleX: mirror ? -1 : 1 }], flexDirection: landscape ? 'row' : 'column' }]}>
        <View style={styles.speedBlock}>
          <Text style={[styles.speed, { fontSize: speedSize, lineHeight: speedSize * 1.02, color: overspeed ? brand.red : '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit>
            {speed ?? '–'}
          </Text>
          <Text style={styles.unit}>{speedUnit(units)}</Text>
        </View>
        <View style={[styles.warning, { borderColor: primary || section ? accent : 'rgba(255,255,255,0.2)' }]}>
          {primary ? (
            <>
              <Text style={[styles.warningType, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                {t(`types.${primary.poi.type}`)}
              </Text>
              <Text style={[styles.warningDistance, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatDistance(primary.distance, units, lang)}
              </Text>
            </>
          ) : section ? (
            <>
              <Text style={[styles.warningType, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                {t('drive.section')}
              </Text>
              {section.average != null ? (
                <Text style={[styles.warningDistance, { color: accent }]} numberOfLines={1}>
                  {t('drive.average', { v: speedValue(section.average, units) })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.warningType, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1} adjustsFontSizeToFit>
              {t('hud.clear')}
            </Text>
          )}
          {limitKmh != null ? <SpeedSign value={limitValue(limitKmh, units)} size={landscape ? 96 : 110} /> : null}
        </View>
      </View>
      <View style={[styles.controls, { top: insets.top + space.sm, left: insets.left + space.md, right: insets.right + space.md }]}>
        <Control icon="close" label={t('hud.close')} onPress={() => router.back()} />
        <Control icon="mirror" label={t('hud.mirror')} active={mirror} onPress={() => setMirror((m) => !m)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxl, padding: space.xl },
  speedBlock: { alignItems: 'center' },
  speed: { fontFamily: fonts.numBold, letterSpacing: -4, fontVariant: ['tabular-nums'], textAlign: 'center' },
  unit: { fontFamily: fonts.numSemibold, fontSize: 28, color: 'rgba(255,255,255,0.7)', marginTop: -8, letterSpacing: 1 },
  warning: { alignItems: 'center', gap: space.md, paddingVertical: space.xl, paddingHorizontal: space.xxl, borderRadius: 28, borderWidth: 3, minWidth: 260, maxWidth: '92%' },
  warningType: { fontFamily: fonts.bold, fontSize: 30, textAlign: 'center' },
  warningDistance: { fontFamily: fonts.numBold, fontSize: 64, lineHeight: 68, fontVariant: ['tabular-nums'] },
  controls: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between' },
  control: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
});
