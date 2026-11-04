import {describe, it, expect} from 'vitest'
import {
  buildToc,
  CATEGORY_LABEL_MAP,
  categoryLabelKey,
} from '../../src/components/GrampsjsRelatives.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePeople(n) {
  return Array.from({length: n}, (_, i) => ({
    name_given: `Person${i}`,
    name_surname: 'Test',
    relationship: 'relative',
  }))
}

const groupSiblings = {
  category_key: 'siblings',
  kind: 'blood',
  filteredPeople: makePeople(3),
}

const groupCousins = {
  category_key: 'cousins_1',
  kind: 'blood',
  filteredPeople: makePeople(5),
}

const groupInlaw = {
  category_key: 'inlaw',
  kind: 'inlaw',
  filteredPeople: makePeople(2),
}

const groupFallback = {
  category_key: 'ancestors_7',
  kind: 'blood',
  filteredPeople: makePeople(1),
}

// ---------------------------------------------------------------------------
// Shape & length
// ---------------------------------------------------------------------------

describe('buildToc — shape', () => {
  it('returns an array', () => {
    expect(Array.isArray(buildToc([groupSiblings]))).toBe(true)
  })

  it('returns one entry per visible group', () => {
    const result = buildToc([groupSiblings, groupCousins, groupInlaw])
    expect(result).toHaveLength(3)
  })

  it('each entry has key, label, count properties', () => {
    const [entry] = buildToc([groupSiblings])
    expect(entry).toHaveProperty('key')
    expect(entry).toHaveProperty('label')
    expect(entry).toHaveProperty('count')
  })

  it('key matches the group category_key', () => {
    const result = buildToc([groupSiblings, groupCousins])
    expect(result[0].key).toBe('siblings')
    expect(result[1].key).toBe('cousins_1')
  })

  it('count matches filteredPeople.length', () => {
    const result = buildToc([groupSiblings, groupCousins, groupInlaw])
    expect(result[0].count).toBe(3)
    expect(result[1].count).toBe(5)
    expect(result[2].count).toBe(2)
  })

  it('preserves the original group order', () => {
    const result = buildToc([groupInlaw, groupSiblings])
    expect(result[0].key).toBe('inlaw')
    expect(result[1].key).toBe('siblings')
  })
})

// ---------------------------------------------------------------------------
// Label resolution — default (no labelFn)
// ---------------------------------------------------------------------------

describe('buildToc — default label resolution', () => {
  it('resolves known keys via CATEGORY_LABEL_MAP', () => {
    const result = buildToc([groupSiblings])
    // Default: returns the English map value (not translated)
    expect(result[0].label).toBe(CATEGORY_LABEL_MAP.siblings)
  })

  it('resolves inlaw key to "Distant relatives" (dead key, no longer mapped)', () => {
    const result = buildToc([groupInlaw])
    expect(result[0].label).toBe('Distant relatives')
  })

  it('falls back to "Distant relatives" for unmapped keys', () => {
    const result = buildToc([groupFallback])
    expect(result[0].label).toBe(categoryLabelKey('ancestors_7'))
    expect(result[0].label).toBe('Distant relatives')
  })

  it('does not return raw key for unrecognised category_key', () => {
    const group = {
      category_key: 'some_unknown_key',
      kind: 'blood',
      filteredPeople: makePeople(1),
    }
    const result = buildToc([group])
    expect(result[0].label).not.toBe('some_unknown_key')
  })
})

// ---------------------------------------------------------------------------
// Label resolution — custom labelFn
// ---------------------------------------------------------------------------

describe('buildToc — custom labelFn', () => {
  it('uses the provided labelFn for label resolution', () => {
    const labelFn = key => `TRANSLATED:${key}`
    const result = buildToc([groupSiblings], labelFn)
    expect(result[0].label).toBe('TRANSLATED:siblings')
  })

  it('passes category_key to labelFn', () => {
    const seen = []
    const labelFn = key => {
      seen.push(key)
      return key
    }
    buildToc([groupSiblings, groupCousins], labelFn)
    expect(seen).toContain('siblings')
    expect(seen).toContain('cousins_1')
  })

  it('uses labelFn result for each entry independently', () => {
    const labelFn = key => (key === 'siblings' ? 'Geschwister' : 'Other')
    const result = buildToc([groupSiblings, groupCousins], labelFn)
    expect(result[0].label).toBe('Geschwister')
    expect(result[1].label).toBe('Other')
  })
})

// ---------------------------------------------------------------------------
// Empty / edge cases
// ---------------------------------------------------------------------------

describe('buildToc — empty and edge cases', () => {
  it('returns empty array for empty visibleGroups', () => {
    expect(buildToc([])).toEqual([])
  })

  it('returns empty array for null visibleGroups', () => {
    expect(buildToc(null)).toEqual([])
  })

  it('returns empty array for undefined visibleGroups', () => {
    expect(buildToc(undefined)).toEqual([])
  })

  it('handles group with empty filteredPeople (count = 0)', () => {
    const group = {
      category_key: 'parents',
      kind: 'blood',
      filteredPeople: [],
    }
    const result = buildToc([group])
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(0)
  })

  it('handles group with missing filteredPeople (count = 0)', () => {
    const group = {category_key: 'parents', kind: 'blood'}
    const result = buildToc([group])
    expect(result[0].count).toBe(0)
  })

  it('handles a single group correctly', () => {
    const result = buildToc([groupSiblings])
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('siblings')
    expect(result[0].count).toBe(3)
  })

  it('does not mutate the input array', () => {
    const input = [groupSiblings, groupCousins]
    const originalLength = input.length
    buildToc(input)
    expect(input).toHaveLength(originalLength)
  })
})

// ---------------------------------------------------------------------------
// Filtered-count scenario: buildToc reflects actual filteredPeople, not raw count
// ---------------------------------------------------------------------------

describe('buildToc — filtered counts', () => {
  it('count reflects filteredPeople length, not original group count', () => {
    // Simulate a group where only 2 of 10 people passed the filter
    const group = {
      category_key: 'cousins_2',
      kind: 'blood',
      count: 10, // original unfiltered count (not used by buildToc)
      filteredPeople: makePeople(2),
    }
    const result = buildToc([group])
    expect(result[0].count).toBe(2)
  })
})
