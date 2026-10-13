import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { ingest, toFix, WARN_TASK } from './session';

TaskManager.defineTask(WARN_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  if (locations.length) await ingest(locations.map(toFix), 'gps');
});
