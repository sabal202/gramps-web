import {describe, it, expect} from 'vitest'
import {html} from 'lit'
import {
  CATEGORY_LABEL_MAP,
  categoryFallbackLabel,
  personMatchesFilter,
} from '../../src/components/GrampsjsRelatives.js'
import {renderPersonListItem} from '../../src/components/personListUtils.js'
import {hasString, hasValue} from './helpers.js'

// ---------------------------------------------------------------------------
// CATEGORY_LABEL_MAP — static map coverage
// ---------------------------------------------------------------------------

describe('CATEGORY_LABEL_MAP', () => {
  it('contains all required taxonomy keys', () => {
    const required = [
      'parents',
      'children',
      'grandparents',
      'grandchildren',
      'great_grandparents',
      'great_grandchildren',
      'siblings',
      'uncle_aunt',
      'niece_nephew',
      'great_uncle_aunt_1',
      'great_niece_nephew_1',
      'cousins_1',
      'cousins_2',
      'cousins_3',
      'cousins_1_removed_1',
      'cousins_1_removed_2',
      'cousins_2_removed_1',
      'inlaw',
    ]
    for (const key of required) {
      expect(CATEGORY_LABEL_MAP).toHaveProperty(key)
    }
  })

  it('maps parents to a non-empty string', () => {
    expect(CATEGORY_LABEL_MAP.parents).toBeTruthy()
  })

  it('maps inlaw to a non-empty string', () => {
    expect(CATEGORY_LABEL_MAP.inlaw).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// categoryFallbackLabel — dynamic key construction
// ---------------------------------------------------------------------------

describe('categoryFallbackLabel', () => {
  it('returns "Other relatives" for an empty key', () => {
    expect(categoryFallbackLabel('')).toBe('Other relatives')
  })

  it('returns "Other relatives" for null/undefined', () => {
    expect(categoryFallbackLabel(null)).toBe('Other relatives')
    expect(categoryFallbackLabel(undefined)).toBe('Other relatives')
  })

  it('handles ancestors_N', () => {
    const label = categoryFallbackLabel('ancestors_5')
    expect(label).toContain('ancestor')
    expect(label).toContain('5')
  })

  it('handles descendants_N', () => {
    const label = categoryFallbackLabel('descendants_4')
    expect(label).toContain('descendant')
    expect(label).toContain('4')
  })

  it('handles great_uncle_aunt_N', () => {
    const label = categoryFallbackLabel('great_uncle_aunt_3')
    expect(label).toContain('great')
    expect(label).toContain('3')
  })

  it('handles great_niece_nephew_N', () => {
    const label = categoryFallbackLabel('great_niece_nephew_2')
    expect(label).toContain('niece')
    expect(label).toContain('2')
  })

  it('handles cousins_N', () => {
    const label = categoryFallbackLabel('cousins_4')
    expect(label).toContain('cousin')
    expect(label).toContain('4')
  })

  it('handles cousins_N_removed_M', () => {
    const label = categoryFallbackLabel('cousins_3_removed_2')
    expect(label).toContain('cousin')
    expect(label).toContain('3')
    expect(label).toContain('2')
    expect(label).toContain('removed')
  })

  it('returns "Other relatives" for unrecognised keys', () => {
    expect(categoryFallbackLabel('some_unknown_key')).toBe('Other relatives')
  })

  it('does not return the raw key for any input', () => {
    const key = 'some_unknown_key'
    expect(categoryFallbackLabel(key)).not.toBe(key)
  })
})

// ---------------------------------------------------------------------------
// personMatchesFilter — client-side filter predicate
// ---------------------------------------------------------------------------

describe('personMatchesFilter', () => {
  const person = {
    name_given: 'Иван',
    name_surname: 'Иванов',
    relationship: 'двоюродная сестра',
  }

  it('returns true when query is empty', () => {
    expect(personMatchesFilter(person, '')).toBe(true)
  })

  it('returns true when query matches given name (case-insensitive)', () => {
    expect(personMatchesFilter(person, 'иван')).toBe(true)
    expect(personMatchesFilter(person, 'ИВАН')).toBe(true)
  })

  it('returns true when query matches surname', () => {
    expect(personMatchesFilter(person, 'иванов')).toBe(true)
  })

  it('returns true when query matches relationship term', () => {
    expect(personMatchesFilter(person, 'двоюродная')).toBe(true)
    expect(personMatchesFilter(person, 'сестра')).toBe(true)
  })

  it('returns false when query does not match name or relationship', () => {
    expect(personMatchesFilter(person, 'Пётр')).toBe(false)
    expect(personMatchesFilter(person, 'xyz123')).toBe(false)
  })

  it('handles person with no relationship gracefully', () => {
    const p = {name_given: 'Анна', name_surname: 'Смирнова'}
    expect(personMatchesFilter(p, 'Анна')).toBe(true)
    expect(personMatchesFilter(p, 'двоюродная')).toBe(false)
  })

  it('handles person with no name gracefully', () => {
    const p = {relationship: 'брат'}
    expect(personMatchesFilter(p, 'брат')).toBe(true)
    expect(personMatchesFilter(p, 'Иван')).toBe(false)
  })

  it('handles null/undefined person fields gracefully without throwing', () => {
    const p = {name_given: null, name_surname: null, relationship: null}
    expect(() => personMatchesFilter(p, 'test')).not.toThrow()
    expect(personMatchesFilter(p, '')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Group-hiding and ordering logic (pure filter simulation)
// ---------------------------------------------------------------------------

/**
 * Simulate what GrampsjsRelatives.render() does to groups given a filter query:
 * map each group to only its matching people, then drop groups with 0 matches.
 */
function applyFilter(groups, query) {
  return groups
    .map(group => ({
      ...group,
      filteredPeople: query
        ? group.people.filter(p => personMatchesFilter(p, query))
        : group.people,
    }))
    .filter(group => group.filteredPeople.length > 0)
}

describe('group filtering logic', () => {
  const groups = [
    {
      category_key: 'siblings',
      kind: 'blood',
      count: 2,
      people: [
        {name_given: 'Анна', name_surname: 'Иванова', relationship: 'сестра'},
        {name_given: 'Пётр', name_surname: 'Иванов', relationship: 'брат'},
      ],
    },
    {
      category_key: 'cousins_1',
      kind: 'blood',
      count: 1,
      people: [
        {
          name_given: 'Мария',
          name_surname: 'Смирнова',
          relationship: 'двоюродная сестра',
        },
      ],
    },
    {
      category_key: 'inlaw',
      kind: 'inlaw',
      count: 1,
      people: [
        {
          name_given: 'Сергей',
          name_surname: 'Петров',
          relationship: 'зять',
        },
      ],
    },
  ]

  it('returns all groups when query is empty', () => {
    const visible = applyFilter(groups, '')
    expect(visible).toHaveLength(3)
  })

  it('hides a group when none of its people match the filter', () => {
    // 'Мария' matches only cousins_1; siblings should be hidden
    const visible = applyFilter(groups, 'Мария')
    expect(visible).toHaveLength(1)
    expect(visible[0].category_key).toBe('cousins_1')
  })

  it('hides all groups when no one matches', () => {
    const visible = applyFilter(groups, 'НеСуществующееИмя')
    expect(visible).toHaveLength(0)
  })

  it('filters within a group — only matching people survive', () => {
    // 'Анна' is in siblings but not Пётр
    const visible = applyFilter(groups, 'Анна')
    expect(visible).toHaveLength(1)
    expect(visible[0].filteredPeople).toHaveLength(1)
    expect(visible[0].filteredPeople[0].name_given).toBe('Анна')
  })

  it('keeps inlaw group when its person matches', () => {
    const visible = applyFilter(groups, 'зять')
    expect(visible).toHaveLength(1)
    expect(visible[0].kind).toBe('inlaw')
  })

  it('blood groups appear before inlaw groups in source order', () => {
    // The source groups array already puts blood first; filter preserves order.
    const visible = applyFilter(groups, '')
    const bloodIdx = visible.findIndex(g => g.kind === 'blood')
    const inlawIdx = visible.findIndex(g => g.kind === 'inlaw')
    expect(bloodIdx).toBeLessThan(inlawIdx)
  })
})

// ---------------------------------------------------------------------------
// renderPersonListItem smoke test with relatives data shape
// ---------------------------------------------------------------------------

describe('renderPersonListItem with relatives person shape', () => {
  const relativePerson = {
    handle: 'abc123',
    gramps_id: 'I0001',
    name_given: 'Мария',
    name_surname: 'Петрова',
    sex: 'F',
    birth: {date: '1950'},
    death: {},
    media_list: [],
    relationship: 'тётя',
  }

  it('includes given name in rendered output', () => {
    const result = renderPersonListItem({
      profile: relativePerson,
      extPerson: relativePerson,
    })
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Мария'))
    ).toBe(true)
  })

  it('includes surname in rendered output', () => {
    const result = renderPersonListItem({
      profile: relativePerson,
      extPerson: relativePerson,
    })
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Петрова'))
    ).toBe(true)
  })

  it('renders relationship term as supportingText', () => {
    const supportingText = html`<span slot="supporting-text"
      >${relativePerson.relationship}</span
    >`
    const result = renderPersonListItem({
      profile: relativePerson,
      extPerson: relativePerson,
      supportingText,
    })
    expect(hasValue(result, v => v === 'тётя')).toBe(true)
  })

  it('shows female gender ring colour', () => {
    const result = renderPersonListItem({
      profile: relativePerson,
      extPerson: relativePerson,
    })
    expect(
      hasValue(
        result,
        v => typeof v === 'string' && v.includes('var(--color-girl)')
      )
    ).toBe(true)
  })

  it('falls back to icon when no media', () => {
    const result = renderPersonListItem({
      profile: relativePerson,
      extPerson: relativePerson,
    })
    expect(hasString(result, s => s.includes('grampsjs-icon'))).toBe(true)
  })

  it('renders grampsjs-img when media is present', () => {
    const withMedia = {
      ...relativePerson,
      media_list: [{ref: 'photo_handle', rect: [0, 0, 100, 100]}],
    }
    const result = renderPersonListItem({
      profile: withMedia,
      extPerson: withMedia,
    })
    expect(hasString(result, s => s.includes('grampsjs-img'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// GrampsjsViewRelatives update() guard — no double-fetch on first activation
//
// The guard condition in update() is:
//   this.active && changed.has('pageId') && changed.get('pageId') !== undefined
//
// We verify it in isolation: simulate what Lit passes in changedProperties on
// the very first update (oldValue = undefined) vs. a real navigation change
// (oldValue = previous pageId string).
// ---------------------------------------------------------------------------

describe('GrampsjsViewRelatives update() fetch guard', () => {
  /**
   * Simulate the guard predicate exactly as it appears in the view's update().
   * Returns true when a refetch should be triggered from update().
   */
  function shouldRefetchFromUpdate(active, changedPageIdOldValue) {
    // Mirrors:  this.active && changed.has('pageId') && changed.get('pageId') !== undefined
    // We pass changedPageIdOldValue = undefined when pageId is NOT in changedProperties,
    // or its old value when it IS in changedProperties.
    const hasPageId = changedPageIdOldValue !== null // null sentinel = not present
    return active && hasPageId && changedPageIdOldValue !== undefined
  }

  it('does NOT trigger from update() on first activation (oldValue=undefined)', () => {
    // First update: Lit sets oldValue to undefined for the initial property value
    const oldValue = undefined
    expect(shouldRefetchFromUpdate(true, oldValue)).toBe(false)
  })

  it('DOES trigger from update() on a real anchor change (old value is a string)', () => {
    // pageId changed from '' to 'I0283'
    expect(shouldRefetchFromUpdate(true, '')).toBe(true)
    // pageId changed from 'I0283' to 'I0010'
    expect(shouldRefetchFromUpdate(true, 'I0283')).toBe(true)
  })

  it('does NOT trigger from update() when view is not active', () => {
    expect(shouldRefetchFromUpdate(false, '')).toBe(false)
    expect(shouldRefetchFromUpdate(false, 'I0283')).toBe(false)
  })

  it('does NOT trigger from update() when pageId is not in changedProperties', () => {
    // null sentinel = pageId not in changedProperties
    expect(shouldRefetchFromUpdate(true, null)).toBe(false)
  })
})
