import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform } from 'react-native';

import { Group, Header, Row, Screen, ToggleRow } from '@/components/ui';
import type { Category, Units } from '@/core/types';
import { updateFixed, useFixed } from '@/data/fixed';
import { useT } from '@/i18n';
import { LINKS, siteLink } from '@/lib/links';
import { showToast } from '@/store/live';
import { type LanguagePref, type MapStylePref, useSettings } from '@/store/settings';
import { useColors } from '@/theme';
import { startDemo } from '@/warn/session';

function choose<T extends string | number>(title: string, options: { value: T; label: string }[], cancel: string, onPick: (v: T) => void) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ title, options: [...options.map((o) => o.label), cancel], cancelButtonIndex: options.length }, (i) => {
      if (i < options.length) onPick(options[i].value);
    });
  } else {
    Alert.alert(title, undefined, [...options.map((o) => ({ text: o.label, onPress: () => onPick(o.value) })), { text: cancel, style: 'cancel' as const }]);
  }
}

const CATEGORIES: { key: Category; icon: 'camera' | 'trafficLight' | 'timer' | 'report' | 'hazard' }[] = [
  { key: 'fixed', icon: 'camera' },
  { key: 'redlight', icon: 'trafficLight' },
  { key: 'section', icon: 'timer' },
  { key: 'mobile', icon: 'report' },
  { key: 'traffic', icon: 'hazard' },
];

export default function SettingsScreen() {
  const c = useColors();
  const { t, lang } = useT();
  const s = useSettings();
  const fixed = useFixed();

  const tolerances = [0, 3, 5, 10];
  const unitLabel = (u: Units) => (u === 'mph' ? 'mph' : 'km/h');
  const mapLabel = (m: MapStylePref) => (m === 'auto' ? t('settings.mapAuto') : m === 'light' ? t('settings.mapLight') : t('settings.mapDark'));
  const langLabel = (l: LanguagePref) => (l === 'system' ? t('settings.languageSystem') : l === 'de' ? 'Deutsch' : 'English');
  const dateLabel = (ms: number | null) => (ms ? new Date(ms).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : t('settings.never'));
  const versionLabel = fixed.generatedAt ? new Date(fixed.generatedAt).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'medium' }) : (fixed.version ?? '–');

  const update = async () => {
    const ok = await updateFixed();
    showToast(ok ? t('settings.updated') : t('settings.updateFailed'), ok ? 'good' : 'danger');
  };

  const demo = () => {
    startDemo(0);
    router.navigate('/');
  };

  const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => undefined);

  return (
    <Screen>
      <Header title={t('settings.title')} />

      <Group title={t('settings.warnings')} footer={t('settings.voiceHint')}>
        <ToggleRow icon="speaker" title={t('settings.sound')} value={s.sound} onChange={(sound) => s.set({ sound })} />
        <ToggleRow icon="voice" title={t('settings.voice')} value={s.voice} onChange={(voice) => s.set({ voice })} />
        <ToggleRow icon="vibration" title={t('settings.vibration')} value={s.vibration} onChange={(vibration) => s.set({ vibration })} last />
      </Group>

      <Group title={t('settings.categories')}>
        {CATEGORIES.map((cat, i) => (
          <ToggleRow key={cat.key} icon={cat.icon} title={t(`settings.cat.${cat.key}`)} value={s.categories[cat.key]} onChange={(on) => s.setCategory(cat.key, on)} last={i === CATEGORIES.length - 1} />
        ))}
      </Group>

      <Group title={t('settings.speed')} footer={t('settings.overspeedHint')}>
        <ToggleRow icon="gauge" title={t('settings.overspeed')} value={s.overspeed} onChange={(overspeed) => s.set({ overspeed })} />
        <Row
          icon="tolerance"
          title={t('settings.tolerance')}
          value={`+${s.tolerance} ${unitLabel(s.units)}`}
          onPress={() =>
            choose(
              t('settings.tolerance'),
              tolerances.map((n) => ({ value: n, label: `+${n} ${unitLabel(s.units)}` })),
              t('common.cancel'),
              (tolerance) => s.set({ tolerance }),
            )
          }
        />
        <Row
          icon="ruler"
          title={t('settings.units')}
          value={unitLabel(s.units)}
          onPress={() =>
            choose(
              t('settings.units'),
              (['kmh', 'mph'] as Units[]).map((u) => ({ value: u, label: unitLabel(u) })),
              t('common.cancel'),
              (units) => s.set({ units }),
            )
          }
          last
        />
      </Group>

      <Group title={t('settings.display')}>
        <Row
          icon="contrast"
          title={t('settings.mapStyle')}
          value={mapLabel(s.mapStyle)}
          onPress={() =>
            choose(
              t('settings.mapStyle'),
              (['auto', 'light', 'dark'] as MapStylePref[]).map((m) => ({ value: m, label: mapLabel(m) })),
              t('common.cancel'),
              (mapStyle) => s.set({ mapStyle }),
            )
          }
        />
        <ToggleRow icon="sun" title={t('settings.keepScreenOn')} subtitle={t('settings.keepScreenOnHint')} value={s.keepScreenOn} onChange={(keepScreenOn) => s.set({ keepScreenOn })} />
        <Row
          icon="globe"
          title={t('settings.language')}
          value={langLabel(s.language)}
          onPress={() =>
            choose(
              t('settings.language'),
              (['system', 'de', 'en'] as LanguagePref[]).map((l) => ({ value: l, label: langLabel(l) })),
              t('common.cancel'),
              (language) => s.set({ language }),
            )
          }
          last
        />
      </Group>

      <Group title={t('settings.data')} footer={t('settings.dataHint')}>
        <Row icon="storage" title={t('settings.cameras')} value={fixed.count.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US')} />
        <Row icon="doc" title={t('settings.datasetVersion')} value={versionLabel} />
        <Row icon="clock" title={t('settings.lastUpdate')} value={dateLabel(fixed.checkedAt)} />
        <Row
          icon="download"
          title={t('settings.updateNow')}
          onPress={fixed.updating ? undefined : update}
          right={fixed.updating ? <ActivityIndicator size="small" color={c.textSecondary} /> : undefined}
          last
        />
      </Group>

      <Group>
        <Row icon="demo" iconColor={c.onAccent} iconBg={c.accent} title={t('settings.demo')} subtitle={t('settings.demoHint')} onPress={demo} last />
      </Group>

      <Group title={t('settings.about')}>
        <Row icon="scale" title={t('settings.legal')} onPress={() => router.push('/legal')} />
        <Row icon="info" title={t('settings.aboutApp')} onPress={() => router.push('/about')} />
        <Row icon="code" title={t('settings.sourceCode')} onPress={() => open(LINKS.github)} />
        <Row icon="question" title={t('settings.support')} onPress={() => open(siteLink('support', lang))} />
        <Row icon="shield" title={t('settings.privacy')} onPress={() => open(siteLink('privacy', lang))} />
        <Row icon="doc" title={t('settings.imprint')} value={t('settings.version', { v: Application.nativeApplicationVersion ?? '1.0.0' })} onPress={() => open(siteLink('imprint', lang))} last />
      </Group>
    </Screen>
  );
}
