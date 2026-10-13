import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { Card, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { space, type, useColors } from '@/theme';

export default function LegalScreen() {
  const c = useColors();
  const { t } = useT();
  const points: { icon: IconName; text: string }[] = [
    { icon: 'person', text: t('welcome.legal1') },
    { icon: 'globe', text: t('welcome.legal2') },
    { icon: 'gauge', text: t('welcome.legal3') },
  ];
  return (
    <Screen underHeader>
      <View style={{ gap: space.lg }}>
        <Text style={[type.title, { color: c.text, fontSize: 26, lineHeight: 32 }]}>{t('welcome.legalTitle')}</Text>
        <Text style={[type.body, { color: c.textSecondary }]}>{t('welcome.legalBody')}</Text>
        <Card style={{ gap: space.lg }}>
          {points.map((p) => (
            <View key={p.text} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <Icon name={p.icon} size={18} color={c.text} />
              <Text style={[type.callout, { color: c.text, flex: 1 }]}>{p.text}</Text>
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
