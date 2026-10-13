import { Camera, type CameraRef, GeoJSONSource, Images, Layer, Map, type ViewPadding } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';

import { demoCameras } from '@/core/demo';
import type { Report } from '@/core/types';
import { useFixed } from '@/data/fixed';
import { activeReports, useReports } from '@/data/reports';
import { iconFor, POI_IMAGES } from '@/lib/poi';
import { useLive } from '@/store/live';
import { useMapDark } from '@/theme';

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
const GERMANY: [number, number] = [10.45, 51.16];

const point = (lon: number, lat: number, properties: Record<string, unknown>, id?: string): GeoJSON.Feature<GeoJSON.Point> => ({
  type: 'Feature',
  id,
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties,
});

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

export function DriveMap({ follow, onUserMove, padding }: { follow: boolean; onUserMove: () => void; padding: ViewPadding }) {
  const dark = useMapDark();
  const camera = useRef<CameraRef>(null);
  const fix = useLive((s) => s.fix);
  const heading = useLive((s) => s.heading);
  const running = useLive((s) => s.running);
  const demo = useLive((s) => s.demo);
  const speed = useLive((s) => s.speedKmh);
  const primary = useLive((s) => s.primary);
  const focus = useLive((s) => s.focus);
  const demoReports = useLive((s) => s.demoReports);
  const serverReports = useReports((s) => s.reports);
  const geojson = useFixed((s) => s.geojson);

  const cameras = useMemo(
    () => (demo ? collection(demoCameras().map((c) => point(c.lon, c.lat, { icon: iconFor(c.type) }, c.id))) : (geojson ?? collection([]))),
    [demo, geojson],
  );

  const reports = useMemo(() => {
    const list: Report[] = activeReports(demo ? demoReports : serverReports);
    return collection(list.map((r) => point(r.lon, r.lat, { icon: iconFor(r.type) }, r.id)));
  }, [demo, demoReports, serverReports]);

  const active = useMemo(() => collection(primary ? [point(primary.poi.lon, primary.poi.lat, { danger: primary.poi.report ? 1 : 0 })] : []), [primary]);

  const me = useMemo(() => collection(fix ? [point(fix.lon, fix.lat, { heading: heading ?? 0 })] : []), [fix, heading]);

  useEffect(() => {
    if (!focus) return;
    camera.current?.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom ?? 15, bearing: 0, pitch: 0, duration: 900 });
  }, [focus]);

  const driving = running && (speed ?? 0) >= 5;
  const zoom = (speed ?? 0) > 100 ? 14.6 : (speed ?? 0) > 70 ? 15.4 : 16.2;
  const followProps =
    follow && fix
      ? {
          center: [fix.lon, fix.lat] as [number, number],
          zoom: driving ? zoom : 15.5,
          bearing: driving && heading != null ? heading : 0,
          pitch: driving ? 35 : 0,
          padding: driving ? padding : { top: 110, bottom: padding.bottom ?? 0, left: 0, right: 0 },
          duration: 1000,
          easing: 'linear' as const,
        }
      : {};

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={dark ? STYLE_DARK : STYLE_LIGHT}
      attribution={false}
      logo={false}
      compass={false}
      scaleBar={false}
      touchPitch={false}
      onRegionWillChange={(e) => {
        if (e.nativeEvent.userInteraction) onUserMove();
      }}>
      <Camera ref={camera} initialViewState={{ center: GERMANY, zoom: 5.2 }} minZoom={3} maxZoom={19} {...followProps} />
      <Images images={POI_IMAGES} />
      <GeoJSONSource id="active" data={active}>
        <Layer
          type="circle"
          id="active-ring"
          paint={{
            'circle-radius': 30,
            'circle-color': ['case', ['==', ['get', 'danger'], 1], 'rgba(255,59,48,0.22)', 'rgba(255,184,0,0.28)'],
            'circle-stroke-color': ['case', ['==', ['get', 'danger'], 1], '#FF3B30', '#FFB800'],
            'circle-stroke-width': 2.5,
            'circle-pitch-alignment': 'map',
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="cameras" data={cameras} cluster clusterRadius={46} clusterMaxZoom={11}>
        <Layer
          type="circle"
          id="camera-clusters"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': '#0B0D10',
            'circle-radius': ['step', ['get', 'point_count'], 15, 20, 19, 100, 24],
            'circle-stroke-color': '#FFB800',
            'circle-stroke-width': 2.5,
          }}
        />
        <Layer
          type="symbol"
          id="camera-cluster-count"
          filter={['has', 'point_count']}
          layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }}
          paint={{ 'text-color': '#FFFFFF' }}
        />
        <Layer
          type="symbol"
          id="camera-icons"
          filter={['!', ['has', 'point_count']]}
          layout={{ 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.42, 15, 0.62], 'icon-allow-overlap': true, 'icon-pitch-alignment': 'viewport' }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="reports" data={reports}>
        <Layer
          type="symbol"
          id="report-icons"
          layout={{ 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.46, 15, 0.7], 'icon-allow-overlap': true, 'icon-pitch-alignment': 'viewport' }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="me" data={me}>
        <Layer
          type="symbol"
          id="me-puck"
          layout={{
            'icon-image': 'puck',
            'icon-size': 0.78,
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      </GeoJSONSource>
    </Map>
  );
}
