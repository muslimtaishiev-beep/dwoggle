import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ChatApi = typeof import('./chatApi.ts')
let api: ChatApi
const question = [{ role: 'user' as const, content: 'Is there flooding here?' }]

function answer(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(async () => {
  vi.resetModules()
  api = await import('./chatApi.ts')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('askOnServer', () => {
  it('sends the conversation, the language and the report, and returns his answer', async () => {
    const fetchMock = answer(200, { text: ' Water stood here in 3 of 25 years. ' })
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.askOnServer(question, 'en', null)).resolves.toBe('Water stood here in 3 of 25 years.')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/chat')
    expect(JSON.parse(String(init.body))).toEqual({ messages: question, lang: 'en', report: null })
  })

  it('turns off for good when the backend has no key (503)', async () => {
    const fetchMock = answer(503, { detail: { code: 'chat_disabled' } })
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.askOnServer(question, 'ky', null)).rejects.toBeInstanceOf(api.ChatUnavailable)
    expect(api.serverChatOff()).toBe(true)
    await expect(api.askOnServer(question, 'ky', null)).rejects.toBeInstanceOf(api.ChatUnavailable)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails only this question when the backend is busy or the answer broke the rules', async () => {
    vi.stubGlobal('fetch', answer(502, { detail: { code: 'chat_off_script' } }))
    await expect(api.askOnServer(question, 'ru', null)).rejects.toThrow('HTTP 502')
    expect(api.serverChatOff()).toBe(false)
    vi.stubGlobal('fetch', answer(200, { text: '' }))
    await expect(api.askOnServer(question, 'ru', null)).rejects.toThrow('empty answer')
  })
})
