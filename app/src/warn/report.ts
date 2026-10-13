import type { Poi, ReportType } from '@/core/types';
import { ApiError, postReport } from '@/data/api';
import { addOwnReport, vote } from '@/data/reports';
import { t } from '@/i18n';
import { hideToast, showToast, useLive } from '@/store/live';

import { addDemoReport, voteDemo } from './session';

export const UNDO_MS = 5000;

let nextId = 0;

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.rateLimited) return t('report.rateLimited', { min: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) });
  if (error instanceof ApiError && error.offline) return t('report.offline');
  return t('report.failed');
}

export function queueReport(type: ReportType) {
  const { fix } = useLive.getState();
  if (!fix) {
    showToast(t('report.needLocation'), 'danger');
    return false;
  }
  const id = ++nextId;
  useLive.setState({ pending: { id, type, fix, sendAt: Date.now() + UNDO_MS } });
  const toast = showToast(t('report.pending', { type: t(`types.${type}`) }), 'info', { label: t('common.undo'), run: () => cancelReport(id) }, UNDO_MS);
  setTimeout(() => {
    hideToast(toast);
    send(id);
  }, UNDO_MS);
  return true;
}

export function cancelReport(id: number) {
  if (useLive.getState().pending?.id !== id) return;
  useLive.setState({ pending: null });
  showToast(t('report.undone'));
}

async function send(id: number) {
  const pending = useLive.getState().pending;
  if (!pending || pending.id !== id) return;
  useLive.setState({ pending: null });
  const { type, fix } = pending;
  const label = t(`types.${type}`);
  if (useLive.getState().demo) {
    const now = new Date();
    addDemoReport({
      id: `demo-own-${id}`,
      type,
      lat: fix.lat,
      lon: fix.lon,
      heading: fix.heading != null ? Math.round(fix.heading) : null,
      maxspeed: null,
      createdAt: now.toISOString(),
      confirmedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
      up: 1,
      down: 0,
    });
    showToast(t('report.sent', { type: label }), 'good');
    return;
  }
  try {
    const res = await postReport({ type, lat: fix.lat, lon: fix.lon, heading: fix.heading, speed: fix.speed });
    addOwnReport(res.report);
    showToast(res.merged ? t('report.merged') : t('report.sent', { type: label }), 'good');
  } catch (error) {
    showToast(errorMessage(error), 'danger', undefined, 5000);
  }
}

export async function answerConfirm(poi: Poi, still: boolean) {
  useLive.setState({ confirm: null });
  if (useLive.getState().demo) {
    voteDemo(poi.id, still ? 'up' : 'down');
    showToast(t('confirm.thanks'), 'good', undefined, 2500);
    return;
  }
  try {
    await vote(poi.id, still ? 'up' : 'down');
    showToast(t('confirm.thanks'), 'good', undefined, 2500);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return;
    showToast(errorMessage(error), 'danger');
  }
}
