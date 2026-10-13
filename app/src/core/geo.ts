const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type LatLon = { lat: number; lon: number };

export function distance(a: LatLon, b: LatLon) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a: LatLon, b: LatLon) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return normalize(deg(Math.atan2(y, x)));
}

export function normalize(d: number) {
  return ((d % 360) + 360) % 360;
}

export function angleDiff(a: number, b: number) {
  const d = Math.abs(normalize(a) - normalize(b));
  return d > 180 ? 360 - d : d;
}

export function destination(a: LatLon, bearingDeg: number, meters: number): LatLon {
  const d = meters / R;
  const b = rad(bearingDeg);
  const lat1 = rad(a.lat);
  const lon1 = rad(a.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lon: ((deg(lon2) + 540) % 360) - 180 };
}

export function pathLength(points: LatLon[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
}

export function pointAlong(points: LatLon[], meters: number): { point: LatLon; heading: number; done: boolean } {
  let left = Math.max(0, meters);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = distance(a, b);
    if (left <= seg || i === points.length - 1) {
      const heading = bearing(a, b);
      if (left > seg) return { point: b, heading, done: true };
      return { point: destination(a, heading, left), heading, done: false };
    }
    left -= seg;
  }
  return { point: points[0], heading: 0, done: true };
}
