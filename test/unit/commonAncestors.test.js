import {describe, it, expect, vi, beforeEach} from 'vitest'
import {
  personName,
  lifeYears,
  buildChainSegments,
  GrampsjsCommonAncestors,
} from '../../src/components/GrampsjsCommonAncestors.js'
import {hasString, hasValue} from './helpers.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ancestorPerson = {
  handle: 'handle_ancestor',
  gramps_id: 'I0010',
  name_given: 'Иван',
  name_surname: 'Иванов',
  sex: 'M',
  birth: {date: '1850'},
  death: {date: '1920'},
  media_list: [],
}

const intermediatePerson = {
  handle: 'handle_mid',
  gramps_id: 'I0020',
  name_given: 'Пётр',
  name_surname: 'Иванов',
  sex: 'M',
  birth: {date: '1875'},
  death: {date: '1940'},
  media_list: [],
}

const mockApiResponse = {
  relationship: 'второй кузен',
  ancestors: [
    {
      common_ancestors: [ancestorPerson],
      path_a: [intermediatePerson],
      path_b: [],
    },
  ],
}

const emptyApiResponse = {
  relationship: null,
  ancestors: [],
}

// ---------------------------------------------------------------------------
// Helper functions — unit tests
// ---------------------------------------------------------------------------

describe('personName', () => {
  it('returns "given surname" when both are present', () => {
    expect(personName(ancestorPerson)).toBe('Иван Иванов')
  })

  it('returns given name only when surname is absent', () => {
    expect(personName({name_given: 'Анна', name_surname: ''})).toBe('Анна')
  })

  it('returns surname only when given name is absent', () => {
    expect(personName({name_given: '', name_surname: 'Петров'})).toBe('Петров')
  })

  it('returns empty string for null/undefined', () => {
    expect(personName(null)).toBe('')
    expect(personName(undefined)).toBe('')
  })

  it('returns empty string when both names are absent', () => {
    expect(personName({})).toBe('')
  })
})

describe('lifeYears', () => {
  it('returns "(birth–death)" when both are present', () => {
    expect(lifeYears(ancestorPerson)).toBe('(1850–1920)')
  })

  it('returns "(birth–)" when only birth is known', () => {
    expect(lifeYears({birth: {date: '1950'}, death: {}})).toBe('(1950–)')
  })

  it('returns "(–death)" when only death is known', () => {
    expect(lifeYears({birth: {}, death: {date: '1975'}})).toBe('(–1975)')
  })

  it('returns empty string when no dates are present', () => {
    expect(lifeYears({birth: {}, death: {}})).toBe('')
    expect(lifeYears({})).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(lifeYears(null)).toBe('')
    expect(lifeYears(undefined)).toBe('')
  })

  it('extracts year correctly from a full ISO date string', () => {
    expect(
      lifeYears({birth: {date: '1900-03-15'}, death: {date: '1975-11-01'}})
    ).toBe('(1900–1975)')
  })
})

describe('buildChainSegments', () => {
  it('returns only ancestor when intermediates is empty', () => {
    const segs = buildChainSegments([], ancestorPerson)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toBe(ancestorPerson)
  })

  it('returns intermediates followed by ancestor', () => {
    const segs = buildChainSegments([intermediatePerson], ancestorPerson)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toBe(intermediatePerson)
    expect(segs[1]).toBe(ancestorPerson)
  })

  it('returns only ancestor when intermediates is null', () => {
    const segs = buildChainSegments(null, ancestorPerson)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toBe(ancestorPerson)
  })

  it('returns only ancestor when intermediates is undefined', () => {
    const segs = buildChainSegments(undefined, ancestorPerson)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toBe(ancestorPerson)
  })

  it('returns empty array when both args are absent', () => {
    const segs = buildChainSegments([], null)
    expect(segs).toHaveLength(0)
  })

  it('preserves order of multiple intermediates', () => {
    const mid2 = {...intermediatePerson, gramps_id: 'I0021'}
    const segs = buildChainSegments([intermediatePerson, mid2], ancestorPerson)
    expect(segs[0]).toBe(intermediatePerson)
    expect(segs[1]).toBe(mid2)
    expect(segs[2]).toBe(ancestorPerson)
  })
})

