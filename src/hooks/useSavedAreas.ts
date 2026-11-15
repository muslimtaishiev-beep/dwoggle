import { useCallback, useEffect, useRef, useState } from 'react'
import { addSaved, fetchSaved, removeSaved } from '../api/savedApi.ts'
import type { LatLon } from '../api/types.ts'
import { useAuth } from '../auth/context.ts'

/** A place someone saved from the map: where it is and what it was called. Kept on this device. */
export interface SavedArea extends LatLon {
  readonly name: string | null
  readonly savedAt: number
}

const KEY = 'dwoggle.saved'
const MAX = 50

const same = (a: LatLon, b: LatLon) => a.lat.toFixed(4) === b.lat.toFixed(4) && a.lon.toFixed(4) === b.lon.toFixed(4)

function isSavedArea(value: unknown): value is SavedArea {
  if (typeof value !== 'object' || value === null) return false
  const { lat, lon, name, savedAt } = value as Record<string, unknown>
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    (name === null || typeof name === 'string') &&
    typeof savedAt === 'number'
  )
}

function read(): SavedArea[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter(isSavedArea) : []
  } catch {
    return []
  }
}

function write(areas: readonly SavedArea[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(areas))
  } catch {
    // Storage can be unavailable (private mode); the list then lasts for this visit only.
  }
}

/**
 * The saved areas, newest first. Signed out, they live on this device. Signed in, the account's list on the
 * backend is the one shown: the device's own areas are added to it once, and every change is made on screen at
 * once and then sent; if the backend refuses, the change is undone and `onFailure` is called.
 */
export function useSavedAreas(onFailure: () => void) {
  const { state, idToken } = useAuth()
  const account = state.status === 'signedIn' ? state.user.id : null
  const [local, setLocal] = useState<SavedArea[]>(read)
  const [remote, setRemote] = useState<{ account: string; areas: SavedArea[] } | null>(null)
  const failed = useRef(onFailure)
  useEffect(() => {
    failed.current = onFailure
  })
  const areas = account !== null && remote?.account === account ? remote.areas : local

  // Signed in: fetch the account's list, and add this device's areas to it once (oldest first, so the newest
  // ends up on top), then forget them here.
  useEffect(() => {
    if (account === null) return
    let cancelled = false
    void (async () => {
      try {
        const token = await idToken()
        let list = await fetchSaved(token)
        for (const area of [...read()].reverse()) list = await addSaved(token, area)
        write([])
        if (!cancelled) {
          setLocal([])
          setRemote({ account, areas: list })
        }
      } catch {
        if (!cancelled) failed.current()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [account, idToken])

  const updateLocal = useCallback((change: (current: SavedArea[]) => SavedArea[]) => {
    setLocal((current) => {
      const next = change(current)
      write(next)
      return next
    })
  }, [])

  /** Change the account's list on screen at once, then on the backend; undo it if the backend refuses. */
  const updateRemote = useCallback(
    (change: (current: SavedArea[]) => SavedArea[], send: (token: string) => Promise<SavedArea[]>) => {
      if (account === null || remote?.account !== account) return
      const before = remote.areas
      setRemote({ account, areas: change(before) })
      idToken()
        .then(send)
        .then(
          (list) => setRemote((current) => (current?.account === account ? { account, areas: list } : current)),
          () => {
            setRemote((current) => (current?.account === account ? { account, areas: before } : current))
            failed.current()
          },
        )
    },
    [account, remote, idToken],
  )

  const isSaved = useCallback((point: LatLon) => areas.some((area) => same(area, point)), [areas])

  const toggle = useCallback(
    (point: LatLon, name: string | null) => {
      const wasSaved = areas.some((area) => same(area, point))
      const change = (current: SavedArea[]) =>
        wasSaved
          ? current.filter((area) => !same(area, point))
          : [{ lat: point.lat, lon: point.lon, name, savedAt: Date.now() }, ...current].slice(0, MAX)
      if (account !== null && remote?.account === account) {
        updateRemote(change, (token) => (wasSaved ? removeSaved(token, point) : addSaved(token, { ...point, name })))
      } else {
        updateLocal(change)
      }
    },
    [areas, account, remote, updateLocal, updateRemote],
  )

  const remove = useCallback(
    (point: LatLon) => {
      const change = (current: SavedArea[]) => current.filter((area) => !same(area, point))
      if (account !== null && remote?.account === account) updateRemote(change, (token) => removeSaved(token, point))
      else updateLocal(change)
    },
    [account, remote, updateLocal, updateRemote],
  )

  return { areas, isSaved, toggle, remove }
}
