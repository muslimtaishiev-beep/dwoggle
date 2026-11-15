import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { searchPlaces, type Place } from '../api/geocode.ts'
import type { LatLon } from '../api/types.ts'
import { LineIcon } from '../brand/LineIcon.tsx'
import { CITIES } from '../config.ts'
import { useRecentPlaces } from '../hooks/useRecentPlaces.ts'
import { useVoiceInput } from '../hooks/useVoiceInput.ts'
import { useI18n } from '../i18n/context.ts'
import './SearchSheet.css'

/** How long the sheet takes to slide away; matches its transition in SearchSheet.css. */
const LEAVE_MS = 220

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'done'; readonly places: readonly Place[] }

interface SearchSheetProps {
  /** Start listening as the sheet opens: the visitor pressed the microphone, not the field. */
  listenAtOnce: boolean
  /** A place was chosen: the map goes there and Dwoggle checks it. */
  onPick: (place: LatLon) => void
  onClose: () => void
}

/**
 * The search, opened: a sheet that slides up over most of the screen, with a large field, the places looked up
 * lately, the country's cities, and then what was found. A place is looked up when the form is sent, never on
 * every keystroke (the geocoder's rules).
 */
export function SearchSheet({ listenAtOnce, onPick, onClose }: SearchSheetProps) {
  const { lang, t } = useI18n()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const [leaving, setLeaving] = useState(false)
  const recent = useRecentPlaces()
  const request = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const leaveTimer = useRef<number | undefined>(undefined)

  /** Slide away, then go. */
  const leave = useCallback(
    (after: () => void) => {
      request.current?.abort()
      setLeaving(true)
      window.clearTimeout(leaveTimer.current)
      leaveTimer.current = window.setTimeout(after, LEAVE_MS)
    },
    [],
  )
  const close = useCallback(() => leave(onClose), [leave, onClose])

  const search = useCallback(
    (raw: string) => {
      const text = raw.trim()
      request.current?.abort()
      if (text === '') {
        setState({ kind: 'idle' })
        return
      }
      const controller = new AbortController()
      request.current = controller
      setState({ kind: 'loading' })
      searchPlaces(text, lang, controller.signal).then(
        (places) => {
          if (!controller.signal.aborted) setState({ kind: 'done', places })
        },
        () => {
          if (!controller.signal.aborted) setState({ kind: 'error' })
        },
      )
    },
    [lang],
  )

  // Spoken words become the query and are looked up at once.
  const voice = useVoiceInput(lang, (text) => {
    setQuery(text)
    search(text)
  })
  const { listen } = voice

  useEffect(() => {
    if (listenAtOnce) listen()
    else input.current?.focus()
    return () => {
      request.current?.abort()
      window.clearTimeout(leaveTimer.current)
    }
    // Once, as the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    search(query)
  }

  const pick = (place: Place) => {
    recent.remember(place)
    leave(() => {
      onPick({ lat: place.lat, lon: place.lon })
      onClose()
    })
  }

  const row = (place: Place, icon: 'pin' | 'clock') => (
    <li key={`${place.lat},${place.lon},${place.title}`}>
      <button type="button" className="search-sheet__row" onClick={() => pick(place)}>
        <span className="search-sheet__row-icon">
          <LineIcon name={icon} size={20} />
        </span>
        <span className="search-sheet__row-text">
          <span className="search-sheet__row-title">{place.title}</span>
          {place.detail && <span className="search-sheet__row-detail">{place.detail}</span>}
        </span>
      </button>
    </li>
  )

  return (
    <div className={`search-sheet${leaving ? ' search-sheet--leaving' : ''}`} role="dialog" aria-modal="true" aria-label={t('search.label')}>
      <button type="button" className="search-sheet__scrim" aria-label={t('search.close')} onClick={close} />
      <div className="search-sheet__panel">
        <form className="search-sheet__field" role="search" onSubmit={submit}>
          <button type="button" className="search-sheet__icon" aria-label={t('search.close')} onClick={close}>
            <LineIcon name="back" size={22} />
          </button>
          <input
            ref={input}
            className="search-sheet__input"
            type="search"
            name="address"
            autoComplete="off"
            enterKeyHint="search"
            aria-label={t('search.label')}
            placeholder={t(voice.listening ? 'search.listening' : voice.hearing ? 'search.loading' : 'search.village_placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {voice.supported && (
            <button type="button" className="search-sheet__icon" aria-label={t('search.voice')} aria-pressed={voice.listening} onClick={listen}>
              <LineIcon name="mic" size={22} />
            </button>
          )}
          <button type="submit" className="search-sheet__submit">
            {t('search.submit')}
          </button>
        </form>

        <div className="search-sheet__body">
          {state.kind === 'loading' && (
            <p className="search-sheet__message" role="status">
              {t('search.loading')}
            </p>
          )}
          {state.kind === 'error' && (
            <p className="search-sheet__message search-sheet__message--error" role="alert">
              {t('search.error')}
            </p>
          )}
          {state.kind === 'done' && state.places.length === 0 && (
            <p className="search-sheet__message" role="status">
              {t('search.empty')}
            </p>
          )}
          {state.kind === 'done' && state.places.length > 0 && (
            <ul className="search-sheet__list" aria-label={t('search.results')}>
              {state.places.map((place) => row(place, 'pin'))}
            </ul>
          )}

          {state.kind === 'idle' && (
            <>
              <p className="search-sheet__message">{t('search.hint')}</p>
              {recent.places.length > 0 && (
                <section aria-labelledby="search-recent">
                  <h3 id="search-recent" className="search-sheet__heading">
                    {t('search.recent')}
                  </h3>
                  <ul className="search-sheet__list">{recent.places.map((place) => row(place, 'clock'))}</ul>
                </section>
              )}
              <section aria-labelledby="search-cities">
                <h3 id="search-cities" className="search-sheet__heading">
                  {t('search.popular')}
                </h3>
                <div className="search-sheet__cities">
                  {CITIES.map((city) => (
                    <button
                      key={city.id}
                      type="button"
                      className="search-sheet__city"
                      onClick={() => pick({ lat: city.lat, lon: city.lon, title: t(`place.${city.id}`), detail: '' })}
                    >
                      {t(`place.${city.id}`)}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