// ---------------------------------------------------------------------------
// GrampsjsCommonAncestors render — testing via the class methods directly
// (no DOM rendering needed: we call _renderEntry / render via the instance)
// ---------------------------------------------------------------------------

/**
 * Instantiate the component (no DOM), set properties, and call the render
 * method directly so we can inspect the TemplateResult tree.
 *
 * We bypass the Lit update lifecycle intentionally — we call render() after
 * manually setting the internal reactive properties that render() consumes.
 */
function makeComponent(overrides = {}) {
  const el = new GrampsjsCommonAncestors()
  // Provide minimal appState with translation passthrough
  el.appState = {
    i18n: {lang: 'en', strings: {}},
    apiGet: vi.fn().mockResolvedValue({data: mockApiResponse}),
    ...overrides.appState,
  }
  return el
}

describe('GrampsjsCommonAncestors render — no data (loading / empty / null)', () => {
  it('renders nothing while _loading is true', () => {
    const el = makeComponent()
    el._loading = true
    el._relationship = null
    el._ancestors = []
    const result = el.render()
    // empty html`` — no strings or meaningful values
    expect(hasString(result, s => s.trim().length > 0)).toBe(false)
  })

  it('renders nothing when relationship is null', () => {
    const el = makeComponent()
    el._loading = false
    el._relationship = null
    el._ancestors = [
      {common_ancestors: [ancestorPerson], path_a: [], path_b: []},
    ]
    const result = el.render()
    expect(hasString(result, s => s.trim().length > 0)).toBe(false)
  })

  it('renders nothing when ancestors array is empty', () => {
    const el = makeComponent()
    el._loading = false
    el._relationship = 'двоюродный брат'
    el._ancestors = []
    const result = el.render()
    expect(hasString(result, s => s.trim().length > 0)).toBe(false)
  })

  it('renders nothing on _error', () => {
    const el = makeComponent()
    el._loading = false
    el._error = true
    el._relationship = 'двоюродный брат'
    el._ancestors = [
      {common_ancestors: [ancestorPerson], path_a: [], path_b: []},
    ]
    const result = el.render()
    expect(hasString(result, s => s.trim().length > 0)).toBe(false)
  })
})

describe('GrampsjsCommonAncestors render — with data', () => {
  let el

  beforeEach(() => {
    el = makeComponent()
    el._loading = false
    el._error = false
    el._relationship = 'второй кузен'
    el._ancestors = [
      {
        common_ancestors: [ancestorPerson],
        path_a: [intermediatePerson],
        path_b: [],
      },
    ]
  })

  it('includes the relationship label in the output', () => {
    const result = el.render()
    expect(hasValue(result, v => v === 'второй кузен')).toBe(true)
  })

  it('includes the ancestor name in the rendered output', () => {
    const result = el.render()
    // ancestor name appears via personName() call in _renderAncestorChip and chain
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Иван'))
    ).toBe(true)
  })

  it('includes the ancestor surname in the rendered output', () => {
    const result = el.render()
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Иванов'))
    ).toBe(true)
  })

  it('includes life years for the ancestor chip', () => {
    const result = el.render()
    // lifeYears produces "(1850–1920)"
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('1850'))
    ).toBe(true)
  })

  it('includes intermediate person name as a path link', () => {
    const result = el.render()
    // Пётр Иванов is in path_a
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Пётр'))
    ).toBe(true)
  })

  it('includes a grampsjs-icon or grampsjs-img for the ancestor avatar', () => {
    const result = el.render()
    // ancestor has no media → falls back to grampsjs-icon
    expect(hasString(result, s => s.includes('grampsjs-icon'))).toBe(true)
  })

  it('includes grampsjs-img when ancestor has media', () => {
    el._ancestors = [
      {
        common_ancestors: [
          {...ancestorPerson, media_list: [{ref: 'photo_h', rect: []}]},
        ],
        path_a: [],
        path_b: [],
      },
    ]
    const result = el.render()
    expect(hasString(result, s => s.includes('grampsjs-img'))).toBe(true)
  })

  it('renders the arrow separator in path chains', () => {
    const result = el.render()
    // Path chains include '←' arrows — the arrow is a static text node (in strings)
    expect(hasString(result, s => s.includes('←'))).toBe(true)
  })

  it('path-link buttons have type="button"', () => {
    // Verify type="button" appears in the static template strings of chain buttons
    const result = el.render()
    expect(hasString(result, s => s.includes('type="button"'))).toBe(true)
  })
})

