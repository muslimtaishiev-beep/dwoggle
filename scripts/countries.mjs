// Generates src/data/countries.json from the open "world-countries" dataset (mledoze/countries, ODbL).
// Run with `npm run countries`. Country names are not stored: the browser supplies them in the user's language.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const countries = createRequire(import.meta.url)('world-countries')

const rows = countries
  .filter((country) => Array.isArray(country.latlng) && country.latlng.length === 2)
  .map((country) => {
    const { root = '', suffixes = [] } = country.idd ?? {}
    return {
      code: country.cca2,
      lat: country.latlng[0],
      lon: country.latlng[1],
      // Countries that share one prefix (+1, +7) list many suffixes; the shared prefix is the dialling code.
      dial: root + (suffixes.length === 1 ? suffixes[0] : ''),
      area_km2: Math.max(0, Math.round(country.area ?? 0)),
    }
  })
  .sort((a, b) => a.code.localeCompare(b.code))

const target = path.resolve(import.meta.dirname, '..', 'src', 'data', 'countries.json')
writeFileSync(target, JSON.stringify(rows) + '\n')
console.log(`${rows.length} countries written to src/data/countries.json`)
