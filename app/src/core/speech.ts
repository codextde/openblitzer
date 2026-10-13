import { limitValue, roundDistance, speedValue } from './units';
import type { Lang, Poi, PoiType, Units } from './types';

const NAMES: Record<Lang, Record<PoiType, string>> = {
  de: {
    speed: 'Blitzer',
    redlight: 'Rotlichtblitzer',
    speed_redlight: 'Blitzer mit Rotlicht',
    section_start: 'Abschnittskontrolle',
    section_end: 'Ende der Abschnittskontrolle',
    mobile_camera: 'Mobiler Blitzer',
    fixed_camera: 'Blitzer',
    traffic_jam: 'Stauende',
    accident: 'Unfall',
    roadworks: 'Baustelle',
    hazard: 'Gefahr',
    closure: 'Sperrung',
    visibility: 'Schlechte Sicht',
  },
  en: {
    speed: 'Speed camera',
    redlight: 'Red light camera',
    speed_redlight: 'Speed and red light camera',
    section_start: 'Average speed check',
    section_end: 'End of average speed check',
    mobile_camera: 'Mobile speed camera',
    fixed_camera: 'Speed camera',
    traffic_jam: 'Traffic jam',
    accident: 'Accident',
    roadworks: 'Roadworks',
    hazard: 'Hazard',
    closure: 'Road closed',
    visibility: 'Poor visibility',
  },
};

export function poiName(type: PoiType, lang: Lang) {
  return NAMES[lang][type];
}

export function spokenDistance(meters: number, units: Units, lang: Lang) {
  if (units === 'mph') {
    const feet = meters * 3.28084;
    if (feet < 1000) {
      const rounded = Math.max(100, Math.round(feet / 100) * 100);
      return lang === 'de' ? `in ${rounded} Fuß` : `in ${rounded} feet`;
    }
    const miles = Math.round((meters / 1609.344) * 10) / 10;
    const text = lang === 'de' ? String(miles).replace('.', ',') : String(miles);
    if (lang === 'de') return `in ${text} ${miles === 1 ? 'Meile' : 'Meilen'}`;
    return `in ${text} ${miles === 1 ? 'mile' : 'miles'}`;
  }
  const m = roundDistance(meters);
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10;
    const text = lang === 'de' ? String(km).replace('.', ',') : String(km);
    if (lang === 'de') return `in ${text} ${km === 1 ? 'Kilometer' : 'Kilometern'}`;
    return `in ${text} ${km === 1 ? 'kilometer' : 'kilometers'}`;
  }
  return lang === 'de' ? `in ${m} Metern` : `in ${m} meters`;
}

function limitPhrase(maxspeed: number, units: Units, lang: Lang) {
  const v = limitValue(maxspeed, units);
  return lang === 'de' ? `Tempo ${v}` : `limit ${v}`;
}

export function warnPhrase(poi: Pick<Poi, 'type' | 'maxspeed'>, meters: number, units: Units, lang: Lang) {
  const name = poiName(poi.type, lang);
  const where = spokenDistance(meters, units, lang);
  if (poi.maxspeed != null && poi.type !== 'section_end' && hasLimit(poi.type)) return `${name}, ${limitPhrase(poi.maxspeed, units, lang)}, ${where}`;
  return `${name} ${where}`;
}

export function nearPhrase(poi: Pick<Poi, 'type' | 'maxspeed'>, units: Units, lang: Lang) {
  const attention = lang === 'de' ? 'Achtung' : 'Attention';
  if (poi.maxspeed != null && hasLimit(poi.type)) return `${attention}, ${limitPhrase(poi.maxspeed, units, lang)}`;
  const name = poiName(poi.type, lang);
  return `${attention}, ${lang === 'en' ? name.toLowerCase() : name}`;
}

export function sectionEndPhrase(average: number | null, units: Units, lang: Lang) {
  if (average == null) return lang === 'de' ? 'Abschnittskontrolle beendet' : 'Average speed check ended';
  const v = speedValue(average, units);
  return lang === 'de' ? `Abschnittskontrolle beendet, Durchschnitt ${v}` : `Average speed check ended, average ${v}`;
}

function hasLimit(type: PoiType) {
  return type === 'speed' || type === 'speed_redlight' || type === 'section_start' || type === 'mobile_camera' || type === 'fixed_camera';
}
