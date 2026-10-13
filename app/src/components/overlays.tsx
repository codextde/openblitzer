import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Poi } from '@/core/types';
import { useT } from '@/i18n';
import type { Toast } from '@/store/live';
import { brand, fonts, radius, space, type, useColors } from '@/theme';

import { Icon } from './icon';
import { PoiIcon } from './poi-icon';
import { PressableScale } from './pressable-scale';
import { tap } from './ui';

export function ToastView({ toast }: { toast: Toast }) {
  const c = useColors();
  const progress = useSharedValue(1);
  useEffect(() => {
    progress.value = 1;
    progress.value = withTiming(0, { duration: Math.max(0, toast.until - Date.now()), easing: Easing.linear });
  }, [toast.id, toast.until, progress]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const tone = toast.tone === 'danger' ? brand.red : toast.tone === 'good' ? brand.green : brand.amber;
  return (
    <Animated.View key={toast.id} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)} style={[styles.toast, { backgroundColor: c.hero }]} accessibilityLiveRegion="polite">
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={[type.bodyStrong, { color: '#FFFFFF', flex: 1 }]} numberOfLines={2}>
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          onPress={() => {
            tap();
            toast.action?.run();
          }}
          accessibilityRole="button"
          style={[styles.toastAction, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
          <Text style={[type.bodyStrong, { color: brand.amber, fontFamily: fonts.bold }]}>{toast.action.label}</Text>
        </Pressable>
      ) : null}
      {toast.action ? <Animated.View style={[styles.toastBar, { backgroundColor: tone }, bar]} /> : null}
    </Animated.View>
  );
}

export function ConfirmPrompt({ poi, until, onAnswer }: { poi: Poi; until: number; onAnswer: (still: boolean) => void }) {
  const c = useColors();
  const { t } = useT();
  const progress = useSharedValue(1);
  useEffect(() => {
    progress.value = 1;
    progress.value = withTiming(0, { duration: Math.max(0, until - Date.now()), easing: Easing.linear });
  }, [poi.id, until, progress]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={[styles.confirm, { backgroundColor: c.glass, borderColor: c.border }]}>
      <View style={styles.confirmHead}>
        <PoiIcon type={poi.type} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[type.title, { color: c.text, fontSize: 26, lineHeight: 30 }]}>{t('confirm.title')}</Text>
          <Text style={[type.callout, { color: c.textSecondary }]} numberOfLines={1}>
            {t(`types.${poi.type}`)}
          </Text>
        </View>
      </View>
      <View style={styles.confirmActions}>
        <PressableScale
          onPress={() => {
            tap();
            onAnswer(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('confirm.yes')}
          style={[styles.confirmButton, { backgroundColor: brand.green }]}>
          <Icon name="thumbUp" size={22} color="#FFFFFF" />
          <Text style={styles.confirmText}>{t('confirm.yes')}</Text>
        </PressableScale>
        <PressableScale
          onPress={() => {
            tap();
            onAnswer(false);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('confirm.no')}
          style={[styles.confirmButton, { backgroundColor: brand.red }]}>
          <Icon name="thumbDown" size={22} color="#FFFFFF" />
          <Text style={styles.confirmText}>{t('confirm.no')}</Text>
        </PressableScale>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
        <Animated.View style={[styles.trackFill, { backgroundColor: c.textTertiary }, bar]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    minHeight: 56,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  toastAction: { paddingHorizontal: space.lg, height: 44, borderRadius: radius.md, justifyContent: 'center', marginVertical: 6 },
  toastBar: { position: 'absolute', left: 0, bottom: 0, height: 3 },
  confirm: {
    borderRadius: radius.xl + 2,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  confirmActions: { flexDirection: 'row', gap: space.sm },
  confirmButton: { flex: 1, height: 64, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  confirmText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 19 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2 },
});
