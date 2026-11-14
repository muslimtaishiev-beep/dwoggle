import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18nContextValue } from './context.ts'
import { browserLang, formatNumber, isLang, translate, type Lang } from './i18n.ts'

const STORAGE_KEY = 'dwoggle.lang'

/** The language chosen on this device before, or else the browser's. A signed-in profile overrides it. */
function initialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    // Storage can be unavailable (private mode).
  }
  return browserLang()
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'app.title')
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this visit only.
    }
  }, [lang])

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      formatNumber: (n, options) => formatNumber(lang, n, options),
    }),
    [lang],
  )

  return <I18nContext value={value}>{children}</I18nContext>
}
