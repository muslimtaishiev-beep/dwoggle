import type { LatLon } from '../api/types.ts'
import { LineIcon } from '../brand/LineIcon.tsx'
import type { SavedArea } from '../hooks/useSavedAreas.ts'
import { useI18n } from '../i18n/context.ts'
import './ReportPanel.css'

interface SavedPanelProps {
  areas: readonly SavedArea[]
  onOpen: (point: LatLon) => void
  onRemove: (point: LatLon) => void
  onClose: () => void
}

/** The areas saved on this device, in the report panel's place: tap one to check it again. */
export function SavedPanel({ areas, onOpen, onRemove, onClose }: SavedPanelProps) {
  const { t, formatNumber } = useI18n()
  const where = (area: LatLon) =>
    `${formatNumber(area.lat, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}, ${formatNumber(area.lon, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

  return (
    <section className="report-panel" aria-labelledby="saved-panel-title">
      <header className="report-panel__head">
        <h2 id="saved-panel-title" className="report-panel__title brand-display">
          {t('saved.title')}
        </h2>
        <button type="button" className="report-panel__close" aria-label={t('report.close')} onClick={onClose}>
          <LineIcon name="close" size={18} />
        </button>
      </header>
      {areas.length === 0 ? (
        <p className="report-panel__summary">{t('saved.empty')}</p>
      ) : (
        <ul className="report-panel__checks">
          {areas.map((area) => {
            const label = area.name ?? where(area)
            return (
              <li key={`${area.lat},${area.lon}`} className="report-panel__check report-panel__saved">
                <span className="report-panel__icon">
                  <LineIcon name="bookmark" size={16} />
                </span>
                <button type="button" className="report-panel__saved-open" onClick={() => onOpen(area)}>
                  <span className="report-panel__name">{label}</span>
                  {area.name && <span className="report-panel__fact">{where(area)}</span>}
                </button>
                <button
                  type="button"
                  className="report-panel__close"
                  aria-label={t('saved.remove', { place: label })}
                  onClick={() => onRemove(area)}
                >
                  <LineIcon name="close" size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
