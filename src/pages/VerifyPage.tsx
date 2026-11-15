import { useEffect, useState } from 'react'
import { checkReport, ReportError, reportIdOf, verifyUrl, type ReportCheck } from '../api/reportsApi.ts'
import { useAuth } from '../auth/context.ts'
import { BrandHeader } from '../brand/BrandHeader.tsx'
import { StateMessage } from '../components/StateMessage.tsx'
import { useI18n } from '../i18n/context.ts'
import { PANEL_ORDER } from '../report/facts.ts'
import { buildReportPdf } from '../report/pdf/buildReportPdf.ts'
import './VerifyPage.css'

type Found =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ok'; readonly report: ReportCheck }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed' }

/**
 * Where a printed report's QR code leads: anyone can see that Dwoggle made a report under this number, when, for
 * which place and with which grades, and compare it with the paper. Its owner can download the PDF again.
 */
export function VerifyPage({ path }: { path: string }) {
  const i18n = useI18n()
  const { t, lang, formatNumber } = i18n
  const { state, idToken } = useAuth()
  const id = reportIdOf(path)
  const [found, setFound] = useState<Found>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)
  const settled = state.status !== 'loading'
  const signedIn = state.status === 'signedIn'

  useEffect(() => {
    // Wait for Firebase: the owner's token brings the data for downloading again.
    if (!settled) return
    let gone = false
    if (id === null) {
      queueMicrotask(() => setFound({ kind: 'missing' }))
      return
    }
    ;(signedIn ? idToken().catch(() => null) : Promise.resolve(null))
      .then((token) => checkReport(id, token))
      .then((report) => !gone && setFound({ kind: 'ok', report }))
      .catch((error: unknown) => {
        if (gone) return
        setFound({ kind: error instanceof ReportError && error.code === 'not_found' ? 'missing' : 'failed' })
      })
    return () => {
      gone = true
    }
  }, [id, settled, signedIn, idToken])

  const download = async (report: ReportCheck) => {
    if (report.record === null) return
    setSaving(true)
    try {
      const pdf = await buildReportPdf(report.record, i18n, verifyUrl(report.id))
      await pdf.download(`Dwoggle-${report.id}.pdf`)
    } finally {
      setSaving(false)
    }
  }

  const coordinate = (value: number) => formatNumber(value, { minimumFractionDigits: 5, maximumFractionDigits: 5 })

  return (
    <div className="brand-page verify-page">
      <BrandHeader />
      <main className="verify-page__main">
        <h1 className="verify-page__title brand-display">{t('verify.title')}</h1>
        {found.kind === 'loading' && <StateMessage kind="loading" message={t('site.loading')} />}
        {found.kind === 'failed' && <StateMessage kind="error" message={t('verify.failed')} />}
        {found.kind === 'missing' && (
          <p className="verify-page__verdict verify-page__verdict--missing" role="alert">
            {t('verify.missing')}
          </p>
        )}
        {found.kind === 'ok' && (
          <>
            <p className="verify-page__verdict verify-page__verdict--ok" role="status">
              {t('verify.ok')}
            </p>
            <dl className="verify-page__facts">
              <dt>{t('verify.number')}</dt>
              <dd className="verify-page__number">{found.report.id}</dd>
              <dt>{t('verify.made')}</dt>
              <dd>
                {found.report.createdAt
                  ? new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(found.report.createdAt))
                  : '–'}
              </dd>
              <dt>{t('pdf.place')}</dt>
              <dd>{found.report.place ?? t('pdf.no_place')}</dd>
              <dt>{t('pdf.coordinates')}</dt>
              <dd>
                {coordinate(found.report.lat)}, {coordinate(found.report.lon)}
              </dd>
              <dt>{t('verify.grades')}</dt>
              <dd>
                <ul className="verify-page__grades">
                  {PANEL_ORDER.filter((check) => check in found.report.grades).map((check) => {
                    const grade = found.report.grades[check] ?? null
                    return (
                      <li key={check}>
                        <span>{t(`check.${check}`)}</span>
                        <span className={`verify-page__grade verify-page__grade--${grade?.toLowerCase() ?? 'none'}`}>{grade ?? '–'}</span>
                      </li>
                    )
                  })}
                </ul>
              </dd>
              <dt>{t('pdf.fingerprint')}</dt>
              <dd className="verify-page__fingerprint">{found.report.fingerprint}</dd>
            </dl>
            <div className="verify-page__actions">
              {found.report.record && (
                <button type="button" className="brand-button" disabled={saving} onClick={() => void download(found.report)}>
                  {t('adv.download')}
                </button>
              )}
              <a className="verify-page__map" href={`/map?at=${found.report.lat.toFixed(5)},${found.report.lon.toFixed(5)}`}>
                {t('verify.to_map')}
              </a>
            </div>
          </>
        )}
        <p className="verify-page__note">{t('pdf.notice')}</p>
      </main>
    </div>
  )
}
