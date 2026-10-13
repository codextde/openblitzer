import { distance } from './geo';

export const CELL = 0.05;

type Point = { lat: number; lon: number };

const key = (x: number, y: number) => x * 100000 + y;
const cellOf = (v: number) => Math.floor(v / CELL);

export class Grid<T extends Point> {
  private cells = new Map<number, T[]>();
  size = 0;

  constructor(items: Iterable<T> = []) {
    for (const item of items) this.insert(item);
  }

  insert(item: T) {
    const k = key(cellOf(item.lat), cellOf(item.lon));
    const list = this.cells.get(k);
    if (list) list.push(item);
    else this.cells.set(k, [item]);
    this.size++;
  }

  inBounds(south: number, west: number, north: number, east: number, limit = Infinity): T[] {
    const out: T[] = [];
    for (let y = cellOf(south); y <= cellOf(north); y++) {
      for (let x = cellOf(west); x <= cellOf(east); x++) {
        const list = this.cells.get(key(y, x));
        if (!list) continue;
        for (const item of list) {
          if (item.lat >= south && item.lat <= north && item.lon >= west && item.lon <= east) {
            out.push(item);
            if (out.length >= limit) return out;
          }
        }
      }
    }
    return out;
  }

  near(lat: number, lon: number, radius: number): T[] {
    const dLat = radius / 111320;
    const dLon = radius / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
    const center = { lat, lon };
    return this.inBounds(lat - dLat, lon - dLon, lat + dLat, lon + dLon).filter((item) => distance(center, item) <= radius);
  }
}
