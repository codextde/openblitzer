const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) % 360;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function boundingBox(lat: number, lon: number, meters: number) {
  const dLat = meters / 111_320;
  const cos = Math.cos(rad(lat));
  const dLon = cos > 1e-6 ? meters / (111_320 * cos) : 360;
  const wraps = lon - dLon < -180 || lon + dLon > 180;
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: wraps ? -180 : lon - dLon,
    maxLon: wraps ? 180 : lon + dLon,
  };
}

export const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
