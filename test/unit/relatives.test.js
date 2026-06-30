import {describe, it, expect, vi} from 'vitest'
import {html} from 'lit'
import {
  CATEGORY_LABEL_MAP,
  categoryLabelKey,
  personMatchesFilter,
} from '../../src/components/GrampsjsRelatives.js'
import {renderPersonListItem} from '../../src/components/personListUtils.js'
import {GrampsjsViewRelatives} from '../../src/views/GrampsjsViewRelatives.js'
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
    ]
    for (const key of required) {
      expect(CATEGORY_LABEL_MAP).toHaveProperty(key)
    }
  })

  it('maps parents to a non-empty string', () => {
    expect(CATEGORY_LABEL_MAP.parents).toBeTruthy()
  })

  it('does not contain the dead inlaw key', () => {
    expect(CATEGORY_LABEL_MAP).not.toHaveProperty('inlaw')
  })
})

// ---------------------------------------------------------------------------
// categoryLabelKey — pure i18n key resolver
// ---------------------------------------------------------------------------

describe('categoryLabelKey', () => {
  it('returns the mapped English key for known categories', () => {
    expect(categoryLabelKey('parents')).toBe('Parents')
    expect(categoryLabelKey('siblings')).toBe('Siblings')
    expect(categoryLabelKey('cousins_1')).toBe('First cousins')
    expect(categoryLabelKey('cousins_2_removed_1')).toBe(
      'Second cousins once removed'
    )
    expect(categoryLabelKey('great_uncle_aunt_1')).toBe(
      'Great-uncles and great-aunts'
    )
  })

  it('returns "Distant relatives" for unmapped dynamic keys', () => {
    expect(categoryLabelKey('cousins_4')).toBe('Distant relatives')
    expect(categoryLabelKey('cousins_3_removed_2')).toBe('Distant relatives')
    expect(categoryLabelKey('ancestors_5')).toBe('Distant relatives')
    expect(categoryLabelKey('descendants_6')).toBe('Distant relatives')
    expect(categoryLabelKey('great_uncle_aunt_3')).toBe('Distant relatives')
  })

  it('returns "Distant relatives" for the dead inlaw key', () => {
    expect(categoryLabelKey('inlaw')).toBe('Distant relatives')
  })

  it('returns "Distant relatives" for empty or unknown keys', () => {
    expect(categoryLabelKey('')).toBe('Distant relatives')
    expect(categoryLabelKey('some_unknown_key')).toBe('Distant relatives')
  })

  it('never returns the raw key', () => {
    expect(categoryLabelKey('some_unknown_key')).not.toBe('some_unknown_key')
    expect(categoryLabelKey('ancestors_5')).not.toBe('ancestors_5')
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
  // New backend contract: no group-level kind; kind is per-person ('blood'|'inlaw').
  // In-laws are folded into their matching blood-category group; the backend
  // orders people blood-first then in-laws within each group.
  const groups = [
    {
      category_key: 'siblings',
      count: 2,
      people: [
        {
          name_given: 'Анна',
          name_surname: 'Иванова',
          relationship: 'сестра',
          kind: 'blood',
        },
        {
          name_given: 'Пётр',
          name_surname: 'Иванов',
          relationship: 'брат',
          kind: 'blood',
        },
      ],
    },
    {
      category_key: 'cousins_1',
      count: 1,
      people: [
        {
          name_given: 'Мария',
          name_surname: 'Смирнова',
          relationship: 'двоюродная сестра',
          kind: 'blood',
        },
      ],
    },
    {
      // children group: one blood child + one in-law (зять folded in)
      category_key: 'children',
      count: 2,
      people: [
        {
          name_given: 'Ольга',
          name_surname: 'Иванова',
          relationship: 'дочь',
          kind: 'blood',
        },
        {
          name_given: 'Сергей',
          name_surname: 'Петров',
          relationship: 'зять',
          kind: 'inlaw',
        },
      ],
    },
  ]

  it('returns all groups when query is empty', () => {
    const visible = applyFilter(groups, '')
    expect(visible).toHaveLength(3)
  })

  it('hides a group when none of its people match the filter', () => {
    // 'Мария' matches only cousins_1; siblings and children should be hidden
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

  it('in-law person matches by relationship and surfaces in its blood-category group', () => {
    // Сергей (зять, kind=inlaw) is folded into the children group.
    // Filtering by 'зять' must surface the children group and that person.
    const visible = applyFilter(groups, 'зять')
    expect(visible).toHaveLength(1)
    expect(visible[0].category_key).toBe('children')
    expect(visible[0].filteredPeople).toHaveLength(1)
    expect(visible[0].filteredPeople[0].kind).toBe('inlaw')
    expect(visible[0].filteredPeople[0].name_given).toBe('Сергей')
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
    expect(hasValue(result, v => v === 'Мария')).toBe(true)
  })

  it('includes surname in rendered output', () => {
    const result = renderPersonListItem({
      profile: relativePerson,
      extPerson: relativePerson,
    })
    expect(hasValue(result, v => v === 'Петрова')).toBe(true)
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

// ---------------------------------------------------------------------------
// GrampsjsViewRelatives._resolveAnchor() — precedence: pageId > homePerson > ''
// ---------------------------------------------------------------------------

function makeViewComponent(overrides = {}) {
  const el = new GrampsjsViewRelatives()
  el.active = true
  el.appState = {
    i18n: {lang: 'en', strings: {}},
    settings: {},
    apiGet: vi.fn().mockResolvedValue({data: {anchor: null, groups: []}}),
    ...overrides.appState,
  }
  if (overrides.pageId !== undefined) el.pageId = overrides.pageId
  return el
}

describe('GrampsjsViewRelatives._resolveAnchor — precedence', () => {
  it('returns pageId when both pageId and homePerson are set', () => {
    const el = makeViewComponent({
      pageId: 'I0001',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {homePerson: 'I0002'},
        apiGet: vi.fn(),
      },
    })
    expect(el._resolveAnchor()).toBe('I0001')
  })

  it('returns homePerson when pageId is empty', () => {
    const el = makeViewComponent({
      pageId: '',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {homePerson: 'I0042'},
        apiGet: vi.fn(),
      },
    })
    expect(el._resolveAnchor()).toBe('I0042')
  })

  it('returns empty string when neither pageId nor homePerson is set', () => {
    const el = makeViewComponent({
      pageId: '',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {},
        apiGet: vi.fn(),
      },
    })
    expect(el._resolveAnchor()).toBe('')
  })

  it('returns empty string when settings is absent', () => {
    const el = makeViewComponent({
      pageId: '',
      appState: {
        i18n: {lang: 'en', strings: {}},
        apiGet: vi.fn(),
      },
    })
    expect(el._resolveAnchor()).toBe('')
  })
})

describe('GrampsjsViewRelatives._fetchData — URL and no-fetch behaviour', () => {
  it('fetches with pageId in URL when pageId is set', async () => {
    const apiGet = vi.fn().mockResolvedValue({data: {anchor: null, groups: []}})
    const el = makeViewComponent({
      pageId: 'I0001',
      appState: {i18n: {lang: 'en', strings: {}}, settings: {}, apiGet},
    })
    await el._fetchData()
    expect(apiGet).toHaveBeenCalledOnce()
    expect(apiGet.mock.calls[0][0]).toBe('/api/relatives/?handle=I0001')
  })

  it('fetches with homePerson in URL when pageId is empty but homePerson is set', async () => {
    const apiGet = vi.fn().mockResolvedValue({data: {anchor: null, groups: []}})
    const el = makeViewComponent({
      pageId: '',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {homePerson: 'I0042'},
        apiGet,
      },
    })
    await el._fetchData()
    expect(apiGet).toHaveBeenCalledOnce()
    expect(apiGet.mock.calls[0][0]).toBe('/api/relatives/?handle=I0042')
  })

  it('does NOT call apiGet when no anchor is resolvable', async () => {
    const apiGet = vi.fn()
    const el = makeViewComponent({
      pageId: '',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {},
        apiGet,
      },
    })
    await el._fetchData()
    expect(apiGet).not.toHaveBeenCalled()
    expect(el.loading).toBe(false)
    expect(el.error).toBe(false)
    expect(el._data).toBeNull()
  })

  it('sets error and null data on backend error without throwing', async () => {
    const apiGet = vi.fn().mockResolvedValue({error: 'Bad Request'})
    const el = makeViewComponent({
      pageId: 'I0001',
      appState: {i18n: {lang: 'en', strings: {}}, settings: {}, apiGet},
    })
    await el._fetchData()
    expect(el.error).toBe(true)
    expect(el._data).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// GrampsjsViewRelatives.renderContent() — three distinct render branches
// ---------------------------------------------------------------------------

describe('GrampsjsViewRelatives.renderContent — render branches', () => {
  it('shows guidance message when no anchor is resolvable', () => {
    const el = makeViewComponent({
      pageId: '',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {},
        apiGet: vi.fn(),
      },
    })
    el.loading = false
    el.error = false
    el._data = null
    const result = el.renderContent()
    // Must include the guidance string
    expect(
      hasValue(
        result,
        v =>
          typeof v === 'string' &&
          v.includes('Set a home person to see relatives')
      )
    ).toBe(true)
    // Must NOT include grampsjs-relatives element
    expect(hasString(result, s => s.includes('grampsjs-relatives'))).toBe(false)
  })

  it('shows grampsjs-relatives with ?error when anchor is set but fetch errored', () => {
    const el = makeViewComponent({
      pageId: 'I0001',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {},
        apiGet: vi.fn(),
      },
    })
    el.loading = false
    el.error = true
    el._data = null
    const result = el.renderContent()
    // Must NOT show the home-person guidance message
    expect(
      hasValue(
        result,
        v =>
          typeof v === 'string' &&
          v.includes('Set a home person to see relatives')
      )
    ).toBe(false)
    // Must render grampsjs-relatives (which has its own error state)
    expect(hasString(result, s => s.includes('grampsjs-relatives'))).toBe(true)
    // The ?error boolean attribute value should be truthy
    expect(hasValue(result, v => v === true)).toBe(true)
  })

  it('shows grampsjs-relatives normally on success', () => {
    const el = makeViewComponent({
      pageId: 'I0001',
      appState: {
        i18n: {lang: 'en', strings: {}},
        settings: {},
        apiGet: vi.fn(),
      },
    })
    el.loading = false
    el.error = false
    el._data = {anchor: null, groups: []}
    const result = el.renderContent()
    expect(hasString(result, s => s.includes('grampsjs-relatives'))).toBe(true)
    expect(
      hasValue(
        result,
        v =>
          typeof v === 'string' &&
          v.includes('Set a home person to see relatives')
      )
    ).toBe(false)
  })
})
