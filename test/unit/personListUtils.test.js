import {describe, it, expect} from 'vitest'
import {getCurrentAgeInfo} from '../../src/components/personListUtils.js'

// ---------------------------------------------------------------------------
// getCurrentAgeInfo
// ---------------------------------------------------------------------------

describe('getCurrentAgeInfo', () => {
  it('returns null when profile has no current_age', () => {
    expect(getCurrentAgeInfo({})).toBe(null)
  })

  it('returns null for null/undefined profile', () => {
    expect(getCurrentAgeInfo(null)).toBe(null)
    expect(getCurrentAgeInfo(undefined)).toBe(null)
  })

  it('reports isDeceased=false when death is empty', () => {
    const result = getCurrentAgeInfo({current_age: '41 years', death: {}})
    expect(result).toEqual({age: '41 years', isDeceased: false})
  })

  it('reports isDeceased=false when death is missing entirely', () => {
    const result = getCurrentAgeInfo({current_age: '41 years'})
    expect(result).toEqual({age: '41 years', isDeceased: false})
  })

  it('reports isDeceased=true when death has data', () => {
    const result = getCurrentAgeInfo({
      current_age: '95 years',
      death: {date: '1980-01-01', age: '80 years'},
    })
    expect(result).toEqual({age: '95 years', isDeceased: true})
  })
})
