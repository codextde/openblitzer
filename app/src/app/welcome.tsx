import { useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { Button, success } from '@/components/ui';
import { useT } from '@/i18n';
import { useSettings } from '@/store/settings';
import { space, type, useColors } from '@/theme';
import { requestNotificationPermission } from '@/warn/output';
import { ensureLocationPermission } from '@/warn/session';

const enter = Platform.OS === 'ios' ? FadeInRight : undefined;
const exit = Platform.OS === 'ios' ? FadeOutLeft : undefined;

function Points({ items, tint, bg }: { items: { icon: IconName; text: string }[]; tint: string; bg: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.lg }}>
      {items.map((p) => (
        <View key={p.text} style={styles.point}>
          <View style={[styles.pointIcon, { backgroundColor: bg }]}>
            <Icon name={p.icon} size={18} color={tint} />
          </View>
          <Text style={[type.callout, { color: c.text, flex: 1 }]}>{p.text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function WelcomeScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    await ensureLocationPermission(true);
    await requestNotificationPermission();
    setBusy(false);
    success();
    useSettings.getState().set({ onboarded: true, legalAccepted: true });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.progress}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.progressBar, { backgroundColor: i <= step ? c.accent : c.borderStrong }]} />
        ))}
      </View>

      {step === 0 ? (
        <Animated.View key="s0" entering={enter} exiting={exit} style={styles.step}>
          <Image source={require('../../assets/images/icon.png')} style={styles.logo} />
          <View style={{ gap: space.sm }}>
            <Text style={[type.label, { color: c.accentStrong }]}>{t('welcome.eyebrow')}</Text>
            <Text style={[type.title, styles.title, { color: c.text }]}>{t('welcome.title')}</Text>
            <Text style={[type.body, { color: c.textSecondary }]}>{t('welcome.body')}</Text>
          </View>
          <Points
            tint={c.accentStrong}
            bg={c.accentSoft}
            items={[
              { icon: 'camera', text: t('welcome.point1') },
              { icon: 'report', text: t('welcome.point2') },
              { icon: 'speaker', text: t('welcome.point3') },
            ]}
          />
          <View style={{ flex: 1 }} />
          <Button title={t('welcome.start')} large onPress={() => setStep(1)} />
        </Animated.View>
      ) : null}

      {step === 1 ? (
        <Animated.View key="s1" entering={enter} exiting={exit} style={styles.step}>
          <View style={[styles.badge, { backgroundColor: c.dangerSoft }]}>
            <Icon name="scale" size={30} color={c.dangerStrong} />
          </View>
          <View style={{ gap: space.sm }}>
            <Text style={[type.label, { color: c.dangerStrong }]}>{t('welcome.legalEyebrow')}</Text>
            <Text style={[type.title, styles.title, { color: c.text }]}>{t('welcome.legalTitle')}</Text>
            <Text style={[type.body, { color: c.textSecondary }]}>{t('welcome.legalBody')}</Text>
          </View>
          <Points
            tint={c.text}
            bg={c.surfaceSunken}
            items={[
              { icon: 'person', text: t('welcome.legal1') },
              { icon: 'globe', text: t('welcome.legal2') },
              { icon: 'gauge', text: t('welcome.legal3') },
            ]}
          />
          <View style={{ flex: 1 }} />
          <Button title={t('welcome.accept')} large icon="check" onPress={() => setStep(2)} />
        </Animated.View>
      ) : null}

      {step === 2 ? (
        <Animated.View key="s2" entering={enter} exiting={exit} style={styles.step}>
          <View style={[styles.badge, { backgroundColor: c.goodSoft }]}>
            <Icon name="location" size={30} color={c.good} />
          </View>
          <View style={{ gap: space.sm }}>
            <Text style={[type.label, { color: c.good }]}>{t('welcome.locationEyebrow')}</Text>
            <Text style={[type.title, styles.title, { color: c.text }]}>{t('welcome.locationTitle')}</Text>
            <Text style={[type.body, { color: c.textSecondary }]}>{t('welcome.locationBody')}</Text>
          </View>
          <Points
            tint={c.good}
            bg={c.goodSoft}
            items={[
              { icon: 'location', text: t('welcome.location1') },
              { icon: 'shield', text: t('welcome.location2') },
              { icon: 'report', text: t('welcome.location3') },
            ]}
          />
          <View style={{ flex: 1 }} />
          <Button title={t('common.continue')} large loading={busy} onPress={finish} />
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: space.xl, gap: space.xl },
  step: { flex: 1, gap: space.xl },
  title: { fontSize: 32, lineHeight: 38 },
  progress: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  logo: { width: 72, height: 72, borderRadius: 18 },
  badge: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pointIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
