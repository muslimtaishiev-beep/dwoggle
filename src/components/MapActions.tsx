import { LineIcon, type LineIconName } from '../brand/LineIcon.tsx'
import type { MessageKey } from '../i18n/i18n.ts'
import { useI18n } from '../i18n/context.ts'
import './MapActions.css'

interface Action {
  readonly icon: LineIconName
  readonly label: MessageKey
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly pressed?: boolean
}

/** The white tiles at the bottom right of the map: "Where am I", "Saved", "Layers". */
export function MapActions({ actions }: { actions: readonly Action[] }) {
  const { t } = useI18n()
  return (
    <div className="map-actions">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="map-actions__tile"
          disabled={action.disabled}
          aria-pressed={action.pressed}
          onClick={action.onClick}
        >
          <LineIcon name={action.icon} size={22} />
          <span>{t(action.label)}</span>
        </button>
      ))}
    </div>
  )
}
