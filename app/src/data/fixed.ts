import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { decodeDataset } from '@/core/dataset';
import { Grid } from '@/core/grid';
import type { Poi } from '@/core/types';
import { iconFor } from '@/lib/poi';
import { syncStorage } from '@/store/settings';

import { ApiError, fetchFixed } from './api';

type Meta = { version: string; generatedAt: string; etag: string | null; count: number; checkedAt: number };

type FixedState = {
  status: 'idle' | 'loading' | 'ready' | 'empty';
  updating: boolean;
  error: 'offline' | 'server' | null;
  count: number;
  version: string | null;
  generatedAt: string | null;
  checkedAt: number | null;
  geojson: string | null;
};

const META_KEY = 'fixed-meta';
const STALE_MS = 24 * 3600000;

function readMeta(): Meta | null {
  try {
    const raw = syncStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as Meta) : null;
  } catch {
    return null;
  }
}

const initial = readMeta();

export const useFixed = create<FixedState>(() => ({
  status: 'idle',
  updating: false,
  error: null,
  count: initial?.count ?? 0,
  version: initial?.version ?? null,
  generatedAt: initial?.generatedAt ?? null,
  checkedAt: initial?.checkedAt ?? null,
  geojson: null,
}));

let grid: Grid<Poi> = new Grid();
let loading: Promise<void> | null = null;
let updating: Promise<boolean> | null = null;

const file = () => new File(Paths.document, 'fixed.json');

export function fixedGrid() {
  return grid;
}

// Serialized once per dataset: the map gets the same string on every render, so MapLibre clusters all cameras natively.
function toGeoJSON(cameras: Poi[]) {
  const features = cameras.map((c) => `{"type":"Feature","geometry":{"type":"Point","coordinates":[${c.lon},${c.lat}]},"properties":{"icon":"${iconFor(c.type)}"}}`);
  return `{"type":"FeatureCollection","features":[${features.join(',')}]}`;
}

function apply(text: string) {
  const ds = decodeDataset(JSON.parse(text));
  grid = new Grid(ds.cameras);
  useFixed.setState({ geojson: toGeoJSON(ds.cameras) });
  return ds;
}

export function loadFixed(): Promise<void> {
  if (useFixed.getState().status === 'ready') return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      useFixed.setState({ status: 'loading' });
      try {
        const f = file();
        if (f.exists) {
          const ds = apply(await f.text());
          useFixed.setState({ status: grid.size > 0 ? 'ready' : 'empty', count: grid.size, version: ds.version, generatedAt: ds.generatedAt });
          return;
        }
      } catch {}
      useFixed.setState({ status: 'empty' });
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

export function updateFixed(): Promise<boolean> {
  if (!updating) {
    updating = (async () => {
      useFixed.setState({ updating: true, error: null });
      const meta = readMeta();
      try {
        const known = grid.size > 0 ? (meta?.etag ?? null) : null;
        const res = await fetchFixed(known);
        const checkedAt = Date.now();
        if (res.notModified) {
          syncStorage.setItem(META_KEY, JSON.stringify({ ...meta, checkedAt }));
          useFixed.setState({ checkedAt });
          return true;
        }
        const ds = apply(res.text);
        file().write(res.text);
        const next: Meta = { version: ds.version, generatedAt: ds.generatedAt, etag: res.etag, count: grid.size, checkedAt };
        syncStorage.setItem(META_KEY, JSON.stringify(next));
        useFixed.setState({ status: grid.size > 0 ? 'ready' : 'empty', count: grid.size, version: ds.version, generatedAt: ds.generatedAt, checkedAt });
        return true;
      } catch (error) {
        useFixed.setState({ error: error instanceof ApiError && error.offline ? 'offline' : 'server' });
        return false;
      } finally {
        useFixed.setState({ updating: false });
      }
    })().finally(() => {
      updating = null;
    });
  }
  return updating;
}

export async function ensureFixed() {
  await loadFixed();
  const { checkedAt, status } = useFixed.getState();
  if (status !== 'ready' || !checkedAt || Date.now() - checkedAt > STALE_MS) await updateFixed();
}
