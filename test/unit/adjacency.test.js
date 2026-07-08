import {describe, it, expect} from 'vitest'
import {
  buildAdjacency,
  familyNodeExists,
  parentFamiliesOf,
} from '../../src/charts/adjacency.js'

const person = (handle, {ownFamilies = [], parentFamilies = []} = {}) => ({
  handle,
  gramps_id: handle,
  extended: {
    families: ownFamilies,
    parent_families: parentFamilies,
    primary_parent_family: parentFamilies[0],
  },
})
const fam = (handle, father, mother, children = []) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(ref => ({ref})),
})

describe('parentFamiliesOf', () => {
  it('returns all parent families when showAllParents is true', () => {
    const F1 = fam('F1', 'D1', 'M1')
    const F2 = fam('F2', 'D2', 'M2')
    const me = person('ME', {parentFamilies: [F1, F2]})
    expect(parentFamiliesOf(me, true)).toEqual([F1, F2])
  })
  it('returns only the primary parent family when showAllParents is false', () => {
    const F1 = fam('F1', 'D1', 'M1')
    const F2 = fam('F2', 'D2', 'M2')
    const me = person('ME', {parentFamilies: [F1, F2]})
    expect(parentFamiliesOf(me, false)).toEqual([F1])
  })
  it('returns an empty array when there is no parent family', () => {
    const me = person('ME')
    expect(parentFamiliesOf(me, false)).toEqual([])
    expect(parentFamiliesOf(me, true)).toEqual([])
  })
})

describe('familyNodeExists', () => {
  it('descending family needs BOTH parents known', () => {
    const known = new Set(['A'])
    expect(
      familyNodeExists(fam('F', 'A', 'B'), known, {asParentFamily: false})
    ).toBe(false)
    known.add('B')
    expect(
      familyNodeExists(fam('F', 'A', 'B'), known, {asParentFamily: false})
    ).toBe(true)
  })
  it('parent family needs only ONE parent known', () => {
    const known = new Set(['A'])
    expect(
      familyNodeExists(fam('F', 'A', 'B'), known, {asParentFamily: true})
    ).toBe(true)
  })
})

describe('buildAdjacency', () => {
  it('links child to parent family and spouses to their union', () => {
    const F = fam('F', 'DAD', 'MOM', ['ME'])
    const people = [
      person('DAD', {ownFamilies: [F]}),
      person('MOM', {ownFamilies: [F]}),
      person('ME', {parentFamilies: [F]}),
    ]
    const g = buildAdjacency(people, {showAllParents: true})
    expect(g.familyNodes.has('F')).toBe(true)
    expect(g.neighbors.get('ME').has('F')).toBe(true)
    expect(g.neighbors.get('DAD').has('F')).toBe(true)
    expect(g.ancEdges.get('ME').has('F')).toBe(true)
  })
  it('respects showAllParents=false (primary only)', () => {
    const F1 = fam('F1', 'D1', 'M1', ['ME'])
    const F2 = fam('F2', 'D2', 'M2', ['ME'])
    const me = {
      handle: 'ME',
      gramps_id: 'ME',
      extended: {
        families: [],
        parent_families: [F1, F2],
        primary_parent_family: F1,
      },
    }
    const people = [
      me,
      person('D1', {ownFamilies: [F1]}),
      person('M1', {ownFamilies: [F1]}),
      person('D2', {ownFamilies: [F2]}),
      person('M2', {ownFamilies: [F2]}),
    ]
    const g = buildAdjacency(people, {showAllParents: false})
    expect(g.ancEdges.get('ME').has('F1')).toBe(true)
    expect(g.ancEdges.get('ME').has('F2')).toBe(false)
  })
})
