import { Text, View } from 'react-native';

import { fonts } from '@/theme';

export function SpeedSign({ value, size = 56 }: { value: number | null; size?: number }) {
  const ring = Math.max(4, Math.round(size * 0.12));
  const digits = value == null ? 1 : String(value).length;
  return (
    <View
      accessibilityLabel={value != null ? String(value) : undefined}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF', borderWidth: ring, borderColor: '#E30613', alignItems: 'center', justifyContent: 'center' }}>
      <Text
        style={{ fontFamily: fonts.numBold, color: '#0B0D10', fontSize: size * (digits >= 3 ? 0.36 : 0.46), lineHeight: size * 0.56, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}
        numberOfLines={1}>
        {value ?? '–'}
      </Text>
    </View>
  );
}
