import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { searchPlaces, type Place } from '../api/geocode.ts'
import type { LatLon } from '../api/types.ts'
import { LineIcon } from '../brand/LineIcon.tsx'
import { useVoiceInput } from '../hooks/useVoiceInput.ts'
import { useI18n } from '../i18n/context.ts'
import { PixelIcon } from './PixelIcon.tsx'
import './AddressSearch.css'

interface AddressSearchProps {
  /** A found place was chosen: the map should move there. Nothing is checked until the map is tapped. */
  onPick: (place: LatLon) => void
  /**
   * plate: the field floating over the map. pill: the map page's white field on the brown ground, with a
   * microphone; its results open upwards.
   */
  variant?: 'plate' | 'pill'
}

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'done'; readonly places: readonly Place[] }

/** A search field over the map: type an address, submit, pick one of the places found. */
export function AddressSearch({ onPick, variant = 'plate' }: AddressSearchProps) {
  const { lang, t } = useI18n()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const request = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => request.current?.abort(), [])

  const reset = () => {
    request.current?.abort()
    setState({ kind: 'idle' })
  }

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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    search(query)
  }

  // Spoken words become the query and are looked up at once.
  const heard = useCallback(
    (text: string) => {
      setQuery(text)
      search(text)
    },
    [search],
  )
  const voice = useVoiceInput(lang, heard)

  const pick = (place: Place) => {
    setQuery(place.title)
    setState({ kind: 'idle' })
    inputRef.current?.blur()
    onPick({ lat: place.lat, lon: place.lon })
  }

  const clear = () => {
    setQuery('')
    reset()
    inputRef.current?.focus()
  }

  return (
    <form
      className={`address-search address-search--${variant}`}
      role="search"
      aria-label={t('search.label')}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && state.kind !== 'idle') {
          event.stopPropagation()
          reset()
        }
      }}
    >
      <div className={`address-search__field${variant === 'plate' ? ' plate' : ''}`}>
        {variant === 'pill' && (
          <button type="submit" className="address-search__lead" aria-label={t('search.submit')}>
            <LineIcon name="search" size={22} />
          </button>
        )}
        <input
          ref={inputRef}
          className="address-search__input"
          type="search"
          name="address"
          autoComplete="off"
          enterKeyHint="search"
          aria-label={t('search.label')}
          placeholder={t(variant === 'pill' ? 'search.village_placeholder' : 'search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query !== '' && (
          <button type="button" className="address-search__icon-button" aria-label={t('search.clear')} onClick={clear}>
            <PixelIcon name="close" size={14} />
          </button>
        )}
        {variant === 'plate' && (
          <button type="submit" className="address-search__icon-button address-search__submit" aria-label={t('search.submit')}>
            <PixelIcon name="search" size={14} />
          </button>
        )}
        {variant === 'pill' && voice.supported && (
          <button
            type="button"
            className="address-search__mic"
            aria-label={t(voice.listening ? 'search.listening' : 'search.voice')}
            aria-pressed={voice.listening}
            onClick={voice.listen}
          >
            <LineIcon name="mic" size={20} />
          </button>
        )}
      </div>

      {state.kind !== 'idle' && (
        <div className={`address-search__panel${variant === 'plate' ? ' plate' : ''}`}>
          {state.kind === 'loading' && (
            <p className="address-search__message" role="status">
              {t('search.loading')}
            </p>
          )}
          {state.kind === 'error' && (
            <p className="address-search__message address-search__message--error" role="alert">
              {t('search.error')}
            </p>
          )}
          {state.kind === 'done' && state.places.length === 0 && (
            <p className="address-search__message" role="status">
              {t('search.empty')}
            </p>
          )}
          {state.kind === 'done' && state.places.length > 0 && (
            <ul className="address-search__results" aria-label={t('search.results')}>
              {state.places.map((place) => (
                <li key={`${place.lat},${place.lon},${place.title}`}>
                  <button type="button" className="address-search__result" onClick={() => pick(place)}>
                    <span className="address-search__title">{place.title}</span>
                    {place.detail && <span className="address-search__detail">{place.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  )
}
