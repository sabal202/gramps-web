import {describe, it, expect} from 'vitest'
import {
  selectParentFamilies,
  childRefStyle,
  descendantChildRefs,
} from '../../src/charts/familyHelpers.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makeFamily = (handle, fatherHandle, motherHandle, childRefs = []) => ({
  handle,
  father_handle: fatherHandle,
  mother_handle: motherHandle,
  child_ref_list: childRefs,
})

const makeChildRef = (ref, frel = 'Birth', mrel = 'Birth') => ({
  ref,
  frel,
  mrel,
})

// ---------------------------------------------------------------------------
// selectParentFamilies
// ---------------------------------------------------------------------------

describe('selectParentFamilies', () => {
  const primaryFamily = makeFamily('F1', 'P1', 'P2', [])
  const secondaryFamily = makeFamily('F2', 'P3', 'P4', [])

  it('returns parent_families when present and non-empty', () => {
    const person = {
      extended: {
        parent_families: [primaryFamily, secondaryFamily],
        primary_parent_family: primaryFamily,
      },
    }
    const result = selectParentFamilies(person)
    expect(result).toEqual([primaryFamily, secondaryFamily])
  })

  it('falls back to [primary_parent_family] when parent_families is missing', () => {
    const person = {
      extended: {
        primary_parent_family: primaryFamily,
      },
    }
    const result = selectParentFamilies(person)
    expect(result).toEqual([primaryFamily])
  })

  it('falls back to [primary_parent_family] when parent_families is undefined', () => {
    const person = {
      extended: {
        parent_families: undefined,
        primary_parent_family: primaryFamily,
      },
    }
    expect(selectParentFamilies(person)).toEqual([primaryFamily])
  })

  it('falls back to [primary_parent_family] when parent_families is empty array', () => {
    const person = {
      extended: {
        parent_families: [],
        primary_parent_family: primaryFamily,
      },
    }
    expect(selectParentFamilies(person)).toEqual([primaryFamily])
  })

  it('returns [] when neither parent_families nor primary_parent_family present', () => {
    const person = {extended: {}}
    expect(selectParentFamilies(person)).toEqual([])
  })

  it('returns [] when extended is missing entirely', () => {
    const person = {}
    expect(selectParentFamilies(person)).toEqual([])
  })

  it('returns [] when primary_parent_family is falsy and parent_families is empty', () => {
    const person = {
      extended: {
        parent_families: [],
        primary_parent_family: null,
      },
    }
    expect(selectParentFamilies(person)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// childRefStyle
// ---------------------------------------------------------------------------

describe('childRefStyle', () => {
  it('Birth/Birth → {dashed: false} (solid)', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Birth', 'Birth'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: false})
  })

  it('Adopted father (frel=Adopted, mrel=Birth) → dashed', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Adopted', 'Birth'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('Stepchild father (frel=Stepchild, mrel=Birth) → dashed', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Stepchild', 'Birth'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('Foster father (frel=Foster, mrel=Birth) → dashed', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Foster', 'Birth'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('non-birth mother (frel=Birth, mrel=Adopted) → dashed', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Birth', 'Adopted'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('non-birth mother (frel=Birth, mrel=Stepchild) → dashed', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Birth', 'Stepchild'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('frel=None, mrel=Birth → solid (desktop correction)', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'None', 'Birth'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: false})
  })

  it('frel=None, mrel=Adopted → dashed (correction does NOT apply)', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'None', 'Adopted'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('frel=None, mrel=None → dashed (correction only for mrel=Birth)', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'None', 'None'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })

  it('personHandle not in child_ref_list (broken ref) → {dashed: false}', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Birth', 'Birth'),
    ])
    expect(childRefStyle(family, 'NOBODY')).toEqual({dashed: false})
  })

  it('empty child_ref_list → {dashed: false}', () => {
    const family = makeFamily('F1', 'P1', 'P2', [])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: false})
  })

  it('null family → {dashed: false}', () => {
    expect(childRefStyle(null, 'C1')).toEqual({dashed: false})
  })

  it('undefined family → {dashed: false}', () => {
    expect(childRefStyle(undefined, 'C1')).toEqual({dashed: false})
  })

  it('family with null child_ref_list → {dashed: false}', () => {
    const family = {
      handle: 'F1',
      father_handle: 'P1',
      mother_handle: 'P2',
      child_ref_list: null,
    }
    expect(childRefStyle(family, 'C1')).toEqual({dashed: false})
  })

  it('missing frel/mrel default to Birth (solid)', () => {
    const family = makeFamily('F1', 'P1', 'P2', [{ref: 'C1'}])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: false})
  })

  it('both Adopted/Adopted → dashed', () => {
    const family = makeFamily('F1', 'P1', 'P2', [
      makeChildRef('C1', 'Adopted', 'Adopted'),
    ])
    expect(childRefStyle(family, 'C1')).toEqual({dashed: true})
  })
})

