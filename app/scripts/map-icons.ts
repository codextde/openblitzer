/// <reference types="bun" />
import sharp from 'sharp';

const INK = '#0B0D10';
const AMBER = '#FFB800';
const RED = '#FF3B30';
const WHITE = '#FFFFFF';
const BASE = 56;
const OUT = new URL('../assets/map/', import.meta.url).pathname;

const camera = (fg: string, bg: string) => `
  <rect x="8" y="4.6" width="8" height="3.6" rx="1.2" fill="${fg}"/>
  <rect x="3" y="7.4" width="18" height="12.2" rx="2.8" fill="${fg}"/>
  <circle cx="12" cy="13.5" r="3.9" fill="${bg}"/>
  <circle cx="12" cy="13.5" r="1.9" fill="${fg}"/>
  <circle cx="18" cy="10" r="1" fill="${bg}"/>`;

const trafficLight = (housing: string, stroke: string) => `
  <rect x="7.6" y="2" width="8.8" height="20" rx="3.2" fill="${housing}" stroke="${stroke}" stroke-width="1.4"/>
  <circle cx="12" cy="6.8" r="2.15" fill="${RED}"/>
  <circle cx="12" cy="12" r="2.15" fill="${AMBER}"/>
  <circle cx="12" cy="17.2" r="2.15" fill="#22C55E"/>`;

const stopwatch = (fg: string) => `
  <rect x="9.5" y="2.2" width="5" height="2.4" rx="1" fill="${fg}"/>
  <circle cx="12" cy="13.6" r="7.6" fill="none" stroke="${fg}" stroke-width="2.5"/>
  <path d="M12 13.6 L15.6 9.6" stroke="${fg}" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="12" cy="13.6" r="1.6" fill="${fg}"/>`;

const car = (fg: string, bg: string, dx = 0, dy = 0, s = 1) => `
  <g transform="translate(${dx} ${dy}) scale(${s})">
    <path d="M6.6 10.4 L8.6 5.6 Q9 4.8 9.9 4.8 H14.1 Q15 4.8 15.4 5.6 L17.4 10.4 Z" fill="${fg}"/>
    <rect x="3.8" y="9.8" width="16.4" height="7.6" rx="2.2" fill="${fg}"/>
    <rect x="5" y="16.6" width="3.4" height="3.2" rx="1" fill="${fg}"/>
    <rect x="15.6" y="16.6" width="3.4" height="3.2" rx="1" fill="${fg}"/>
    <circle cx="7.6" cy="13.4" r="1.4" fill="${bg}"/>
    <circle cx="16.4" cy="13.4" r="1.4" fill="${bg}"/>
  </g>`;

const burst = (fg: string) => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 10 : 4.6;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fg}" stroke="${fg}" stroke-width="1.2" stroke-linejoin="round"/>`;
};

const cone = (fg: string, bg: string) => `
  <path d="M10.2 3.6 Q12 2.4 13.8 3.6 L18.6 19 H5.4 Z" fill="${fg}"/>
  <path d="M8.55 9 H15.45 L16.15 11.4 H7.85 Z" fill="${bg}"/>
  <path d="M7.2 13.6 H16.8 L17.5 16 H6.5 Z" fill="${bg}"/>
  <rect x="3.6" y="18.6" width="16.8" height="2.8" rx="1.2" fill="${fg}"/>`;

const exclamation = (fg: string) => `
  <rect x="10.4" y="3.4" width="3.2" height="11.6" rx="1.6" fill="${fg}"/>
  <circle cx="12" cy="19.2" r="2" fill="${fg}"/>`;

const bar = (fg: string) => `<rect x="4" y="9.6" width="16" height="4.8" rx="1.4" fill="${fg}"/>`;

const fog = (fg: string) => `
  <g stroke="${fg}" stroke-width="2.4" stroke-linecap="round" fill="none">
    <path d="M6 7 H18"/><path d="M3.6 12 H15"/><path d="M18.4 12 H20.4"/><path d="M7 17 H20.4"/><path d="M3.6 17 H4"/>
  </g>`;

const badges: Record<string, { bg: string; glyph: string }> = {
  speed: { bg: AMBER, glyph: camera(INK, AMBER) },
  combo: { bg: AMBER, glyph: trafficLight(INK, INK) },
  redlight: { bg: INK, glyph: trafficLight(INK, WHITE) },
  section: { bg: AMBER, glyph: stopwatch(INK) },
  mobile: { bg: RED, glyph: camera(WHITE, RED) },
  jam: { bg: RED, glyph: `<g opacity="0.55">${car(WHITE, RED, 6.4, -1.6, 0.62)}</g>${car(WHITE, RED, 0, 2.2, 0.86)}` },
  accident: { bg: RED, glyph: burst(WHITE) },
  roadworks: { bg: AMBER, glyph: cone(INK, AMBER) },
  hazard: { bg: AMBER, glyph: exclamation(INK) },
  closure: { bg: RED, glyph: bar(WHITE) },
  visibility: { bg: INK, glyph: fog(WHITE) },
};

function badge(bg: string, glyph: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE}" height="${BASE}" viewBox="0 0 56 56">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.6" flood-color="#000" flood-opacity="0.35"/></filter></defs>
  <circle cx="28" cy="28" r="24" fill="${WHITE}" filter="url(#s)"/>
  <circle cx="28" cy="28" r="21" fill="${bg}"/>
  <g transform="translate(13.6 13.6) scale(1.2)">${glyph}</g>
</svg>`;
}

const puck = `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE}" height="${BASE}" viewBox="0 0 56 56">
  <defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/></filter></defs>
  <circle cx="28" cy="28" r="20" fill="${WHITE}" filter="url(#s)"/>
  <circle cx="28" cy="28" r="17" fill="${INK}"/>
  <path d="M28 14.5 L37.5 38 L28 33 L18.5 38 Z" fill="${AMBER}" stroke="${AMBER}" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;

async function write(name: string, svg: string) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    await sharp(Buffer.from(svg), { density: 72 * scale })
      .resize(BASE * scale, BASE * scale)
      .png()
      .toFile(`${OUT}${name}${suffix}.png`);
  }
}

for (const [name, b] of Object.entries(badges)) await write(name, badge(b.bg, b.glyph));
await write('puck', puck);
console.log(`wrote ${Object.keys(badges).length + 1} icons to ${OUT}`);
