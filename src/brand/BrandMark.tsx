import { useI18n } from '../i18n/context.ts'
import './brand.css'

/** The Dwoggle logo: the mascot's head and the name. */
export function BrandMark() {
  const { t } = useI18n()
  return (
    <span className="brand-mark">
      <img className="brand-mark__head" src="/brand/dwoggle-head.png" alt="" width={198} height={177} />
      <span className="brand-mark__name">{t('app.title')}</span>
    </span>
  )
}
