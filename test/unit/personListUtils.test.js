import {describe, it, expect} from 'vitest'
import {html} from 'lit'
import {
  renderPersonAvatar,
  renderPersonDates,
  renderPersonListItem,
} from '../../src/components/personListUtils.js'

// ---------------------------------------------------------------------------
// Helpers — inspect Lit TemplateResult trees
// ---------------------------------------------------------------------------

/**
 * Return true if any string literal (static template part) in the
 * TemplateResult tree satisfies the predicate.  Element names and fixed
 * attribute names live in `strings`, not in `values`.
 */
function hasString(templateResult, pred) {
  if (!templateResult || typeof templateResult !== 'object') return false
  const strs = templateResult.strings
  if (Array.isArray(strs) && strs.some(s => typeof s === 'string' && pred(s)))
    return true
  const vals = templateResult.values
  if (!Array.isArray(vals)) return false
  return vals.some(v => hasString(v, pred))
}

/**
 * Return true if any dynamic value in the TemplateResult tree satisfies the
 * predicate.  Interpolated expressions (attribute values, property bindings)
 * live in `values`.
 */
function hasValue(templateResult, pred) {
  if (!templateResult || typeof templateResult !== 'object') return false
  const vals = templateResult.values
  if (!Array.isArray(vals)) return false
  for (const v of vals) {
    if (pred(v)) return true
    if (v && typeof v === 'object' && hasValue(v, pred)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleProfile = {
  name_given: 'Иван',
  name_surname: 'Иванов',
  sex: 'M',
  birth: {date: '1900'},
  death: {date: '1975', age: '75'},
}

const sampleExtPersonWithMedia = {
  media_list: [{ref: 'media_handle_1', rect: [10, 20, 90, 80]}],
}

const sampleExtPersonNoMedia = {
  media_list: [],
}

// ---------------------------------------------------------------------------
// renderPersonAvatar
// ---------------------------------------------------------------------------

describe('renderPersonAvatar', () => {
  it('returns a grampsjs-img element when media_list has an entry', () => {
    const result = renderPersonAvatar(sampleExtPersonWithMedia, 'M')
    expect(hasString(result, s => s.includes('grampsjs-img'))).toBe(true)
  })

  it('includes the gender ring color for male as a dynamic value', () => {
    const result = renderPersonAvatar(sampleExtPersonNoMedia, 'M')
    expect(
      hasValue(
        result,
        v => typeof v === 'string' && v.includes('var(--color-boy)')
      )
    ).toBe(true)
  })

  it('includes the gender ring color for female as a dynamic value', () => {
    const result = renderPersonAvatar(sampleExtPersonNoMedia, 'F')
    expect(
      hasValue(
        result,
        v => typeof v === 'string' && v.includes('var(--color-girl)')
      )
    ).toBe(true)
  })

  it('falls back to unknown color for unknown sex', () => {
    const result = renderPersonAvatar(sampleExtPersonNoMedia, 'U')
    expect(
      hasValue(
        result,
        v => typeof v === 'string' && v.includes('var(--color-unknown)')
      )
    ).toBe(true)
  })

  it('returns a grampsjs-icon when there is no media', () => {
    const result = renderPersonAvatar(sampleExtPersonNoMedia, 'M')
    expect(hasString(result, s => s.includes('grampsjs-icon'))).toBe(true)
  })

  it('returns a grampsjs-icon when extPerson is null', () => {
    const result = renderPersonAvatar(null, 'F')
    expect(hasString(result, s => s.includes('grampsjs-icon'))).toBe(true)
  })

  it('includes the media handle as a value for grampsjs-img', () => {
    const result = renderPersonAvatar(sampleExtPersonWithMedia, 'M')
    expect(hasValue(result, v => v === 'media_handle_1')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// renderPersonDates
// ---------------------------------------------------------------------------

describe('renderPersonDates', () => {
  it('returns empty string when profile has no dates', () => {
    expect(renderPersonDates({})).toBe('')
  })

  it('returns empty string for null/undefined profile', () => {
    expect(renderPersonDates(null)).toBe('')
    expect(renderPersonDates(undefined)).toBe('')
  })

  it('includes birth date year in values', () => {
    const result = renderPersonDates({birth: {date: '1900'}})
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('1900'))
    ).toBe(true)
  })

  it('includes death date year in values', () => {
    const result = renderPersonDates({death: {date: '1975'}})
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('1975'))
    ).toBe(true)
  })

  it('includes age string when showAge=true (default) and age is present', () => {
    const result = renderPersonDates({death: {date: '1975', age: '75'}})
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('(75)'))
    ).toBe(true)
  })

  it('omits age string when showAge=false', () => {
    const result = renderPersonDates(
      {death: {date: '1975', age: '75'}},
      {showAge: false}
    )
    // date still present
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('1975'))
    ).toBe(true)
    // but age string "(75)" is absent in values
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('(75)'))
    ).toBe(false)
  })

  it('wraps output in a slot="supporting-text" span', () => {
    const result = renderPersonDates({birth: {date: '1900'}})
    expect(hasString(result, s => s.includes('supporting-text'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// renderPersonListItem
// ---------------------------------------------------------------------------

describe('renderPersonListItem', () => {
  it('includes the given name in values', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
    })
    expect(hasValue(result, v => v === 'Иван')).toBe(true)
  })

  it('includes the surname in values', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
    })
    expect(hasValue(result, v => v === 'Иванов')).toBe(true)
  })

  it('includes the birth year from dates sub-template', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
    })
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('1900'))
    ).toBe(true)
  })

  it('includes death year from dates sub-template', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
    })
    expect(
      hasValue(result, v => typeof v === 'string' && v.includes('1975'))
    ).toBe(true)
  })

  it('includes grampsjs-icon in strings when extPerson has no media', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
    })
    expect(hasString(result, s => s.includes('grampsjs-icon'))).toBe(true)
  })

  it('includes grampsjs-img in strings when extPerson has media', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonWithMedia,
    })
    expect(hasString(result, s => s.includes('grampsjs-img'))).toBe(true)
  })

  it('includes supportingText TemplateResult as a value when provided', () => {
    const supporting = html`<span slot="supporting-text">Father: Birth</span>`
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
      supportingText: supporting,
    })
    // The supportingText TemplateResult is passed as a value in the outer template
    // Its strings contain the slot markup
    expect(hasString(result, s => s.includes('supporting-text'))).toBe(true)
  })

  it('contains only empty string for supportingText slot when not provided', () => {
    const result = renderPersonListItem({
      profile: sampleProfile,
      extPerson: sampleExtPersonNoMedia,
    })
    // When no supportingText is passed the helper emits '' in its place.
    // We assert this via the tree-walker: the empty string must appear as a value,
    // and no value should be a TemplateResult whose strings mention 'supporting-text'
    // (the dates sub-template uses that slot, but it is a nested TemplateResult, not
    // the direct '' placeholder we care about here).
    expect(hasValue(result, v => v === '')).toBe(true)
    // Confirm no direct string value (non-TemplateResult) carrying 'supporting-text'
    // was injected as a plain string from the supportingText position.
    expect(
      hasValue(
        result,
        v => typeof v === 'string' && v.includes('supporting-text')
      )
    ).toBe(false)
  })

  it('renders empty strings for name parts when profile has no name', () => {
    const result = renderPersonListItem({
      profile: {},
      extPerson: null,
    })
    // Both name_given and name_surname default to '' — confirm via tree-walker.
    // We assert '' appears as a value (at least two — one per name field).
    const emptyCount = result.values.filter(v => v === '').length
    expect(emptyCount).toBeGreaterThanOrEqual(2)
    // And no non-empty name strings should be present.
    expect(hasValue(result, v => v === 'Иван' || v === 'Иванов')).toBe(false)
  })

  it('handles null profile gracefully without throwing', () => {
    expect(() =>
      renderPersonListItem({profile: null, extPerson: null})
    ).not.toThrow()
  })

  it('handles missing extPerson gracefully without throwing', () => {
    expect(() => renderPersonListItem({profile: sampleProfile})).not.toThrow()
  })

  it('passes sex through to avatar ring color', () => {
    const resultM = renderPersonListItem({
      profile: {...sampleProfile, sex: 'M'},
      extPerson: null,
    })
    const resultF = renderPersonListItem({
      profile: {...sampleProfile, sex: 'F'},
      extPerson: null,
    })
    expect(
      hasValue(
        resultM,
        v => typeof v === 'string' && v.includes('var(--color-boy)')
      )
    ).toBe(true)
    expect(
      hasValue(
        resultF,
        v => typeof v === 'string' && v.includes('var(--color-girl)')
      )
    ).toBe(true)
  })
})
