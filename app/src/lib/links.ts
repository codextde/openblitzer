import type { Lang } from '@/core/types';

export const LINKS = {
  site: 'https://openblitzer.codext.de',
  github: 'https://github.com/codextde/openblitzer',
  osmCopyright: 'https://www.openstreetmap.org/copyright',
  openfreemap: 'https://openfreemap.org',
  openmaptiles: 'https://www.openmaptiles.org',
  maplibre: 'https://maplibre.org',
};

export function siteLink(page: 'privacy' | 'imprint' | 'support', lang: Lang) {
  const de = { privacy: 'datenschutz', imprint: 'impressum', support: 'support' };
  const en = { privacy: 'en/privacy', imprint: 'en/imprint', support: 'en/support' };
  return `${LINKS.site}/${(lang === 'de' ? de : en)[page]}/`;
}
