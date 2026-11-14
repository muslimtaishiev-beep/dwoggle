import { describe, expect, it } from 'vitest'
import { parseAccount, parseFieldError, ProfileFieldError } from './accountApi.ts'

describe('parseAccount', () => {
  it('reads what GET /api/me and PUT /api/me/profile send back', () => {
    expect(
      parseAccount({
        user: { uid: 'u1', email: 'a@b.kg' },
        profile: {
          country: 'KG',
          phone: '+996555123456',
          purpose: 'other',
          purpose_note: 'School',
          concerns: ['flood', 'heat'],
          lang: 'uz',
        },
        profile_complete: true,
      }),
    ).toEqual({
      language: 'uz',
      country: 'KG',
      phone: '+996555123456',
      purpose: 'other',
      purposeNote: 'School',
      concerns: ['flood', 'heat'],
      complete: true,
    })
  })

  it('treats a missing profile as nothing saved yet', () => {
    expect(parseAccount({ user: { uid: 'u1' }, profile: null, profile_complete: false })).toEqual({
      language: null,
      country: null,
      phone: null,
      purpose: null,
      purposeNote: null,
      concerns: null,
      complete: false,
    })
  })

  it('never trusts values it does not know', () => {
    const parsed = parseAccount({
      profile: { country: 'Kyrgyzstan', purpose: 'treasure', phone: '', lang: 'klingon', concerns: ['flood', 'zombies'] },
      profile_complete: 'yes',
    })
    expect(parsed).toEqual({
      language: null,
      country: null,
      phone: null,
      purpose: null,
      purposeNote: null,
      concerns: ['flood'],
      complete: false,
    })
  })
})

describe('parseFieldError', () => {
  it('names the refused field and the reason', () => {
    const error = parseFieldError({ detail: { field: 'phone', code: 'phone_invalid', message: 'Введите правильный номер' } })
    expect(error).toBeInstanceOf(ProfileFieldError)
    expect(error).toMatchObject({ field: 'phone', code: 'phone_invalid' })
  })

  it('ignores FastAPI validation lists and unknown fields', () => {
    expect(parseFieldError({ detail: [{ loc: ['body', 'phone'], msg: 'Field required' }] })).toBeNull()
    expect(parseFieldError({ detail: { field: 'password', code: 'x' } })).toBeNull()
    expect(parseFieldError({ detail: { field: 'concerns', code: 'concerns_invalid' } })).toMatchObject({ field: 'concerns' })
    expect(parseFieldError(null)).toBeNull()
  })
})
