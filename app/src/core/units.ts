import type { Lang, Units } from './types';

export const KMH_PER_MPH = 1.609344;
const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;

export function speedValue(kmh: number, units: Units) {
  return Math.round(units === 'mph' ? kmh / KMH_PER_MPH : kmh);
}

export function limitValue(kmh: number, units: Units) {
  return units === 'mph' ? Math.round(kmh / KMH_PER_MPH / 5) * 5 : Math.round(kmh);
}

export function speedUnit(units: Units) {
  return units === 'mph' ? 'mph' : 'km/h';
}

export function roundDistance(meters: number) {
  if (meters >= 200) return Math.round(meters / 100) * 100;
  return Math.max(50, Math.round(meters / 50) * 50);
}

const decimal = (v: number, lang: Lang) => (lang === 'de' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));

export function formatDistance(meters: number, units: Units, lang: Lang) {
  if (units === 'mph') {
    const miles = meters / METERS_PER_MILE;
    if (miles < 0.1) return `${Math.max(10, Math.round((meters * FEET_PER_METER) / 10) * 10)} ft`;
    return `${decimal(miles, lang)} mi`;
  }
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10000) return `${decimal(meters / 1000, lang)} km`;
  return `${Math.round(meters / 1000)} km`;
}
