import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useT } from '@/i18n';
import { useColors } from '@/theme';

const android = Platform.OS === 'android';

export default function TabsLayout() {
  const c = useColors();
  const { t } = useT();
  return (
    <NativeTabs
      tintColor={c.accentStrong}
      backgroundColor={android ? c.surface : undefined}
      indicatorColor={android ? c.accentSoft : undefined}
      iconColor={android ? { default: c.textSecondary, selected: c.text } : undefined}
      labelStyle={android ? { default: { color: c.textSecondary }, selected: { color: c.text } } : undefined}
      rippleColor={android ? c.accentSoft : undefined}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tabs.drive')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'car', selected: 'car.fill' }} md="directions_car" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Label>{t('tabs.reports')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'exclamationmark.bubble', selected: 'exclamationmark.bubble.fill' }} md="campaign" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
