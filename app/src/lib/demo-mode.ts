import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import { useEffect } from 'react';

export const SCREENSHOT_MODE = process.env.EXPO_PUBLIC_SCREENSHOTS === '1';

// Screenshot builds take "<nonce>|<demo query>" from Documents/shot.txt, so automation needs no deep-link prompt.
export function useShotCommands(enabled: boolean) {
  useEffect(() => {
    if (!SCREENSHOT_MODE || !enabled) return;
    let last = '';
    const id = setInterval(() => {
      try {
        const f = new File(Paths.document, 'shot.txt');
        if (!f.exists) return;
        const cmd = f.textSync().trim();
        if (!cmd || cmd === last) return;
        last = cmd;
        router.push(`/demo?${cmd.split('|').slice(1).join('|')}`);
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [enabled]);
}
