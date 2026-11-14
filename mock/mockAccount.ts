import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { CONCERNS, PURPOSE_NOTE_MAX, PURPOSES } from '../src/auth/types.ts'
import { LANGS } from '../src/i18n/i18n.ts'

/**
 * Stand-in for the backend's account endpoints in `npm run dev:mock`, when no backend runs:
 * GET /api/me, PUT /api/me/profile and DELETE /api/me, with profiles kept in memory until the dev server stops.
 * It checks the answers the way backend/bekem/profiles.py does (concerns and all 11 languages included), so the
 * dig's error messages can be tried out.
 * Like the backend's own mock mode it does not verify the Firebase token, it only reads the user id from it.
 */

interface StoredProfile {
  country: string
  phone: string
  purpose: string
  purpose_note: string | null
  concerns: string[]
  lang: string
}

class Refused extends Error {
  readonly field: string
  readonly code: string

  constructor(field: string, code: string) {
    super(`${field}: ${code}`)
    this.field = field
    this.code = code
  }
}

// Countries whose local numbers ("0555 123 456") the backend can turn into international form.
const LOCAL_PREFIX: Readonly<Record<string, string>> = { KG: '996', KZ: '7', RU: '7', UZ: '998', TJ: '992', TR: '90' }

function normalizePhone(raw: string, country: string): string {
  let digits = raw.replace(/[\s\-().]/g, '')
  const local = LOCAL_PREFIX[country]
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  else if (!digits.startsWith('+') && local) {
    if (digits.startsWith(local)) digits = `+${digits}`
    else if (digits.startsWith('0') || digits.startsWith('8')) digits = `+${local}${digits.slice(1)}`
    else digits = `+${local}${digits}`
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) throw new Refused('phone', 'phone_invalid')
  if (country === 'KG' && digits.startsWith('+996') && !/^\+996\d{9}$/.test(digits)) throw new Refused('phone', 'phone_invalid')
  return digits
}

/** Known ids only, duplicates dropped; left out, the saved list is kept. */
function validateConcerns(value: unknown, saved: string[]): string[] {
  if (value === undefined || value === null) return saved
  if (!Array.isArray(value)) throw new Refused('concerns', 'concerns_invalid')
  const out: string[] = []
  for (const item of value) {
    if (!(CONCERNS as readonly unknown[]).includes(item)) throw new Refused('concerns', 'concerns_invalid')
    if (!out.includes(item as string)) out.push(item as string)
  }
  return out
}

function validate(body: Record<string, unknown>, saved: StoredProfile | undefined): StoredProfile {
  const country = String(body.country ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new Refused('country', 'country_invalid')
  const purpose = String(body.purpose ?? '')
  if (!(PURPOSES as readonly string[]).includes(purpose)) throw new Refused('purpose', 'purpose_invalid')
  const note = String(body.purpose_note ?? '').trim()
  if (note.length > PURPOSE_NOTE_MAX) throw new Refused('purpose_note', 'note_too_long')
  if (purpose === 'other' && note === '') throw new Refused('purpose_note', 'note_required')
  const phone = normalizePhone(String(body.phone ?? ''), country)
  const concerns = validateConcerns(body.concerns, saved?.concerns ?? [])
  const lang = (LANGS as readonly string[]).includes(String(body.lang)) ? String(body.lang) : 'en'
  return { country, phone, purpose, purpose_note: note || null, concerns, lang }
}

/** The user id inside a Firebase ID token (or a backend dev token "dev:<uid>:<email>"), unverified. */
function userIdOf(req: IncomingMessage): string | null {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
  if (token.startsWith('dev:')) return token.split(':')[1] || null
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    const id = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).user_id : null
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = ''
  for await (const chunk of req) text += String(chunk)
  const parsed: unknown = JSON.parse(text || '{}')
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
}

function createHandler() {
  const profiles = new Map<string, StoredProfile>()
  const answer = (uid: string) => {
    const profile = profiles.get(uid) ?? null
    return { user: { uid }, profile, profile_complete: profile !== null }
  }

  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const path = new URL(req.url ?? '/', 'http://mock.local').pathname
    if (path !== '/' && path !== '/profile') {
      next()
      return
    }
    const uid = userIdOf(req)
    if (uid === null) {
      sendJson(res, 401, { detail: { code: 'token_missing', message: 'Please sign in.' } })
      return
    }
    if (path === '/' && req.method === 'GET') {
      sendJson(res, 200, answer(uid))
    } else if (path === '/' && req.method === 'DELETE') {
      profiles.delete(uid)
      sendJson(res, 200, { deleted: true })
    } else if (path === '/profile' && req.method === 'PUT') {
      readBody(req)
        .then((body) => {
          profiles.set(uid, validate(body, profiles.get(uid)))
          sendJson(res, 200, answer(uid))
        })
        .catch((error: unknown) => {
          if (error instanceof Refused) sendJson(res, 422, { detail: { field: error.field, code: error.code, message: error.code } })
          else sendJson(res, 400, { detail: 'Bad request' })
        })
    } else {
      sendJson(res, 405, { detail: 'Method not allowed' })
    }
  }
}

/** Only for `npm run dev:mock`; otherwise /api/me goes to the backend. */
export function mockAccount(): Plugin {
  return {
    name: 'dwoggle-mock-account',
    configureServer(server) {
      server.middlewares.use('/api/me', createHandler())
    },
  }
}
