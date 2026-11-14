import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/context.ts'
import { BrandMark } from '../brand/BrandMark.tsx'
import { LineIcon } from '../brand/LineIcon.tsx'
import { useI18n } from '../i18n/context.ts'
import { LANGS, isLang, type Lang } from '../i18n/i18n.ts'
import { ROUTES } from '../router.ts'
import { Link } from './Link.tsx'
import './MapHeader.css'

/** The languages on the header's switch, as drawn; the rest are in the settings. */
const QUICK_LANGS: readonly Lang[] = ['ky', 'ru', 'en']

/** The settings under the gear: every language, how the grades work, and the account. */
function SettingsMenu({ onGrading, onClose }: { onGrading: () => void; onClose: () => void }) {
  const { lang, setLang, t } = useI18n()
  const auth = useAuth()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  const confirmDelete = () => {
    if (!window.confirm(t('account.delete_confirm'))) return
    auth.deleteAccount().catch(() => window.alert(t('account.delete_failed')))
  }

  return (
    <div ref={ref} className="map-header__menu" role="dialog" aria-label={t('settings.title')}>
      <label className="map-header__menu-label" htmlFor="map-language">
        {t('settings.language')}
      </label>
      <select
        id="map-language"
        className="brand-input map-header__select"
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
      <button
        type="button"
        className="map-header__menu-item"
        onClick={() => {
          onClose()
          onGrading()
        }}
      >
        {t('header.how_we_grade')}
      </button>
      {auth.state.status === 'signedIn' ? (
        <>
          <p className="map-header__menu-note">{t('site.account', { name: auth.state.user.name ?? auth.state.user.email ?? '' })}</p>
          <button type="button" className="map-header__menu-item" onClick={() => void auth.signOut().catch(() => undefined)}>
            {t('site.sign_out')}
          </button>
          <button type="button" className="map-header__menu-item map-header__menu-item--quiet" onClick={confirmDelete}>
            {t('account.delete')}
          </button>
        </>
      ) : (
        <Link to={ROUTES.signIn} className="map-header__menu-item">
          {t('site.sign_in')}
        </Link>
      )}
    </div>
  )
}

/** The brown bar over the map, as drawn: account, logo, a quick language switch and the settings. */
export function MapHeader({ onGrading }: { onGrading: () => void }) {
  const { lang, setLang, t } = useI18n()
  const { state } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const quick = QUICK_LANGS.includes(lang) ? QUICK_LANGS : [...QUICK_LANGS, lang]

  return (
    <header className="map-header">
      {state.status === 'signedIn' ? (
        <button type="button" className="map-header__round" aria-label={t('account.open')} onClick={() => setMenuOpen(true)}>
          <LineIcon name="user" size={22} />
        </button>
      ) : (
        <Link to={ROUTES.signIn} className="map-header__round" aria-label={t('site.sign_in')}>
          <LineIcon name="user" size={22} />
        </Link>
      )}
      <BrandMark />
      <div className="map-header__end">
        <div className="map-header__langs" role="group" aria-label={t('settings.language')}>
          {quick.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              className="map-header__lang"
              aria-pressed={lang === code}
              title={t(`lang.${code}`)}
              onClick={() => setLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="map-header__settings">
          <button
            type="button"
            className="map-header__round map-header__round--small"
            aria-label={t('settings.title')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <LineIcon name="gear" size={20} />
          </button>
          {menuOpen && <SettingsMenu onGrading={onGrading} onClose={() => setMenuOpen(false)} />}
        </div>
      </div>
      <svg className="map-header__wave" viewBox="0 0 1280 18" preserveAspectRatio="none" aria-hidden="true">
        <path className="map-header__wave-fill" d="M0 0H1280V6C1100 14 980 2 820 8S520 16 360 9 120 3 0 10Z" />
        <path className="map-header__wave-line" d="M0 10C120 3 220 13 360 9S640 16 820 8 1100 14 1280 6" />
      </svg>
    </header>
  )
}
