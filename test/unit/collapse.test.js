import {describe, it, expect} from 'vitest'
import {pruneGraph} from '../../src/charts/collapse.js'

// Copied from test/unit/adjacency.test.js so this file stands alone.
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

describe('pruneGraph', () => {
  it('anc cut hides ancestors above the person and counts them', () => {
    const F = fam('F', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [F]}),
      person('DAD', {ownFamilies: [F]}),
      person('MOM', {ownFamilies: [F]}),
    ]
    const {visibleHandles, chipCounts, chipAnchors} = pruneGraph(
      people,
      new Set(['anc:ME']),
      'ME',
      true
    )
    expect(visibleHandles.has('ME')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(false)
    expect(visibleHandles.has('MOM')).toBe(false)
    expect(chipCounts.get('anc:ME')).toBe(2)
    expect(chipAnchors.get('anc:ME')).toEqual({
      anchorHandle: 'ME',
      side: 'ancestors',
    })
  })

  it('pedigree collapse: an ancestor reachable through two lines stays visible when only one line is cut, and is not counted', () => {
    // GF/GM had two children: DAD and AUNT. DAD married MOM's... no: AUNT's
    // line leads down to MOM, and MOM marries DAD, so GF/GM are reachable
    // both through DAD's direct parent-family AND through MOM -> AUNT.
    const fGf = fam('F_GF', 'GF', 'GM', ['DAD', 'AUNT'])
    const fAunt = fam('F_AUNT', 'UNCLE', 'AUNT', ['MOM'])
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('GF', {ownFamilies: [fGf]}),
      person('GM', {ownFamilies: [fGf]}),
      person('DAD', {parentFamilies: [fGf], ownFamilies: [fMe]}),
      person('AUNT', {parentFamilies: [fGf], ownFamilies: [fAunt]}),
      person('UNCLE', {ownFamilies: [fAunt]}),
      person('MOM', {parentFamilies: [fAunt], ownFamilies: [fMe]}),
      person('ME', {parentFamilies: [fMe]}),
    ]
    const {visibleHandles, chipCounts} = pruneGraph(
      people,
      new Set(['anc:DAD']),
      'ME',
      true
    )
    // GF/GM still reachable via MOM -> AUNT -> F_GF, so cutting DAD's own
    // edge to F_GF hides nothing.
    expect(visibleHandles.has('GF')).toBe(true)
    expect(visibleHandles.has('GM')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(true)
    expect(visibleHandles.has('AUNT')).toBe(true)
    expect(visibleHandles.has('UNCLE')).toBe(true)
    expect(chipCounts.get('anc:DAD')).toBe(0)
  })

  it('union cut hides the pinned far spouse + that union children, but the near spouse stays visible', () => {
    // Grandfather G married W1 (root line, family F1) then W2 (side family
    // F2, with a child UNCLE).
    const f1 = fam('F1', 'G', 'W1', ['DAD'])
    const f2 = fam('F2', 'G', 'W2', ['UNCLE'])
    const fMe = fam('FME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('G', {ownFamilies: [f1, f2]}),
      person('W1', {ownFamilies: [f1]}),
      person('W2', {ownFamilies: [f2]}),
      person('DAD', {parentFamilies: [f1], ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('UNCLE', {parentFamilies: [f2]}),
      person('ME', {parentFamilies: [fMe]}),
    ]
    const {visibleHandles, chipCounts, chipAnchors} = pruneGraph(
      people,
      new Set(['union:F2:W2']),
      'ME',
      true
    )
    expect(visibleHandles.has('W2')).toBe(false)
    expect(visibleHandles.has('UNCLE')).toBe(false)
    expect(visibleHandles.has('G')).toBe(true)
    expect(visibleHandles.has('W1')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(true)
    expect(visibleHandles.has('ME')).toBe(true)
    expect(chipCounts.get('union:F2:W2')).toBe(2)
    expect(chipAnchors.get('union:F2:W2')).toEqual({
      anchorHandle: 'G',
      side: 'marriage',
    })
  })

  it('union cut does not invert after re-root: the same key hides W2 whether G or W2 is the nearer side', () => {
    const f1 = fam('F1', 'G', 'W1', ['DAD'])
    const f2 = fam('F2', 'G', 'W2', ['AUNT'])
    const people = [
      person('G', {ownFamilies: [f1, f2]}),
      person('W1', {ownFamilies: [f1]}),
      person('W2', {ownFamilies: [f2]}),
      person('DAD', {parentFamilies: [f1]}),
      person('AUNT', {parentFamilies: [f2]}),
    ]
    const collapsed = new Set(['union:F2:W2'])

    // Rooted on DAD (G's line): G is the "near" spouse relative to root.
    const fromDad = pruneGraph(people, collapsed, 'DAD', true)
    expect(fromDad.visibleHandles.has('W2')).toBe(false)
    expect(fromDad.visibleHandles.has('G')).toBe(true)

    // Rooted on AUNT (W2's own child): W2 is now the nearer side, only one
    // hop away via family F2. The pinned key must still hide W2, not G.
    const fromAunt = pruneGraph(people, collapsed, 'AUNT', true)
    expect(fromAunt.visibleHandles.has('W2')).toBe(false)
    expect(fromAunt.visibleHandles.has('G')).toBe(true)
    expect(fromAunt.visibleHandles.has('AUNT')).toBe(true)
  })

  it('a disconnected person (no family edges) stays visible under any cuts, with no chip for them', () => {
    const F = fam('F', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [F]}),
      person('DAD', {ownFamilies: [F]}),
      person('MOM', {ownFamilies: [F]}),
      person('LONER'),
    ]
    const {visibleHandles, chipCounts, chipAnchors} = pruneGraph(
      people,
      new Set(['anc:ME']),
      'ME',
      true
    )
    expect(visibleHandles.has('LONER')).toBe(true)
    expect(chipCounts.size).toBe(1)
    expect(chipCounts.has('anc:ME')).toBe(true)
    expect([...chipAnchors.values()]).not.toContainEqual(
      expect.objectContaining({anchorHandle: 'LONER'})
    )
  })

  it('the root is always visible, even with cuts on both its ancestor side and its own union', () => {
    const f1 = fam('F1', 'DAD', 'MOM', ['ME'])
    const f2 = fam('F2', 'ME', 'SPOUSE', ['CHILD'])
    const people = [
      person('DAD', {ownFamilies: [f1]}),
      person('MOM', {ownFamilies: [f1]}),
      person('ME', {parentFamilies: [f1], ownFamilies: [f2]}),
      person('SPOUSE', {ownFamilies: [f2]}),
      person('CHILD', {parentFamilies: [f2]}),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['anc:ME', 'union:F2:SPOUSE']),
      'ME',
      true
    )
    expect(visibleHandles.has('ME')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(false)
    expect(visibleHandles.has('MOM')).toBe(false)
    expect(visibleHandles.has('SPOUSE')).toBe(false)
    expect(visibleHandles.has('CHILD')).toBe(false)
  })

  it('marginal chip counts: two cuts on disjoint branches each count only the people they individually hide', () => {
    const fGrand = fam('F_DAD', 'GDAD', 'GMOM', ['DAD'])
    const f1 = fam('F1', 'DAD', 'MOM', ['ME'])
    const f2 = fam('F2', 'ME', 'SPOUSE', ['CHILD'])
    const people = [
      person('GDAD', {ownFamilies: [fGrand]}),
      person('GMOM', {ownFamilies: [fGrand]}),
      person('DAD', {parentFamilies: [fGrand], ownFamilies: [f1]}),
      person('MOM', {ownFamilies: [f1]}),
      person('ME', {parentFamilies: [f1], ownFamilies: [f2]}),
      person('SPOUSE', {ownFamilies: [f2]}),
      person('CHILD', {parentFamilies: [f2]}),
    ]
    const {visibleHandles, chipCounts} = pruneGraph(
      people,
      new Set(['anc:DAD', 'union:F2:SPOUSE']),
      'ME',
      true
    )
    expect(chipCounts.get('anc:DAD')).toBe(2)
    expect(chipCounts.get('union:F2:SPOUSE')).toBe(2)
    expect(visibleHandles.has('GDAD')).toBe(false)
    expect(visibleHandles.has('GMOM')).toBe(false)
    expect(visibleHandles.has('SPOUSE')).toBe(false)
    expect(visibleHandles.has('CHILD')).toBe(false)
    expect(visibleHandles.has('ME')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(true)
    expect(visibleHandles.has('MOM')).toBe(true)
  })

  it('chipAnchors: anc:P anchors on P, union:F:hiddenSpouse anchors on the near spouse', () => {
    const f1 = fam('F1', 'G', 'W1', ['DAD'])
    const f2 = fam('F2', 'G', 'W2', ['UNCLE'])
    const fMe = fam('FME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('G', {ownFamilies: [f1, f2]}),
      person('W1', {ownFamilies: [f1]}),
      person('W2', {ownFamilies: [f2]}),
      person('DAD', {parentFamilies: [f1], ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('UNCLE', {parentFamilies: [f2]}),
      person('ME', {parentFamilies: [fMe]}),
    ]
    const {chipAnchors} = pruneGraph(
      people,
      new Set(['anc:DAD', 'union:F2:W2']),
      'ME',
      true
    )
    expect(chipAnchors.get('anc:DAD')).toEqual({
      anchorHandle: 'DAD',
      side: 'ancestors',
    })
    expect(chipAnchors.get('union:F2:W2')).toEqual({
      anchorHandle: 'G',
      side: 'marriage',
    })
  })
})
