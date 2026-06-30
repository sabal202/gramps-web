import {describe, it, expect} from 'vitest'
import {getDescendantTree} from '../../src/charts/util.js'

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

const makePerson = (handle, familyHandles = [], childRefs = []) => ({
  handle,
  gramps_id: handle,
  primary_name: {surname_list: []},
  profile: {name_given: handle, name_surname: ''},
  extended: {
    families: familyHandles,
    primary_parent_family: null,
  },
})

// Build a family object (as returned inside person.extended.families)
const makeFamily = (handle, fatherHandle, motherHandle, childRefList = []) => ({
  handle,
  father_handle: fatherHandle,
  mother_handle: motherHandle,
  child_ref_list: childRefList,
})

const makeChildRef = (ref, frel = 'Birth', mrel = 'Birth') => ({
  ref,
  frel,
  mrel,
})

// ---------------------------------------------------------------------------
// Scenario: one parent (PARENT) has two children:
//   C1 — birth child (solid)
//   C2 — adopted child (dashed when includeNonBirth)
// ---------------------------------------------------------------------------

const buildScenario = () => {
  const family = makeFamily('F1', 'PARENT', 'OTHER', [
    makeChildRef('C1', 'Birth', 'Birth'),
    makeChildRef('C2', 'Adopted', 'Birth'), // non-birth via frel
  ])

  const parent = makePerson('PARENT', [family])
  const c1 = makePerson('C1')
  const c2 = makePerson('C2')

  const data = [parent, c1, c2]
  return data
}

// ---------------------------------------------------------------------------
// Tests: includeNonBirth = false (default) — current behaviour preserved
// ---------------------------------------------------------------------------

describe('getDescendantTree — includeNonBirth false (default)', () => {
  const data = buildScenario()

  it('only birth children appear when includeNonBirth is false', () => {
    const tree = getDescendantTree(data, 'PARENT', 3, false)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].person.handle).toBe('C1')
  })

  it('no child node has dashed:true when includeNonBirth is false', () => {
    const tree = getDescendantTree(data, 'PARENT', 3, false)
    for (const child of tree.children) {
      expect(child.dashed).toBeFalsy()
    }
  })

  it('default (no includeNonBirth arg) behaves like false', () => {
    const tree = getDescendantTree(data, 'PARENT', 3)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].person.handle).toBe('C1')
  })
})

// ---------------------------------------------------------------------------
// Tests: includeNonBirth = true
// ---------------------------------------------------------------------------

describe('getDescendantTree — includeNonBirth true', () => {
  const data = buildScenario()

  it('non-birth children appear when includeNonBirth is true', () => {
    const tree = getDescendantTree(data, 'PARENT', 3, true)
    const handles = tree.children.map(c => c.person.handle)
    expect(handles).toContain('C1')
    expect(handles).toContain('C2')
  })

  it('birth child has dashed falsy', () => {
    const tree = getDescendantTree(data, 'PARENT', 3, true)
    const c1 = tree.children.find(c => c.person.handle === 'C1')
    expect(c1.dashed).toBeFalsy()
  })

  it('non-birth child has dashed:true', () => {
    const tree = getDescendantTree(data, 'PARENT', 3, true)
    const c2 = tree.children.find(c => c.person.handle === 'C2')
    expect(c2.dashed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: deduplication — a child listed in two families appears only once
// ---------------------------------------------------------------------------

describe('getDescendantTree — deduplication', () => {
  // PARENT is father in F1 (birth child C1) and also father in F2 (same C1, birth)
  // C1 is erroneously listed in both families.
  const buildDedupScenario = () => {
    const family1 = makeFamily('F1', 'PARENT', 'MOM1', [
      makeChildRef('C1', 'Birth', 'Birth'),
    ])
    const family2 = makeFamily('F2', 'PARENT', 'MOM2', [
      makeChildRef('C1', 'Birth', 'Birth'),
    ])
    const parent = makePerson('PARENT', [family1, family2])
    const c1 = makePerson('C1')
    return [parent, c1]
  }

  it('a child listed in two families appears only once', () => {
    const data = buildDedupScenario()
    const tree = getDescendantTree(data, 'PARENT', 3, true)
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0].person.handle).toBe('C1')
  })

  // Birth priority: if C1 is birth in F1 but non-birth in F2, the final node is solid
  const buildBirthPriorityScenario = () => {
    const family1 = makeFamily('F1', 'PARENT', 'MOM1', [
      makeChildRef('C1', 'Birth', 'Birth'), // birth listing
    ])
    const family2 = makeFamily('F2', 'PARENT', 'MOM2', [
      makeChildRef('C1', 'Adopted', 'Birth'), // non-birth listing
    ])
    const parent = makePerson('PARENT', [family1, family2])
    const c1 = makePerson('C1')
    return [parent, c1]
  }

  it('birth listing wins over non-birth when same child in two families', () => {
    const data = buildBirthPriorityScenario()
    const tree = getDescendantTree(data, 'PARENT', 3, true)
    expect(tree.children).toHaveLength(1)
    // First-seen was birth (F1), so dashed should be false
    expect(tree.children[0].dashed).toBeFalsy()
  })

  // Non-birth first, then birth: birth (solid) should still win (priority rule)
  const buildNonBirthFirstScenario = () => {
    const family1 = makeFamily('F1', 'PARENT', 'MOM1', [
      makeChildRef('C1', 'Adopted', 'Birth'), // non-birth first
    ])
    const family2 = makeFamily('F2', 'PARENT', 'MOM2', [
      makeChildRef('C1', 'Birth', 'Birth'), // birth second
    ])
    const parent = makePerson('PARENT', [family1, family2])
    const c1 = makePerson('C1')
    return [parent, c1]
  }

  it('birth listing wins even when non-birth is seen first', () => {
    const data = buildNonBirthFirstScenario()
    const tree = getDescendantTree(data, 'PARENT', 3, true)
    expect(tree.children).toHaveLength(1)
    // Second family had birth, so the final node should be solid
    expect(tree.children[0].dashed).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// Tests: depth=0 and depth=1 early returns unchanged
// ---------------------------------------------------------------------------

describe('getDescendantTree — early return guards', () => {
  const data = buildScenario()

  it('depth=0 returns empty object', () => {
    const tree = getDescendantTree(data, 'PARENT', 0, true)
    expect(tree).toEqual({})
  })

  it('depth=1 returns node with no children', () => {
    const tree = getDescendantTree(data, 'PARENT', 1, true)
    expect(tree.children).toBeUndefined()
    expect(tree.person.handle).toBe('PARENT')
  })
})
