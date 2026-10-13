import '@/warn/task';

import { useFonts } from 'expo-font';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ensureFixed } from '@/data/fixed';
import { POLL_MS, refreshReports } from '@/data/reports';
import { useT } from '@/i18n';
import { SCREENSHOT_MODE } from '@/lib/demo-mode';
import { iconFonts, textFonts } from '@/lib/fonts';
import { useLive } from '@/store/live';
import { useSettings } from '@/store/settings';
import { useColors, useIsDark } from '@/theme';
import { resumeWarner } from '@/warn/session';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 250 });

export const unstable_settings = {
  anchor: '(tabs)',
};

async function pollReports() {
  const live = useLive.getState();
  if (live.demo || SCREENSHOT_MODE) return;
  let pos = live.fix;
  if (!pos) {
    const granted = await Location.getForegroundPermissionsAsync().then((p) => p.granted).catch(() => false);
    if (!granted) return;
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) pos = { lat: last.coords.latitude, lon: last.coords.longitude, speed: null, heading: null, accuracy: null, time: last.timestamp };
  }
  if (pos) await refreshReports(pos.lat, pos.lon);
}

function useAppLifecycle(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const foreground = () => {
      resumeWarner().catch(() => undefined);
      ensureFixed().catch(() => undefined);
      pollReports().catch(() => undefined);
      if (!timer) timer = setInterval(() => pollReports().catch(() => undefined), POLL_MS);
    };
    foreground();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') foreground();
      else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    const open = (response: Notifications.NotificationResponse | null) => {
      if (response) router.navigate('/');
    };
    const tapSub = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      sub.remove();
      tapSub.remove();
      if (timer) clearInterval(timer);
    };
  }, [enabled]);
}

function Navigator() {
  const onboarded = useSettings((s) => s.onboarded);
  const c = useColors();
  const dark = useIsDark();
  const { t } = useT();
  useAppLifecycle(onboarded);

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.accentStrong, background: c.background, card: c.background, text: c.text, border: c.border },
  };
  const pushed = {
    headerShown: true,
    headerTransparent: Platform.OS === 'ios',
    headerStyle: Platform.OS === 'android' ? { backgroundColor: c.background } : undefined,
    headerTintColor: c.text,
    headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: c.text },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, orientation: 'portrait_up', contentStyle: { backgroundColor: c.background } }}>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="report"
            options={{
              presentation: 'formSheet',
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              sheetAllowedDetents: 'fitToContents',
              contentStyle: { backgroundColor: c.background },
            }}
          />
          <Stack.Screen name="hud" options={{ presentation: 'fullScreenModal', animation: 'fade', orientation: 'all', contentStyle: { backgroundColor: '#000000' } }} />
          <Stack.Screen name="legal" options={{ ...pushed, title: t('settings.legal') }} />
          <Stack.Screen name="about" options={{ ...pushed, title: t('about.title') }} />
        </Stack.Protected>
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={SCREENSHOT_MODE}>
          <Stack.Screen name="demo" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ ...textFonts, ...iconFonts });
  const [hydrated, setHydrated] = useState(useSettings.persist.hasHydrated());
  const [timedOut, setTimedOut] = useState(false);
  const c = useColors();

  useEffect(() => {
    if (hydrated) return;
    const unsub = useSettings.persist.onFinishHydration(() => setHydrated(true));
    if (useSettings.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(id);
  }, []);

  const ready = ((loaded || !!error) && hydrated) || timedOut;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <Navigator />
    </GestureHandlerRootView>
  );
}
