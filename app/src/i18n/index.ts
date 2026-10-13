import { getLocales } from 'expo-localization';

import type { Lang } from '@/core/types';
import { type LanguagePref, useSettings } from '@/store/settings';

import { de, type Dict } from './de';
import { en } from './en';

const dicts: Record<Lang, Dict> = { de, en };

type Path<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Key = Path<Dict>;

export function systemLang(): Lang {
  const code = getLocales()[0]?.languageCode ?? 'de';
  return code === 'de' ? 'de' : 'en';
}

export function resolveLang(pref: LanguagePref): Lang {
  return pref === 'system' ? systemLang() : pref;
}

export function currentLang(): Lang {
  return resolveLang(useSettings.getState().language);
}

function lookup(dict: Dict, key: string): string {
  let node: unknown = dict;
  for (const part of key.split('.')) node = (node as Record<string, unknown>)?.[part];
  return typeof node === 'string' ? node : key;
}

export function translate(lang: Lang, key: Key | string, vars?: Record<string, string | number>) {
  let text = lookup(dicts[lang], key);
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

export function t(key: Key | string, vars?: Record<string, string | number>) {
  return translate(currentLang(), key, vars);
}

export function useT() {
  const pref = useSettings((s) => s.language);
  const lang = resolveLang(pref);
  return { t: (key: Key | string, vars?: Record<string, string | number>) => translate(lang, key, vars), lang };
}