describe('GrampsjsCommonAncestors — sibling case (two common ancestors)', () => {
  it('renders chips for both ancestor parents', () => {
    const father = {
      ...ancestorPerson,
      handle: 'h_father',
      gramps_id: 'I0050',
      name_given: 'Алексей',
      sex: 'M',
    }
    const mother = {
      ...ancestorPerson,
      handle: 'h_mother',
      gramps_id: 'I0051',
      name_given: 'Ольга',
      name_surname: 'Иванова',
      sex: 'F',
    }
    const el = makeComponent()
    el._loading = false
    el._error = false
    el._relationship = 'брат'
    el._ancestors = [
      {
        common_ancestors: [father, mother],
        path_a: [],
        path_b: [],
      },
    ]
    const result = el.render()
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Алексей'))
    ).toBe(true)
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Ольга'))
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// _buildChainHtml — unit test for the deduplicated chain helper
// ---------------------------------------------------------------------------

describe('GrampsjsCommonAncestors._buildChainHtml', () => {
  let el

  beforeEach(() => {
    el = makeComponent()
  })

  it('returns empty string when segments is empty (both paths null, no ancestor)', () => {
    const result = el._buildChainHtml('Subject', [], null)
    expect(result).toBe('')
  })

  it('renders endpoint label and ancestor when path is empty (direct child)', () => {
    // path_a=[], ancestor present → Subject ← ancestor
    const result = el._buildChainHtml('Subject', [], ancestorPerson)
    expect(hasValue(result, v => v === 'Subject')).toBe(true)
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Иван'))
    ).toBe(true)
    expect(hasString(result, s => s.includes('←'))).toBe(true)
  })

  it('includes the intermediate person in the chain', () => {
    const result = el._buildChainHtml(
      'Subject',
      [intermediatePerson],
      ancestorPerson
    )
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Пётр'))
    ).toBe(true)
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('Иван'))
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// GrampsjsCommonAncestors._fetchData — apiGet mock
// ---------------------------------------------------------------------------

describe('GrampsjsCommonAncestors._fetchData — apiGet mock', () => {
  it('sets _relationship and _ancestors from a successful response', async () => {
    const el = makeComponent({
      appState: {
        i18n: {lang: 'en', strings: {}},
        apiGet: vi.fn().mockResolvedValue({data: mockApiResponse}),
      },
    })
    el.handle = 'handle_subject'
    await el._fetchData()
    expect(el._relationship).toBe('второй кузен')
    expect(el._ancestors).toHaveLength(1)
    expect(el._error).toBe(false)
  })

  it('sets _error=true and clears data when apiGet returns an error', async () => {
    const el = makeComponent({
      appState: {
        i18n: {lang: 'en', strings: {}},
        apiGet: vi.fn().mockResolvedValue({error: 'Not found'}),
      },
    })
    el.handle = 'handle_subject'
    await el._fetchData()
    expect(el._error).toBe(true)
    expect(el._relationship).toBeNull()
    expect(el._ancestors).toHaveLength(0)
  })

  it('clears data and does nothing when handle is empty', async () => {
    const el = makeComponent()
    el.handle = ''
    await el._fetchData()
    expect(el._relationship).toBeNull()
    expect(el._ancestors).toHaveLength(0)
    expect(el.appState.apiGet).not.toHaveBeenCalled()
  })

  it('sets _relationship=null and hides block when response has null relationship', async () => {
    const el = makeComponent({
      appState: {
        i18n: {lang: 'en', strings: {}},
        apiGet: vi.fn().mockResolvedValue({data: emptyApiResponse}),
      },
    })
    el.handle = 'handle_subject'
    await el._fetchData()
    expect(el._relationship).toBeNull()
    expect(el._ancestors).toHaveLength(0)
    // Render should produce nothing
    el._loading = false
    const result = el.render()
    expect(hasString(result, s => s.trim().length > 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// I3 — appState timing: fetch still fires when appState arrives after handle
// ---------------------------------------------------------------------------

describe('GrampsjsCommonAncestors._canFetch — appState timing guard', () => {
  it('returns false when handle is set but appState has no apiGet', () => {
    const el = new GrampsjsCommonAncestors()
    el.handle = 'handle_subject'
    // appState is the default {} from the mixin constructor
    expect(el._canFetch()).toBe(false)
  })

  it('returns false when appState.apiGet is present but handle is empty', () => {
    const el = new GrampsjsCommonAncestors()
    el.handle = ''
    el.appState = {
      i18n: {lang: 'en', strings: {}},
      apiGet: vi.fn(),
    }
    expect(el._canFetch()).toBe(false)
  })

  it('returns true when both handle and appState.apiGet are set', () => {
    const el = new GrampsjsCommonAncestors()
    el.handle = 'handle_subject'
    el.appState = {
      i18n: {lang: 'en', strings: {}},
      apiGet: vi.fn(),
    }
    expect(el._canFetch()).toBe(true)
  })

  it('fetches successfully when appState arrives after handle', async () => {
    // Simulate: handle set first, then appState arrives
    const apiGet = vi.fn().mockResolvedValue({data: mockApiResponse})
    const el = new GrampsjsCommonAncestors()
    el.handle = 'handle_subject'
    // At this point _canFetch() is false → no fetch yet

    // Now appState arrives
    el.appState = {i18n: {lang: 'en', strings: {}}, apiGet}
    // Manually call _fetchData (simulates what updated() does after appState change)
    await el._fetchData()

    expect(apiGet).toHaveBeenCalledOnce()
    expect(el._relationship).toBe('второй кузен')
    expect(el._ancestors).toHaveLength(1)
    expect(el._loading).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GrampsjsCommonAncestors — `to` property: URL construction
// ---------------------------------------------------------------------------

describe('GrampsjsCommonAncestors — to property in fetch URL', () => {
  it('includes ?to=<value> in the URL when to is set', async () => {
    const apiGet = vi.fn().mockResolvedValue({data: mockApiResponse})
    const el = makeComponent({
      appState: {i18n: {lang: 'en', strings: {}}, apiGet},
    })
    el.handle = 'handle_subject'
    el.to = 'handle_home'
    await el._fetchData()
    expect(apiGet).toHaveBeenCalledOnce()
    const url = apiGet.mock.calls[0][0]
    expect(url).toContain('?locale=en')
    expect(url).toContain('&to=handle_home')
  })

  it('omits to param from the URL when to is empty', async () => {
    const apiGet = vi.fn().mockResolvedValue({data: mockApiResponse})
    const el = makeComponent({
      appState: {i18n: {lang: 'en', strings: {}}, apiGet},
    })
    el.handle = 'handle_subject'
    el.to = ''
    await el._fetchData()
    expect(apiGet).toHaveBeenCalledOnce()
    const url = apiGet.mock.calls[0][0]
    expect(url).not.toContain('to=')
  })

  it('URI-encodes the to value', async () => {
    const apiGet = vi.fn().mockResolvedValue({data: mockApiResponse})
    const el = makeComponent({
      appState: {i18n: {lang: 'en', strings: {}}, apiGet},
    })
    el.handle = 'handle_subject'
    el.to = 'handle with spaces'
    await el._fetchData()
    const url = apiGet.mock.calls[0][0]
    // encodeURIComponent encodes spaces as %20
    expect(url).toContain('handle%20with%20spaces')
  })

  it('_canFetch still requires handle (to alone is not enough)', () => {
    const el = new GrampsjsCommonAncestors()
    el.handle = ''
    el.to = 'handle_home'
    el.appState = {i18n: {lang: 'en', strings: {}}, apiGet: vi.fn()}
    expect(el._canFetch()).toBe(false)
  })
})