// ---------------------------------------------------------------------------
// descendantChildRefs
// ---------------------------------------------------------------------------

describe('descendantChildRefs', () => {
  // Family: father=F, mother=M, three children:
  //   C1: frel=Birth,   mrel=Birth
  //   C2: frel=Adopted, mrel=Birth    (non-birth to father, birth to mother)
  //   C3: frel=Birth,   mrel=Adopted  (birth to father, non-birth to mother)
  const family = makeFamily('F1', 'FATHER', 'MOTHER', [
    makeChildRef('C1', 'Birth', 'Birth'),
    makeChildRef('C2', 'Adopted', 'Birth'),
    makeChildRef('C3', 'Birth', 'Adopted'),
  ])

  describe('parent is father', () => {
    it('includeNonBirth:false → only frel=Birth children, all dashed:false', () => {
      const result = descendantChildRefs(family, 'FATHER', {
        includeNonBirth: false,
      })
      expect(result).toEqual([
        {ref: 'C1', dashed: false},
        {ref: 'C3', dashed: false},
      ])
    })

    it('includeNonBirth:true → all children, dashed per frel', () => {
      const result = descendantChildRefs(family, 'FATHER', {
        includeNonBirth: true,
      })
      expect(result).toEqual([
        {ref: 'C1', dashed: false},
        {ref: 'C2', dashed: true},
        {ref: 'C3', dashed: false},
      ])
    })
  })

  describe('parent is mother', () => {
    it('includeNonBirth:false → only mrel=Birth children, all dashed:false', () => {
      const result = descendantChildRefs(family, 'MOTHER', {
        includeNonBirth: false,
      })
      expect(result).toEqual([
        {ref: 'C1', dashed: false},
        {ref: 'C2', dashed: false},
      ])
    })

    it('includeNonBirth:true → all children, dashed per mrel', () => {
      const result = descendantChildRefs(family, 'MOTHER', {
        includeNonBirth: true,
      })
      expect(result).toEqual([
        {ref: 'C1', dashed: false},
        {ref: 'C2', dashed: false},
        {ref: 'C3', dashed: true},
      ])
    })
  })

  it('parentHandle matches neither father nor mother → returns []', () => {
    const result = descendantChildRefs(family, 'NOBODY', {
      includeNonBirth: true,
    })
    expect(result).toEqual([])
  })

  it('missing frel/mrel defaults to Birth (not dashed)', () => {
    const f = makeFamily('F2', 'DAD', 'MOM', [{ref: 'C1'}])
    const result = descendantChildRefs(f, 'DAD', {includeNonBirth: true})
    expect(result).toEqual([{ref: 'C1', dashed: false}])
  })

  it('null family → []', () => {
    expect(descendantChildRefs(null, 'DAD', {includeNonBirth: true})).toEqual(
      []
    )
  })

  it('undefined family → []', () => {
    expect(
      descendantChildRefs(undefined, 'DAD', {includeNonBirth: false})
    ).toEqual([])
  })

  it('family with null child_ref_list → []', () => {
    const f = {
      handle: 'F1',
      father_handle: 'DAD',
      mother_handle: 'MOM',
      child_ref_list: null,
    }
    expect(descendantChildRefs(f, 'DAD', {includeNonBirth: true})).toEqual([])
  })

  it('empty child_ref_list → []', () => {
    const f = makeFamily('F1', 'DAD', 'MOM', [])
    expect(descendantChildRefs(f, 'DAD', {includeNonBirth: true})).toEqual([])
  })

  it('single-parent family: father only (mother_handle falsy), father anchor → uses frel', () => {
    const f = makeFamily('F1', 'DAD', '', [
      makeChildRef('C1', 'Adopted', 'Birth'),
    ])
    const result = descendantChildRefs(f, 'DAD', {includeNonBirth: true})
    expect(result).toEqual([{ref: 'C1', dashed: true}])
  })

  it('single-parent family: mother only (father_handle falsy), mother anchor → uses mrel', () => {
    const f = makeFamily('F1', '', 'MOM', [
      makeChildRef('C1', 'Birth', 'Adopted'),
    ])
    const result = descendantChildRefs(f, 'MOM', {includeNonBirth: true})
    expect(result).toEqual([{ref: 'C1', dashed: true}])
  })
})
