import { useAuth } from '../auth/context.ts'
import { useI18n } from '../i18n/context.ts'
import { ROUTES } from '../router.ts'
import { Link } from './Link.tsx'
import { BrandMark } from '../brand/BrandMark.tsx'
import { LanguageMenu } from './LanguageMenu.tsx'
import './SiteHeader.css'

interface SiteHeaderProps {
  /** Hide the sign-in link, e.g. on the sign-in page itself. */
  quiet?: boolean
}

/** The header of the landing, sign-in and welcome pages: wordmark, language, account. */
export function SiteHeader({ quiet = false }: SiteHeaderProps) {
  const { t } = useI18n()
  const { state, signOut, deleteAccount } = useAuth()

  // Deleting removes the profile (phone number included) and the sign-in account; the browser asks first.
  const confirmDelete = () => {
    if (!window.confirm(t('account.delete_confirm'))) return
    deleteAccount().catch(() => window.alert(t('account.delete_failed')))
  }

  return (
    <header className="site-header">
      <Link to={ROUTES.landing} className="site-header__wordmark plate" aria-label={t('site.home')}>
        <BrandMark />
      </Link>
      <div className="site-header__actions">
        <LanguageMenu />
        {state.status === 'signedIn' && (
          <button
            type="button"
            className="button button--small"
            title={t('site.account', { name: state.user.name ?? state.user.email ?? '' })}
            onClick={() => void signOut().catch(() => undefined)}
          >
            {t('site.sign_out')}
          </button>
        )}
        {state.status === 'signedIn' && (
          <button type="button" className="button button--small button--quiet" onClick={confirmDelete}>
            {t('account.delete')}
          </button>
        )}
        {state.status === 'signedOut' && !quiet && (
          <Link to={ROUTES.signIn} className="button button--small">
            {t('site.sign_in')}
          </Link>
        )}
      </div>
    </header>
  )
}
