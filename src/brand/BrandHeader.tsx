import { Link } from '../components/Link.tsx'
import { useI18n } from '../i18n/context.ts'
import { ROUTES } from '../router.ts'
import { BrandMark } from './BrandMark.tsx'
import './brand.css'

/**
 * The header of the sign-in page and the dig: just the logo. These pages follow the browser's language,
 * and the dig asks for the language as its first question.
 */
export function BrandHeader() {
  const { t } = useI18n()
  return (
    <header className="brand-header">
      <Link to={ROUTES.landing} className="brand-header__home" aria-label={t('site.home')}>
        <BrandMark />
      </Link>
    </header>
  )
}
