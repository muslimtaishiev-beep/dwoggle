import { describe, expect, it } from 'vitest'
import { parsePlaces } from './geocode.ts'

describe('parsePlaces', () => {
  it('reads coordinates and splits the name from the rest of the address', () => {
    const body = [
      { lat: '42.8765', lon: '74.6037', name: 'Чүй проспектиси', display_name: 'Чүй проспектиси, Бишкек, Кыргызстан' },
    ]
    expect(parsePlaces(body)).toEqual([
      { lat: 42.8765, lon: 74.6037, title: 'Чүй проспектиси', detail: 'Бишкек, Кыргызстан' },
    ])
  })

  it('uses the first part of the address when there is no name', () => {
    expect(parsePlaces([{ lat: '40.5', lon: '72.8', display_name: 'Osh, Kyrgyzstan' }])).toEqual([
      { lat: 40.5, lon: 72.8, title: 'Osh', detail: 'Kyrgyzstan' },
    ])
  })

  it('skips entries without usable coordinates or a name', () => {
    const body = [
      { lat: 'north', lon: '74', display_name: 'Nowhere' },
      { lat: null, lon: null, display_name: 'Null Island' },
      { lat: '1', lon: '2', display_name: '' },
      'not an object',
      { lat: '42', lon: '74', display_name: 'Bishkek' },
    ]
    expect(parsePlaces(body)).toEqual([{ lat: 42, lon: 74, title: 'Bishkek', detail: '' }])
  })

  it('keeps one entry when a street comes back as several segments with the same address', () => {
    const body = [
      { lat: '40.51', lon: '72.80', name: 'Alymbek Datka Street', display_name: 'Alymbek Datka Street, Osh City, 724500, Kyrgyzstan' },
      { lat: '40.52', lon: '72.81', name: 'Alymbek datka street', display_name: 'Alymbek datka street, Osh City, 724500, Kyrgyzstan' },
      { lat: '40.53', lon: '72.82', name: 'Alymbek Datka Street', display_name: 'Alymbek Datka Street, Osh City, 723506, Kyrgyzstan' },
    ]
    expect(parsePlaces(body).map((place) => place.detail)).toEqual([
      'Osh City, 724500, Kyrgyzstan',
      'Osh City, 723506, Kyrgyzstan',
    ])
  })

  it('returns an empty list when nothing was found', () => {
    expect(parsePlaces([])).toEqual([])
  })

  it('rejects a response that is not a list', () => {
    expect(() => parsePlaces({ error: 'Unable to geocode' })).toThrow()
  })
})
