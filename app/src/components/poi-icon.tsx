import { Image, type StyleProp, type ImageStyle } from 'react-native';

import type { PoiType } from '@/core/types';
import { iconFor, POI_IMAGES } from '@/lib/poi';

export function PoiIcon({ type, size = 40, style }: { type: PoiType; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={POI_IMAGES[iconFor(type)]} style={[{ width: size, height: size }, style]} accessibilityIgnoresInvertColors />;
}
