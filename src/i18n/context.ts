import { createContext, use } from 'react'
import type { Lang, MessageKey, MessageParams } from './i18n.ts'

export interface I18nContextValue {
  readonly lang: Lang
  readonly setLang: (lang: Lang) => void
  readonly t: (key: MessageKey, params?: MessageParams) => string
  readonly formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const value = use(I18nContext)
  if (value === null) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
