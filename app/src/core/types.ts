export type FixedKind = 'speed' | 'redlight' | 'speed_redlight' | 'section_start' | 'section_end';

export type ReportType = 'mobile_camera' | 'fixed_camera' | 'traffic_jam' | 'accident' | 'roadworks' | 'hazard' | 'closure' | 'visibility';

export type PoiType = FixedKind | ReportType;

export type FixedRow = [string, number, number, FixedKind, number | null, number | null];

export type FixedDataset = {
  version: string;
  generatedAt: string;
  attribution: string;
  cameras: FixedRow[];
};

export type Report = {
  id: string;
  type: ReportType;
  lat: number;
  lon: number;
  heading: number | null;
  maxspeed: number | null;
  createdAt: string;
  confirmedAt: string;
  expiresAt: string;
  up: number;
  down: number;
};

export type Poi = {
  id: string;
  lat: number;
  lon: number;
  type: PoiType;
  maxspeed: number | null;
  direction: number | null;
  report: boolean;
  own?: boolean;
};

export type Fix = {
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  time: number;
};

export type Category = 'fixed' | 'redlight' | 'section' | 'mobile' | 'traffic';

export type Units = 'kmh' | 'mph';

export type Lang = 'de' | 'en';

export const REPORT_TYPES: ReportType[] = ['mobile_camera', 'traffic_jam', 'accident', 'roadworks', 'hazard', 'closure', 'visibility', 'fixed_camera'];

export const FIXED_KINDS: FixedKind[] = ['speed', 'redlight', 'speed_redlight', 'section_start', 'section_end'];

export function categoriesOf(type: PoiType): Category[] {
  switch (type) {
    case 'speed':
    case 'fixed_camera':
      return ['fixed'];
    case 'redlight':
      return ['redlight'];
    case 'speed_redlight':
      return ['fixed', 'redlight'];
    case 'section_start':
    case 'section_end':
      return ['section'];
    case 'mobile_camera':
      return ['mobile'];
    default:
      return ['traffic'];
  }
}

export function isCamera(type: PoiType) {
  return type !== 'traffic_jam' && type !== 'accident' && type !== 'roadworks' && type !== 'hazard' && type !== 'closure' && type !== 'visibility';
}

export function reportToPoi(r: Report, own = false): Poi {
  return { id: r.id, lat: r.lat, lon: r.lon, type: r.type, maxspeed: r.maxspeed, direction: r.heading, report: true, own };
}
