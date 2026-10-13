import { FIXED_KINDS, type FixedDataset, type FixedKind, type Poi } from './types';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function decodeRow(row: unknown): Poi | null {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [id, lat, lon, kind, maxspeed, direction] = row;
  if (typeof id !== 'string' || !finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (!FIXED_KINDS.includes(kind as FixedKind)) return null;
  return {
    id,
    lat,
    lon,
    type: kind as FixedKind,
    maxspeed: finite(maxspeed) && maxspeed > 0 ? maxspeed : null,
    direction: finite(direction) ? ((direction % 360) + 360) % 360 : null,
    report: false,
  };
}

export function decodeDataset(data: unknown): { version: string; generatedAt: string; cameras: Poi[] } {
  const d = data as Partial<FixedDataset> | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.cameras)) throw new Error('invalid dataset');
  const cameras: Poi[] = [];
  for (const row of d.cameras) {
    const poi = decodeRow(row);
    if (poi) cameras.push(poi);
  }
  return { version: String(d.version ?? ''), generatedAt: String(d.generatedAt ?? ''), cameras };
}

export function sectionKey(id: string) {
  return id.replace(/:[se]$/, '');
}
