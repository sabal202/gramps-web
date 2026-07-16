import {describe, it, expect} from 'vitest'
import {buildDistantLabel} from '../../src/components/relativesLabels.js'

// ---------------------------------------------------------------------------
// Direct ancestor/descendant lines
// ---------------------------------------------------------------------------

describe('buildDistantLabel — ancestors_N / descendants_N', () => {
  it('ancestors_4 ru', () => {
    expect(buildDistantLabel('ancestors_4', 'ru')).toBe(
      'Прапрадедушки и прапрабабушки'
    )
  })

  it('ancestors_4 en', () => {
    expect(buildDistantLabel('ancestors_4', 'en')).toBe(
      '2nd great-grandparents'
    )
  })

  it('ancestors_5 ru spelled out', () => {
    expect(buildDistantLabel('ancestors_5', 'ru')).toBe(
      'Прапрапрадедушки и прапрапрабабушки'
    )
  })

  it('ancestors_6 ru compact', () => {
    expect(buildDistantLabel('ancestors_6', 'ru')).toBe(
      '4-пра-дедушки и бабушки'
    )
  })

  it('ancestors_6 en', () => {
    expect(buildDistantLabel('ancestors_6', 'en')).toBe(
      '4th great-grandparents'
    )
  })

  it('descendants_4 ru', () => {
    expect(buildDistantLabel('descendants_4', 'ru')).toBe(
      'Праправнуки и праправнучки'
    )
  })

  it('descendants_4 en', () => {
    expect(buildDistantLabel('descendants_4', 'en')).toBe(
      '2nd great-grandchildren'
    )
  })
})

// ---------------------------------------------------------------------------
// Collateral lines: great-uncle/aunt, great-niece/nephew
// ---------------------------------------------------------------------------

describe('buildDistantLabel — great_uncle_aunt_M / great_niece_nephew_M', () => {
  it('great_uncle_aunt_1 ru (regression guard on дяди->дедушки fix)', () => {
    expect(buildDistantLabel('great_uncle_aunt_1', 'ru')).toBe(
      'Двоюродные дедушки и бабушки'
    )
  })

  it('great_uncle_aunt_1 en', () => {
    expect(buildDistantLabel('great_uncle_aunt_1', 'en')).toBe(
      'Great-uncles and great-aunts'
    )
  })

  it('great_uncle_aunt_2 ru', () => {
    expect(buildDistantLabel('great_uncle_aunt_2', 'ru')).toBe(
      'Двоюродные прадедушки и прабабушки'
    )
  })

  it('great_uncle_aunt_2 en', () => {
    expect(buildDistantLabel('great_uncle_aunt_2', 'en')).toBe(
      '2nd great-uncles and great-aunts'
    )
  })

  it('great_uncle_aunt_4 ru spelled out', () => {
    expect(buildDistantLabel('great_uncle_aunt_4', 'ru')).toBe(
      'Двоюродные прапрапрадедушки и прапрапрабабушки'
    )
  })

  it('great_uncle_aunt_5 ru compact', () => {
    expect(buildDistantLabel('great_uncle_aunt_5', 'ru')).toBe(
      'Двоюродные 4-пра-дедушки и бабушки'
    )
  })

  it('great_niece_nephew_2 ru', () => {
    expect(buildDistantLabel('great_niece_nephew_2', 'ru')).toBe(
      'Двоюродные правнуки и правнучки'
    )
  })

  it('great_niece_nephew_2 en', () => {
    expect(buildDistantLabel('great_niece_nephew_2', 'en')).toBe(
      '2nd great-nieces and great-nephews'
    )
  })
})

// ---------------------------------------------------------------------------
// Cousins
// ---------------------------------------------------------------------------

describe('buildDistantLabel — cousins_N', () => {
  it('cousins_4 ru', () => {
    expect(buildDistantLabel('cousins_4', 'ru')).toBe(
      'Пятиюродные братья и сёстры'
    )
  })

  it('cousins_4 en', () => {
    expect(buildDistantLabel('cousins_4', 'en')).toBe('Fourth cousins')
  })

  it('cousins_4 ru starts with a capital П', () => {
    expect(buildDistantLabel('cousins_4', 'ru').charAt(0)).toBe('П')
  })
})

describe('buildDistantLabel — cousins_N_removed_M (intended override)', () => {
  it('cousins_1_removed_1 ru', () => {
    expect(buildDistantLabel('cousins_1_removed_1', 'ru')).toBe(
      'Двоюродные братья и сёстры, +1 поколение'
    )
  })

  it('cousins_1_removed_1 en', () => {
    expect(buildDistantLabel('cousins_1_removed_1', 'en')).toBe(
      'First cousins once removed'
    )
  })

  it('cousins_2_removed_3 ru', () => {
    expect(buildDistantLabel('cousins_2_removed_3', 'ru')).toBe(
      'Троюродные братья и сёстры, +3 поколения'
    )
  })

  it('cousins_2_removed_3 en', () => {
    expect(buildDistantLabel('cousins_2_removed_3', 'en')).toBe(
      'Second cousins three times removed'
    )
  })

  it('cousins_1_removed_1 de returns null (map preserved for other languages)', () => {
    expect(buildDistantLabel('cousins_1_removed_1', 'de')).toBeNull()
  })

  it('pluralRu boundary M=1', () => {
    expect(buildDistantLabel('cousins_1_removed_1', 'ru')).toContain(
      '+1 поколение'
    )
  })

  it('pluralRu boundary M=2', () => {
    expect(buildDistantLabel('cousins_1_removed_2', 'ru')).toContain(
      '+2 поколения'
    )
  })

  it('pluralRu boundary M=5', () => {
    expect(buildDistantLabel('cousins_1_removed_5', 'ru')).toContain(
      '+5 поколений'
    )
  })

  it('pluralRu boundary M=11', () => {
    expect(buildDistantLabel('cousins_1_removed_11', 'ru')).toContain(
      '+11 поколений'
    )
  })

  it('pluralRu boundary M=21', () => {
    expect(buildDistantLabel('cousins_1_removed_21', 'ru')).toContain(
      '+21 поколение'
    )
  })
})

// ---------------------------------------------------------------------------
// null fallback cases
// ---------------------------------------------------------------------------

describe('buildDistantLabel — null fallback', () => {
  it('returns null for a core mapped key (parents, ru)', () => {
    expect(buildDistantLabel('parents', 'ru')).toBeNull()
  })

  it('returns null for a still-mapped cousin key (cousins_2, ru)', () => {
    expect(buildDistantLabel('cousins_2', 'ru')).toBeNull()
  })

  it('returns null for a core mapped key (grandparents, en)', () => {
    expect(buildDistantLabel('grandparents', 'en')).toBeNull()
  })

  it('returns null for a non-ru/en language (de)', () => {
    expect(buildDistantLabel('ancestors_4', 'de')).toBeNull()
  })

  it('returns null for empty lang', () => {
    expect(buildDistantLabel('ancestors_4', '')).toBeNull()
  })

  it('returns null for undefined lang', () => {
    expect(buildDistantLabel('ancestors_4', undefined)).toBeNull()
  })

  it('returns null for an unknown key', () => {
    expect(buildDistantLabel('some_unknown_key', 'ru')).toBeNull()
  })
})
