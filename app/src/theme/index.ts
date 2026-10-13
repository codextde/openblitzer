import { useColorScheme, type TextStyle } from 'react-native';

import { useSettings } from '@/store/settings';

export const brand = {
  ink: '#0B0D10',
  paper: '#F5F6F8',
  amber: '#FFB800',
  red: '#FF3B30',
  green: '#22C55E',
};

const light = {
  background: brand.paper,
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EAECEF',
  surfacePressed: '#E3E6EA',
  border: 'rgba(11,13,16,0.08)',
  borderStrong: 'rgba(11,13,16,0.15)',
  text: brand.ink,
  textSecondary: '#59616C',
  textTertiary: '#8A919B',
  accent: brand.amber,
  accentStrong: '#A87400',
  accentSoft: 'rgba(255,184,0,0.16)',
  onAccent: brand.ink,
  danger: brand.red,
  dangerStrong: '#D92C22',
  dangerSoft: 'rgba(255,59,48,0.12)',
  good: brand.green,
  goodSoft: 'rgba(34,197,94,0.14)',
  scrim: 'rgba(11,13,16,0.45)',
  hero: brand.ink,
  onHero: '#FFFFFF',
  onHeroSecondary: 'rgba(255,255,255,0.62)',
  glass: 'rgba(255,255,255,0.94)',
};

export type Palette = typeof light;

const dark: Palette = {
  background: brand.ink,
  surface: '#15181D',
  surfaceRaised: '#1C2026',
  surfaceSunken: '#101317',
  surfacePressed: '#252A31',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F3F4F6',
  textSecondary: '#9CA3AD',
  textTertiary: '#666D77',
  accent: brand.amber,
  accentStrong: brand.amber,
  accentSoft: 'rgba(255,184,0,0.16)',
  onAccent: brand.ink,
  danger: '#FF5147',
  dangerStrong: '#FF5147',
  dangerSoft: 'rgba(255,81,71,0.16)',
  good: brand.green,
  goodSoft: 'rgba(34,197,94,0.16)',
  scrim: 'rgba(0,0,0,0.6)',
  hero: '#1C2026',
  onHero: '#FFFFFF',
  onHeroSecondary: 'rgba(255,255,255,0.6)',
  glass: 'rgba(21,24,29,0.94)',
};

export const palettes = { light, dark };

export function useIsDark() {
  return useColorScheme() === 'dark';
}

export function useColors(): Palette {
  return useIsDark() ? dark : light;
}

export function useMapDark() {
  const system = useIsDark();
  const style = useSettings((s) => s.mapStyle);
  return style === 'auto' ? system : style === 'dark';
}

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  numMedium: 'BarlowSemiCondensed_500Medium',
  numSemibold: 'BarlowSemiCondensed_600SemiBold',
  numBold: 'BarlowSemiCondensed_700Bold',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  speed: { fontFamily: fonts.numBold, fontSize: 64, lineHeight: 66, letterSpacing: -1.5, fontVariant: tabular },
  hero: { fontFamily: fonts.numBold, fontSize: 48, lineHeight: 52, letterSpacing: -1, fontVariant: tabular },
  display: { fontFamily: fonts.numBold, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, fontVariant: tabular },
  value: { fontFamily: fonts.numSemibold, fontSize: 26, lineHeight: 30, fontVariant: tabular },
  valueSmall: { fontFamily: fonts.numSemibold, fontSize: 20, lineHeight: 24, fontVariant: tabular },
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  headline: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 22 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;
