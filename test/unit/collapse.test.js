import {describe, it, expect} from 'vitest'
import {
  pruneGraph,
  directAncestorHandles,
  presetCollapseDescendants,
  presetDirectLineOnly,
} from '../../src/charts/collapse.js'

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

  it('union cut root self-guard: rooting on the union child itself still hides W2, not G, even though both spouses are equidistant from that root', () => {
    // NOTE: this is the root-self-guard case, not a genuine near/far
    // distance flip — AUNT is F2's own child, so she is exactly 1 hop from
    // BOTH G and W2 via the shared family node (equidistant, not "W2
    // nearer"). See the next test for a fixture with a REAL distance
    // asymmetry (root strictly closer to W2 than to G).
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

    // Rooted on DAD (G's line, distance 2 to G vs. 4 to W2): the "normal"
    // orientation.
    const fromDad = pruneGraph(people, collapsed, 'DAD', true)
    expect(fromDad.visibleHandles.has('W2')).toBe(false)
    expect(fromDad.visibleHandles.has('G')).toBe(true)

    // Rooted on AUNT (F2's own child, distance 1 to BOTH G and W2 via the
    // shared family node): the pinned key must still hide W2, not G,
    // because the child's own ancEdge to F2 is guarded (root's own child
    // edge is never severed) rather than because of any distance
    // computation.
    const fromAunt = pruneGraph(people, collapsed, 'AUNT', true)
    expect(fromAunt.visibleHandles.has('W2')).toBe(false)
    expect(fromAunt.visibleHandles.has('G')).toBe(true)
    expect(fromAunt.visibleHandles.has('AUNT')).toBe(true)
  })

  it("union cut with a genuine near/far asymmetry: rooting strictly on W2's own independent line never hides G, and rooting on G's line hides W2's whole line", () => {
    // G married W1 (F1, with child DAD) and W2 (F2). W2 remarried
    // OTHER_HUSBAND (F3, with child C_W2) -- a line that has nothing to do
    // with G or F2 except through W2 herself. From C_W2, W2 is strictly
    // closer (dist 2, straight through F3) than G is (dist 4, and only
    // reachable by first passing through W2/F2) -- a real asymmetry, not
    // an equidistant tie like the previous test.
    const f1 = fam('F1', 'G', 'W1', ['DAD'])
    const f2 = fam('F2', 'G', 'W2', [])
    const f3 = fam('F3', 'W2', 'OTHER_HUSBAND', ['C_W2'])
    const people = [
      person('G', {ownFamilies: [f1, f2]}),
      person('W1', {ownFamilies: [f1]}),
      person('W2', {ownFamilies: [f2, f3]}),
      person('OTHER_HUSBAND', {ownFamilies: [f3]}),
      person('DAD', {parentFamilies: [f1]}),
      person('C_W2', {parentFamilies: [f3]}),
    ]
    const collapsed = new Set(['union:F2:W2'])

    // Rooted on DAD (G's line): the cut correctly hides W2's entire
    // independent world (herself, her second husband, and C_W2), since
    // none of it is reachable from DAD any other way.
    const fromDad = pruneGraph(people, collapsed, 'DAD', true)
    expect(fromDad.visibleHandles.has('G')).toBe(true)
    expect(fromDad.visibleHandles.has('W2')).toBe(false)
    expect(fromDad.visibleHandles.has('OTHER_HUSBAND')).toBe(false)
    expect(fromDad.visibleHandles.has('C_W2')).toBe(false)

    // Rooted on C_W2 -- strictly inside W2's own independent line, and
    // therefore her own descendant: it is impossible for ANY cut to hide
    // root's own ancestor while keeping root itself visible, so the
    // pinned union:F2:W2 cut can't literally hide W2 here. What matters
    // for "does not invert" is that it must NEVER flip to hiding G (the
    // near side) instead -- that would be the real inversion bug. The
    // cut safely becomes a no-op for this cut from this vantage point:
    // G (and W1, DAD) stay visible, exactly as they would with no cuts
    // at all.
    const fromCW2 = pruneGraph(people, collapsed, 'C_W2', true)
    expect(fromCW2.visibleHandles.has('G')).toBe(true)
    expect(fromCW2.visibleHandles.has('W1')).toBe(true)
    expect(fromCW2.visibleHandles.has('DAD')).toBe(true)
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

describe('directAncestorHandles', () => {
  it('collects blood ancestors through the direct line, excluding laterals', () => {
    // GF/GM had DAD and AUNT. DAD married MOM -> ME (root).
    const fGf = fam('F_GF', 'GF', 'GM', ['DAD', 'AUNT'])
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('GF', {ownFamilies: [fGf]}),
      person('GM', {ownFamilies: [fGf]}),
      person('DAD', {parentFamilies: [fGf], ownFamilies: [fMe]}),
      person('AUNT', {parentFamilies: [fGf]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('ME', {parentFamilies: [fMe]}),
    ]
    const ancestors = directAncestorHandles(people, 'ME', true)
    expect(ancestors).toEqual(new Set(['DAD', 'MOM', 'GF', 'GM']))
    expect(ancestors.has('AUNT')).toBe(false)
    expect(ancestors.has('ME')).toBe(false)
  })

  it('returns an empty set for a root with no known parents', () => {
    const people = [person('ME')]
    expect(directAncestorHandles(people, 'ME', true)).toEqual(new Set())
  })
})

describe('presetCollapseDescendants', () => {
  it("collapses each of root's children's own marriages, sparing root's own family", () => {
    const fMe = fam('F_ME', 'ME', 'SPOUSE', ['KID'])
    const fKid = fam('F_KID', 'KID', 'KIDSPOUSE', ['GRANDKID'])
    const people = [
      person('ME', {ownFamilies: [fMe]}),
      person('SPOUSE', {ownFamilies: [fMe]}),
      person('KID', {parentFamilies: [fMe], ownFamilies: [fKid]}),
      person('KIDSPOUSE', {ownFamilies: [fKid]}),
      person('GRANDKID', {parentFamilies: [fKid]}),
    ]
    const cuts = presetCollapseDescendants(people, 'ME', true)
    expect(cuts).toEqual(new Set(['union:F_KID:KIDSPOUSE']))

    // Applying the preset via pruneGraph keeps root's own family, hides the
    // grandchild generation entirely (transitively, via the single cut).
    const {visibleHandles} = pruneGraph(people, cuts, 'ME', true)
    expect(visibleHandles.has('ME')).toBe(true)
    expect(visibleHandles.has('SPOUSE')).toBe(true)
    expect(visibleHandles.has('KID')).toBe(true)
    expect(visibleHandles.has('KIDSPOUSE')).toBe(false)
    expect(visibleHandles.has('GRANDKID')).toBe(false)
  })

  it('produces no cuts when root has no children', () => {
    const people = [person('ME')]
    expect(presetCollapseDescendants(people, 'ME', true)).toEqual(new Set())
  })
})

describe('presetDirectLineOnly', () => {
  it('collapses ancestor siblings and side marriages, keeping the blood line and root family', () => {
    // GF married GM (direct line, DAD+AUNT) and also OTHERW (side family,
    // HALFUNCLE). DAD married MOM -> ME (root). AUNT married UNCLE -> COUSIN.
    const fGf = fam('F_GF', 'GF', 'GM', ['DAD', 'AUNT'])
    const fGfSide = fam('F_GF2', 'GF', 'OTHERW', ['HALFUNCLE'])
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const fAunt = fam('F_AUNT', 'AUNT', 'UNCLE', ['COUSIN'])
    const people = [
      person('GF', {ownFamilies: [fGf, fGfSide]}),
      person('GM', {ownFamilies: [fGf]}),
      person('OTHERW', {ownFamilies: [fGfSide]}),
      person('HALFUNCLE', {parentFamilies: [fGfSide]}),
      person('DAD', {parentFamilies: [fGf], ownFamilies: [fMe]}),
      person('AUNT', {parentFamilies: [fGf], ownFamilies: [fAunt]}),
      person('UNCLE', {ownFamilies: [fAunt]}),
      person('COUSIN', {parentFamilies: [fAunt]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('ME', {parentFamilies: [fMe]}),
    ]
    const cuts = presetDirectLineOnly(people, 'ME', true)
    expect(cuts).toEqual(
      new Set(['anc:AUNT', 'union:F_AUNT:UNCLE', 'union:F_GF2:OTHERW'])
    )

    const {visibleHandles} = pruneGraph(people, cuts, 'ME', true)
    // Direct line + root's own generation stay visible.
    expect(visibleHandles.has('ME')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(true)
    expect(visibleHandles.has('MOM')).toBe(true)
    expect(visibleHandles.has('GF')).toBe(true)
    expect(visibleHandles.has('GM')).toBe(true)
    // The lateral (AUNT) stays visible as a leaf — the cut vocabulary has
    // no way to hide one specific child of a still-visible family — but
    // her own marriage (the actual source of width) collapses away, as
    // does GF's side marriage.
    expect(visibleHandles.has('AUNT')).toBe(true)
    expect(visibleHandles.has('UNCLE')).toBe(false)
    expect(visibleHandles.has('COUSIN')).toBe(false)
    expect(visibleHandles.has('OTHERW')).toBe(false)
    expect(visibleHandles.has('HALFUNCLE')).toBe(false)
  })

  it("keeps root's own spouse and children (focus family spared)", () => {
    const fGf = fam('F_GF', 'GF', 'GM', ['DAD'])
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const fMine = fam('F_MINE', 'ME', 'SPOUSE', ['CHILD'])
    const people = [
      person('GF', {ownFamilies: [fGf]}),
      person('GM', {ownFamilies: [fGf]}),
      person('DAD', {parentFamilies: [fGf], ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('ME', {parentFamilies: [fMe], ownFamilies: [fMine]}),
      person('SPOUSE', {ownFamilies: [fMine]}),
      person('CHILD', {parentFamilies: [fMine]}),
    ]
    const cuts = presetDirectLineOnly(people, 'ME', true)
    expect([...cuts].some(c => c.includes('F_MINE'))).toBe(false)

    const {visibleHandles} = pruneGraph(people, cuts, 'ME', true)
    expect(visibleHandles.has('SPOUSE')).toBe(true)
    expect(visibleHandles.has('CHILD')).toBe(true)
  })

  it('produces no cuts for a root with no known ancestors or siblings', () => {
    const people = [person('ME')]
    expect(presetDirectLineOnly(people, 'ME', true)).toEqual(new Set())
  })
})
