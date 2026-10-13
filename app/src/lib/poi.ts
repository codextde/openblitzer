import type { ImageRequireSource } from 'react-native';

import type { PoiType } from '@/core/types';

export const POI_IMAGES = {
  speed: require('../../assets/map/speed.png'),
  combo: require('../../assets/map/combo.png'),
  redlight: require('../../assets/map/redlight.png'),
  section: require('../../assets/map/section.png'),
  mobile: require('../../assets/map/mobile.png'),
  jam: require('../../assets/map/jam.png'),
  accident: require('../../assets/map/accident.png'),
  roadworks: require('../../assets/map/roadworks.png'),
  hazard: require('../../assets/map/hazard.png'),
  closure: require('../../assets/map/closure.png'),
  visibility: require('../../assets/map/visibility.png'),
  puck: require('../../assets/map/puck.png'),
} satisfies Record<string, ImageRequireSource>;

export type PoiImage = keyof typeof POI_IMAGES;

const ICON: Record<PoiType, PoiImage> = {
  speed: 'speed',
  fixed_camera: 'speed',
  speed_redlight: 'combo',
  redlight: 'redlight',
  section_start: 'section',
  section_end: 'section',
  mobile_camera: 'mobile',
  traffic_jam: 'jam',
  accident: 'accident',
  roadworks: 'roadworks',
  hazard: 'hazard',
  closure: 'closure',
  visibility: 'visibility',
};

export function iconFor(type: PoiType): PoiImage {
  return ICON[type];
}

export function severity(type: PoiType): 'danger' | 'warn' {
  return type === 'mobile_camera' || type === 'accident' || type === 'closure' || type === 'traffic_jam' ? 'danger' : 'warn';
}
