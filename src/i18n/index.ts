import { useCallback } from 'react'
import { en, type Dict } from './en'
import { ar } from './ar'
import type { L10n, Lang } from '../domain/types'
import { useAppStore } from '../store/useAppStore'

export const dictionaries: Record<Lang, Dict> = { en, ar }

type DotPath<T> = {
  [K in keyof T & (string | number)]: T[K] extends string ? `${K}` : `${K}.${DotPath<T[K]>}`
}[keyof T & (string | number)]

export type TKey = DotPath<Dict>
export type Vars = Record<string, string | number>

export function translate(lang: Lang, key: TKey, vars?: Vars): string {
  let node: unknown = dictionaries[lang]
  for (const part of key.split('.')) node = (node as Record<string, unknown>)?.[part]
  if (typeof node !== 'string') return key
  return vars ? node.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : node
}

const pluralRules: Record<Lang, Intl.PluralRules> = { en: new Intl.PluralRules('en'), ar: new Intl.PluralRules('ar') }

/** CLDR plural category for n (Arabic distinguishes zero, one, two, few, many, other). */
export const pluralCategory = (lang: Lang, n: number) =>
  (n === 0 ? 'zero' : pluralRules[lang].select(n)) as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

export function useT() {
  const lang = useAppStore(s => s.lang)
  const t = useCallback((key: TKey, vars?: Vars) => translate(lang, key, vars), [lang])
  const l = useCallback((v: L10n) => v[lang], [lang])
  return { t, l, lang, dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr' }
}
