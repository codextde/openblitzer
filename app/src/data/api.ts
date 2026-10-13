import { getRandomBytes } from 'expo-crypto';

import type { Report, ReportType } from '@/core/types';
import { syncStorage } from '@/store/settings';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.openblitzer.codext.de').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter: number | null = null,
  ) {
    super(message);
  }

  get offline() {
    return this.status === 0;
  }

  get rateLimited() {
    return this.status === 429;
  }
}

let device: string | null = null;

export function deviceId() {
  if (device) return device;
  let id = syncStorage.getItem('device-id');
  if (!id || !/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
    id = Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
    syncStorage.setItem('device-id', id);
  }
  device = id;
  return id;
}

async function request(path: string, init: RequestInit = {}, timeout = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'offline');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After'));
    throw new ApiError(429, 'rate limited', Number.isFinite(retry) && retry > 0 ? retry : 60);
  }
  if (!res.ok && res.status !== 304) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {}
    throw new ApiError(res.status, message);
  }
  return res;
}

export async function fetchFixed(etag: string | null): Promise<{ notModified: true } | { notModified: false; etag: string | null; text: string }> {
  const res = await request('/v1/fixed', { headers: etag ? { 'If-None-Match': etag } : {} }, 120000);
  if (res.status === 304) return { notModified: true };
  const text = await res.text();
  return { notModified: false, etag: res.headers.get('ETag'), text };
}

export async function fetchReports(lat: number, lon: number, radiusKm = 50): Promise<{ now: string; reports: Report[] }> {
  const res = await request(`/v1/reports?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&radius=${radiusKm}`);
  return (await res.json()) as { now: string; reports: Report[] };
}

export type NewReport = { type: ReportType; lat: number; lon: number; heading?: number | null; speed?: number | null; maxspeed?: number | null };

export async function postReport(body: NewReport): Promise<{ report: Report; merged: boolean; promoted?: string }> {
  const payload = {
    type: body.type,
    lat: Number(body.lat.toFixed(6)),
    lon: Number(body.lon.toFixed(6)),
    heading: body.heading != null ? Math.round(((body.heading % 360) + 360) % 360) % 360 : undefined,
    speed: body.speed != null && body.speed >= 0 ? Math.round(body.speed * 10) / 10 : undefined,
    maxspeed: body.maxspeed ?? undefined,
    device: deviceId(),
  };
  const res = await request('/v1/reports', { method: 'POST', body: JSON.stringify(payload) });
  return (await res.json()) as { report: Report; merged: boolean; promoted?: string };
}

export async function postVote(id: string, vote: 'up' | 'down'): Promise<{ report: Report | null; promoted?: string }> {
  const res = await request(`/v1/reports/${encodeURIComponent(id)}/votes`, { method: 'POST', body: JSON.stringify({ vote, device: deviceId() }) });
  return (await res.json()) as { report: Report | null; promoted?: string };
}
