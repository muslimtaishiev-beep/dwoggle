import { useI18n } from '../i18n/context.ts'
import { isLang, LANGS } from '../i18n/i18n.ts'
import './LanguageMenu.css'

/**
 * The language menu of the landing page and the map, for visitors without an account.
 * A signed-in visitor's language comes from the first question of the dig.
 */
export function LanguageMenu() {
  const { lang, setLang, t } = useI18n()
  return (
    <label className="language-menu">
      <span className="visually-hidden">{t('lang.switch_label')}</span>
      <svg className="language-menu__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
      </svg>
      <select
        className="language-menu__select"
        value={lang}
        onChange={(event) => {
          if (isLang(event.target.value)) setLang(event.target.value)
        }}
      >
        {LANGS.map((code) => (
          <option key={code} value={code} lang={code}>
            {t(`lang.${code}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
