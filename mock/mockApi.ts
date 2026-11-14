import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * Stand-in for the backend's GET /api/report, answered from mock/report.json (a real backend response).
 *
 * The dev server sends /api to the backend on http://localhost:8000 (vite.config.ts). The mock answers
 * /api/report instead when:
 * - the dev server runs in mock mode: `npm run dev:mock` (no backend needed), or
 * - the app URL has ?mock, e.g. http://localhost:5173/map?mock, or ?mock=<scenario> for the other states.
 * The page's ?mock reaches this server through the Referer header, so app code knows nothing about it.
 * Everything else under /api (sign-in, profile) still goes to the backend.
 */
const SCENARIOS = {
  slow: 'answer after 3 s',
  error: 'HTTP 500',
  invalid: 'a body that does not match the contract',
  empty: 'a report with no checks',
  nodata: 'every check has grade null',
  badkey: 'flood uses a message key that is not in the translations file',
} as const

type Scenario = keyof typeof SCENARIOS
/** `plain`: the mock report as it is. */
type MockRequest = Scenario | 'plain'

const MOUNT_PATH = '/api/report'
const NORMAL_DELAY_MS = 500
const SLOW_DELAY_MS = 3000

interface MockMessage {
  key: string
  params: Record<string, unknown>
  text: string
}

interface MockCheck {
  id: string
  messages: MockMessage[]
  [field: string]: unknown
}

interface MockReport {
  location: Record<string, unknown>
  checks: MockCheck[]
  [field: string]: unknown
}

function isScenario(value: string | null | undefined): value is Scenario {
  return typeof value === 'string' && Object.hasOwn(SCENARIOS, value)
}

/** ?mock on the request or on the page that made it; null when neither asks for the mock. */
function mockRequestFor(req: IncomingMessage, query: URLSearchParams): MockRequest | null {
  let asked = query.get('mock')
  if (asked === null && req.headers.referer) {
    try {
      asked = new URL(req.headers.referer).searchParams.get('mock')
    } catch {
      asked = null
    }
  }
  if (asked === null) return null
  return isScenario(asked) ? asked : 'plain'
}

function applyScenario(report: MockReport, scenario: MockRequest): unknown {
  switch (scenario) {
    case 'invalid':
      return { location: report.location, checks: 'not an array' }
    case 'empty':
      return { ...report, checks: [] }
    case 'nodata':
      return {
        ...report,
        mood: { id: 'relaxed', title: '', line: '' },
        checks: report.checks.map((check) => ({
          ...check,
          grade: null,
          summary: 'Not enough satellite data here.',
          messages: [{ key: 'nodata', params: {}, text: 'Not enough satellite data here.' }],
          metrics: {},
          series: [],
          verification: [],
        })),
      }
    case 'badkey':
      return {
        ...report,
        checks: report.checks.map((check) =>
          check.id === 'flood'
            ? {
                ...check,
                messages: [{ key: 'flood.not_in_translations', params: { n: 11, total: 26 }, text: 'New sentence.' }],
              }
            : check,
        ),
      }
    default:
      return report
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function createHandler(root: string, always: boolean) {
  const reportPath = path.resolve(root, 'mock/report.json')

  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = new URL(req.url ?? '/', 'http://mock.local')
    const query = url.searchParams
    const asked = mockRequestFor(req, query)
    // Only the report itself; /api/report/verification and the rest go on to the backend.
    if (url.pathname !== '/' || (asked === null && !always)) {
      next()
      return
    }
    const scenario = asked ?? 'plain'
    const lat = Number(query.get('lat'))
    const lon = Number(query.get('lon'))

    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Only GET is supported' })
      return
    }
    if (!query.has('lat') || !query.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      sendJson(res, 400, { error: 'lat and lon query parameters are required' })
      return
    }

    setTimeout(
      () => {
        if (scenario === 'error') {
          sendJson(res, 500, { error: 'Mock server error' })
          return
        }
        try {
          // Read on every request so edits to report.json show up without a restart.
          const report = JSON.parse(readFileSync(reportPath, 'utf8')) as MockReport
          // Echo the tapped point as the backend does: snapped to 3 decimals (about 100 m).
          report.location = { ...report.location, lat: Number(lat.toFixed(3)), lon: Number(lon.toFixed(3)) }
          sendJson(res, 200, applyScenario(report, scenario))
        } catch (error) {
          sendJson(res, 500, { error: `Could not read mock/report.json: ${String(error)}` })
        }
      },
      scenario === 'slow' ? SLOW_DELAY_MS : NORMAL_DELAY_MS,
    )
  }
}

/** @param always answer every report request from the mock (`npm run dev:mock`), not only ?mock pages. */
export function mockApi({ always }: { always: boolean }): Plugin {
  return {
    name: 'dwoggle-mock-api',
    // Runs before Vite's own middlewares, so it answers before the /api proxy forwards the request.
    configureServer(server) {
      server.middlewares.use(MOUNT_PATH, createHandler(server.config.root, always))
    },
    configurePreviewServer(server) {
      server.middlewares.use(MOUNT_PATH, createHandler(server.config.root, always))
    },
  }
}
