import { create } from 'zustand';

import type { Alert, Section } from '@/core/engine';
import type { Fix, Poi, Report, ReportType } from '@/core/types';

export type Toast = { id: number; message: string; tone: 'info' | 'good' | 'danger'; action?: { label: string; run: () => void }; until: number };

export type PendingReport = { id: number; type: ReportType; fix: Fix; sendAt: number };

type LiveState = {
  running: boolean;
  demo: boolean;
  fix: Fix | null;
  speedKmh: number | null;
  heading: number | null;
  alerts: Alert[];
  primary: Alert | null;
  overspeed: { limit: number; speed: number } | null;
  section: Section | null;
  confirm: { poi: Poi; until: number } | null;
  toast: Toast | null;
  pending: PendingReport | null;
  focus: { lat: number; lon: number; at: number; zoom?: number } | null;
  demoReports: Report[];
  demoOwn: string[];
  locationDenied: boolean;
};

export const useLive = create<LiveState>(() => ({
  running: false,
  demo: false,
  fix: null,
  speedKmh: null,
  heading: null,
  alerts: [],
  primary: null,
  overspeed: null,
  section: null,
  confirm: null,
  toast: null,
  pending: null,
  focus: null,
  demoReports: [],
  demoOwn: [],
  locationDenied: false,
}));

let toastId = 0;

export function showToast(message: string, tone: Toast['tone'] = 'info', action?: Toast['action'], ms = 3500) {
  const id = ++toastId;
  useLive.setState({ toast: { id, message, tone, action, until: Date.now() + ms } });
  setTimeout(() => {
    if (useLive.getState().toast?.id === id) useLive.setState({ toast: null });
  }, ms);
  return id;
}

export function hideToast(id?: number) {
  if (id == null || useLive.getState().toast?.id === id) useLive.setState({ toast: null });
}
