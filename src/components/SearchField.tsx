import { LineIcon } from '../brand/LineIcon.tsx'
import { canListen } from '../hooks/useVoiceInput.ts'
import { useI18n } from '../i18n/context.ts'
import './SearchField.css'

interface SearchFieldProps {
  /** Open the search; `listen` when the microphone was pressed, to start listening at once. */
  onOpen: (listen: boolean) => void
}

/**
 * The search as it rests on the map page: a white pill that says what can be looked up. It is a button, not a
 * field: pressing it opens the search sheet, where the typing happens.
 */
export function SearchField({ onOpen }: SearchFieldProps) {
  const { t } = useI18n()
  return (
    <div className="search-field">
      <button type="button" className="search-field__open" onClick={() => onOpen(false)}>
        <LineIcon name="search" size={22} />
        <span>{t('search.village_placeholder')}</span>
      </button>
      {canListen() && (
        <button type="button" className="search-field__mic" aria-label={t('search.voice')} onClick={() => onOpen(true)}>
          <LineIcon name="mic" size={20} />
        </button>
      )}
    </div>
  )
}
