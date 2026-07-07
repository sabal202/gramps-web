import {describe, it, expect} from 'vitest'
import {
  getNameParts,
  isLatinScript,
  pickLatinName,
  buildExternalSearchData,
  resolveSiteData,
} from '../../src/externalSearch.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A Cyrillic primary name with a patronymic surname and a family surname.
const cyrillicName = {
  first_name: 'Антон',
  surname_list: [
    {surname: 'Соболевский', origintype: '', prefix: '', connector: ''},
    {surname: 'Петрович', origintype: 'Patronymic', prefix: '', connector: ''},
  ],
}

// A Latin (Polish) alternate spelling of the same person, no patronymic.
const latinName = {
  first_name: 'Anton',
  surname_list: [
    {surname: 'Sobolewski', origintype: '', prefix: '', connector: ''},
  ],
}

const personCyrillicOnly = {
  primary_name: cyrillicName,
  alternate_names: [],
  profile: {
    name_given: 'Антон',
    name_surname: 'Соболевский Петрович',
    birth: {date: '1882-05-01', place_name: 'Гродно'},
    death: {date: '1943', place_name: ''},
  },
}

const personWithLatinAlt = {
  primary_name: cyrillicName,
  alternate_names: [latinName],
  profile: personCyrillicOnly.profile,
}

// ---------------------------------------------------------------------------
// getNameParts
// ---------------------------------------------------------------------------

describe('getNameParts', () => {
  it('splits patronymic out of the family surname', () => {
    const parts = getNameParts(cyrillicName)
    expect(parts.given).toBe('Антон')
    expect(parts.familySurname).toBe('Соболевский')
    expect(parts.patronymic).toBe('Петрович')
  })

  it('handles a name with no patronymic', () => {
    const parts = getNameParts(latinName)
    expect(parts.given).toBe('Anton')
    expect(parts.familySurname).toBe('Sobolewski')
    expect(parts.patronymic).toBe('')
  })

  it('is safe on empty / missing input', () => {
    expect(getNameParts(undefined)).toEqual({
      given: '',
      familySurname: '',
      patronymic: '',
    })
    expect(getNameParts({})).toEqual({
      given: '',
      familySurname: '',
      patronymic: '',
    })
  })

  it('joins multiple family surnames with a space', () => {
    const parts = getNameParts({
      first_name: 'Иван',
      surname_list: [
        {surname: 'Кузяев', origintype: ''},
        {surname: 'Хасанов', origintype: ''},
        {surname: 'Иванович', origintype: 'Patronymic'},
      ],
    })
    expect(parts.familySurname).toBe('Кузяев Хасанов')
    expect(parts.patronymic).toBe('Иванович')
  })
})

// ---------------------------------------------------------------------------
// isLatinScript
// ---------------------------------------------------------------------------

describe('isLatinScript', () => {
  it('is true for Latin-only strings', () => {
    expect(isLatinScript('Sobolewski')).toBe(true)
    expect(isLatinScript('Szalkiewicz')).toBe(true)
  })

  it('is false for Cyrillic strings', () => {
    expect(isLatinScript('Соболевский')).toBe(false)
    expect(isLatinScript('Шалкевич')).toBe(false)
  })

  it('is false for mixed script (needs no Cyrillic at all)', () => {
    expect(isLatinScript('Sobolewski Петрович')).toBe(false)
  })

  it('is false for empty / non-alphabetic input', () => {
    expect(isLatinScript('')).toBe(false)
    expect(isLatinScript(undefined)).toBe(false)
    expect(isLatinScript('1882')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// pickLatinName
// ---------------------------------------------------------------------------

describe('pickLatinName', () => {
  it('finds the Latin-script alternate name', () => {
    const picked = pickLatinName(personWithLatinAlt)
    expect(picked).toBe(latinName)
  })

  it('returns null when no Latin name is present', () => {
    expect(pickLatinName(personCyrillicOnly)).toBeNull()
  })

  it('returns the primary name if it is already Latin', () => {
    const person = {primary_name: latinName, alternate_names: []}
    expect(pickLatinName(person)).toBe(latinName)
  })
})

// ---------------------------------------------------------------------------
// buildExternalSearchData
// ---------------------------------------------------------------------------

describe('buildExternalSearchData', () => {
  it('exposes Cyrillic primary parts including patronymic', () => {
    const d = buildExternalSearchData(personWithLatinAlt)
    expect(d.name_given).toBe('Антон')
    expect(d.name_family_surname).toBe('Соболевский')
    expect(d.name_patronymic).toBe('Петрович')
  })

  it('exposes Latin variants from the alternate name', () => {
    const d = buildExternalSearchData(personWithLatinAlt)
    expect(d.name_given_latin).toBe('Anton')
    expect(d.name_family_surname_latin).toBe('Sobolewski')
    expect(d.name_patronymic_latin).toBe('')
  })

  it('leaves Latin variants empty when no Latin name exists', () => {
    const d = buildExternalSearchData(personCyrillicOnly)
    expect(d.name_family_surname_latin).toBe('')
    expect(d.name_given_latin).toBe('')
  })

  it('extracts birth/death years and falls back for place', () => {
    const d = buildExternalSearchData(personCyrillicOnly)
    expect(d.birth_year).toBe('1882')
    expect(d.death_year).toBe('1943')
    expect(d.place_name).toBe('Гродно')
  })

  it('is safe on an empty person', () => {
    const d = buildExternalSearchData({})
    expect(d.name_family_surname).toBe('')
    expect(d.birth_year).toBe('')
    expect(d.place_name).toBe('')
  })
})

// ---------------------------------------------------------------------------
// resolveSiteData
// ---------------------------------------------------------------------------

describe('resolveSiteData', () => {
  const searchData = buildExternalSearchData(personWithLatinAlt)

  it('returns Cyrillic values for non-latin sites', () => {
    const r = resolveSiteData(searchData, 'cyrillic')
    expect(r.name_family_surname).toBe('Соболевский')
    expect(r.name_patronymic).toBe('Петрович')
  })

  it('swaps to Latin values for latin sites', () => {
    const r = resolveSiteData(searchData, 'latin')
    expect(r.name_given).toBe('Anton')
    expect(r.name_family_surname).toBe('Sobolewski')
    expect(r.name_surname).toBe('Sobolewski')
  })

  it('defaults to Cyrillic when script is undefined', () => {
    const r = resolveSiteData(searchData, undefined)
    expect(r.name_family_surname).toBe('Соболевский')
  })
})
