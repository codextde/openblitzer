import * as Application from 'expo-application';
import * as WebBrowser from 'expo-web-browser';
import { Image, Text, View } from 'react-native';

import { Group, Row, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { LINKS } from '@/lib/links';
import { space, type, useColors } from '@/theme';

export default function AboutScreen() {
  const c = useColors();
  const { t } = useT();
  const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => undefined);
  return (
    <Screen underHeader>
      <View style={{ alignItems: 'center', gap: space.md, marginBottom: space.xl, marginTop: space.md }}>
        <Image source={require('../../assets/images/icon.png')} style={{ width: 84, height: 84, borderRadius: 20 }} />
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={[type.title, { color: c.text, fontSize: 26 }]}>OpenBlitzer</Text>
          <Text style={[type.callout, { color: c.textSecondary }]}>{t('settings.version', { v: `${Application.nativeApplicationVersion ?? '1.0.0'} (${Application.nativeBuildVersion ?? '1'})` })}</Text>
        </View>
        <Text style={[type.body, { color: c.textSecondary, textAlign: 'center' }]}>{t('about.body')}</Text>
      </View>
      <Group title={t('about.licenses')}>
        <Row title={t('about.osm')} subtitle={t('about.osmValue')} onPress={() => open(LINKS.osmCopyright)} />
        <Row title={t('about.openfreemap')} subtitle={t('about.openfreemapValue')} onPress={() => open(LINKS.openfreemap)} />
        <Row title={t('about.openmaptiles')} subtitle={t('about.openmaptilesValue')} onPress={() => open(LINKS.openmaptiles)} />
        <Row title={t('about.maplibre')} subtitle={t('about.maplibreValue')} onPress={() => open(LINKS.maplibre)} />
        <Row title={t('about.code')} subtitle={t('about.codeValue')} onPress={() => open(LINKS.github)} last />
      </Group>
    </Screen>
  );
}
