import { useEffect, useRef, useState, type FormEvent } from 'react'
import { searchPlaces, type Place } from '../api/geocode.ts'
import type { LatLon } from '../api/types.ts'
import { useI18n } from '../i18n/context.ts'
import { PixelIcon } from './PixelIcon.tsx'
import './AddressSearch.css'

interface AddressSearchProps {
  /** A found place was chosen: the map should move there. Nothing is checked until the map is tapped. */
  onPick: (place: LatLon) => void
}

type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'done'; readonly places: readonly Place[] }

/** A search field over the map: type an address, submit, pick one of the places found. */
export function AddressSearch({ onPick }: AddressSearchProps) {
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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = query.trim()
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
  }

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
      className="address-search"
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
      <div className="address-search__field plate">
        <input
          ref={inputRef}
          className="address-search__input"
          type="search"
          name="address"
          autoComplete="off"
          enterKeyHint="search"
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query !== '' && (
          <button type="button" className="address-search__icon-button" aria-label={t('search.clear')} onClick={clear}>
            <PixelIcon name="close" size={14} />
          </button>
        )}
        <button type="submit" className="address-search__icon-button address-search__submit" aria-label={t('search.submit')}>
          <PixelIcon name="search" size={14} />
        </button>
      </div>

      {state.kind !== 'idle' && (
        <div className="address-search__panel plate">
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
