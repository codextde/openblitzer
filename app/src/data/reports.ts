import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { distance } from '@/core/geo';
import type { Report } from '@/core/types';
import { syncStorage } from '@/store/settings';

import { ApiError, fetchReports, postVote } from './api';

type ReportsState = {
  reports: Report[];
  fetchedAt: number | null;
  center: { lat: number; lon: number } | null;
  error: 'offline' | 'server' | null;
  loading: boolean;
  own: string[];
  voted: Record<string, 'up' | 'down'>;
};

export const POLL_MS = 60000;
const MOVE_REFRESH_M = 10000;

export const useReports = create<ReportsState>()(
  persist(
    () => ({ reports: [], fetchedAt: null, center: null, error: null, loading: false, own: [], voted: {} }) as ReportsState,
    {
      name: 'reports',
      version: 1,
      storage: createJSONStorage(() => syncStorage),
      partialize: (s) => ({ reports: s.reports, fetchedAt: s.fetchedAt, center: s.center, own: s.own.slice(-200), voted: s.voted }),
    },
  ),
);

export function activeReports(list: Report[] = useReports.getState().reports, now = Date.now()) {
  return list.filter((r) => Date.parse(r.expiresAt) > now);
}

let inflight: Promise<void> | null = null;

export function refreshReports(lat: number, lon: number, force = false): Promise<void> {
  const { fetchedAt, center } = useReports.getState();
  const moved = !center || distance(center, { lat, lon }) > MOVE_REFRESH_M;
  if (!force && !moved && fetchedAt && Date.now() - fetchedAt < POLL_MS - 2000) return Promise.resolve();
  if (inflight) return inflight;
  useReports.setState({ loading: true });
  inflight = fetchReports(lat, lon, 50)
    .then((res) => {
      useReports.setState({ reports: res.reports ?? [], fetchedAt: Date.now(), center: { lat, lon }, error: null });
    })
    .catch((error) => {
      useReports.setState((s) => ({ error: error instanceof ApiError && error.offline ? 'offline' : 'server', reports: activeReports(s.reports) }));
    })
    .finally(() => {
      inflight = null;
      useReports.setState({ loading: false });
    });
  return inflight;
}

export function addOwnReport(report: Report) {
  useReports.setState((s) => ({
    own: s.own.includes(report.id) ? s.own : [...s.own, report.id],
    reports: [report, ...s.reports.filter((r) => r.id !== report.id)],
  }));
}

export async function vote(id: string, value: 'up' | 'down') {
  useReports.setState((s) => ({ voted: { ...s.voted, [id]: value } }));
  const res = await postVote(id, value);
  useReports.setState((s) => ({
    reports: res.report ? s.reports.map((r) => (r.id === id ? res.report! : r)) : s.reports.filter((r) => r.id !== id),
  }));
  return res;
}
