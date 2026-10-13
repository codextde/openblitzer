import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { AppState, Platform } from 'react-native';

import { t } from '@/i18n';

const SOUNDS = {
  chime: require('../../assets/sounds/chime.wav'),
  beep: require('../../assets/sounds/beep.wav'),
  silence: require('../../assets/sounds/silence.wav'),
};

type Sound = keyof typeof SOUNDS;

const players: Partial<Record<Sound, AudioPlayer>> = {};
let audioReady: Promise<void> | null = null;

function prepareAudio() {
  if (!audioReady) {
    audioReady = setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {
      audioReady = null;
    });
  }
  return audioReady;
}

function player(sound: Sound) {
  let p = players[sound];
  if (!p) {
    p = createAudioPlayer(SOUNDS[sound], { keepAudioSessionActive: false });
    players[sound] = p;
  }
  return p;
}

export async function play(sound: Sound) {
  try {
    await prepareAudio();
    const p = player(sound);
    await p.seekTo(0);
    p.play();
  } catch {}
}

const CHIME_MS = 850;

export async function announce({ chime, text, lang }: { chime: boolean; text: string | null; lang: 'de' | 'en' }) {
  if (chime) await play('chime');
  if (!text) return;
  setTimeout(
    () => {
      Speech.stop()
        .catch(() => undefined)
        .finally(() => {
          Speech.speak(text, {
            language: lang === 'de' ? 'de-DE' : 'en-US',
            rate: Platform.OS === 'ios' ? 0.52 : 1,
            onDone: () => void play('silence'),
            onStopped: () => void play('silence'),
            onError: () => void play('silence'),
          });
        });
    },
    chime ? CHIME_MS : 0,
  );
}

export function vibrate(strong = false) {
  Haptics.notificationAsync(strong ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channel: Promise<void> | null = null;

function ensureChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channel) {
    channel = Notifications.setNotificationChannelAsync('warnings', {
      name: t('notify.channel'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      vibrationPattern: [0, 250, 120, 250],
    })
      .then(() => undefined)
      .catch(() => {
        channel = null;
      });
  }
  return channel;
}

export async function requestNotificationPermission() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return current.granted;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notifyBackground(title: string, body: string, tag: string) {
  if (AppState.currentState === 'active') return;
  try {
    await ensureChannel();
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    await Notifications.dismissNotificationAsync(tag).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: tag,
      content: { title, body, data: { url: '/' } },
      trigger: Platform.OS === 'android' ? { channelId: 'warnings' } : null,
    });
  } catch {}
}
