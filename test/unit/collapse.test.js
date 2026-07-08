import {describe, it, expect} from 'vitest'
import {
  pruneGraph,
  hiddenCountForCut,
  makeCutResolver,
  directAncestorHandles,
  presetCollapseDescendants,
  presetDirectLineOnly,
} from '../../src/charts/collapse.js'
import {buildAdjacency} from '../../src/charts/adjacency.js'

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

const chipFor = (chips, anchorHandle) =>
  chips.find(c => c.anchorHandle === anchorHandle)

// Connectivity invariant helper: every visible person must be reachable from
// root through a path of visible persons (family nodes are traversable
// connectors; hidden persons are walls). Returns the set of visible handles
// that are NOT reachable — must always be empty.
const disconnectedVisible = (people, visible, rootHandle, showAllParents) => {
  const {neighbors, personHandles} = buildAdjacency(people, {showAllParents})
  const seen = new Set([rootHandle])
  const stack = [rootHandle]
  while (stack.length) {
    const cur = stack.pop()
    for (const n of neighbors.get(cur) ?? []) {
      if (seen.has(n)) continue
      if (personHandles.has(n) && !visible.has(n)) continue // don't cross hidden
      seen.add(n)
      stack.push(n)
    }
  }
  return [...visible].filter(h => !seen.has(h))
}

describe('pruneGraph — empty / invariants', () => {
  it('empty cut set hides nobody and yields no chips', () => {
    const F = fam('F', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [F]}),
      person('DAD', {ownFamilies: [F]}),
      person('MOM', {ownFamilies: [F]}),
    ]
    const {visibleHandles, chips} = pruneGraph(people, new Set(), 'ME', true)
    expect(visibleHandles.size).toBe(3)
    expect(chips).toEqual([])
  })

  it('a disconnected person stays visible under any cut', () => {
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [fMe]}),
      person('DAD', {ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('LONER'),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['anc:ME:F_ME']),
      'ME',
      true
    )
    expect(visibleHandles.has('LONER')).toBe(true)
  })
})

describe('anc:<P>:<F> — ancestors through one parent family', () => {
  it('hides that family ancestors and anchors a chip on P (root)', () => {
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const fDad = fam('F_DAD', 'GF', 'GM', ['DAD'])
    const people = [
      person('ME', {parentFamilies: [fMe]}),
      person('DAD', {parentFamilies: [fDad], ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('GF', {ownFamilies: [fDad]}),
      person('GM', {ownFamilies: [fDad]}),
    ]
    const {visibleHandles, chips} = pruneGraph(
      people,
      new Set(['anc:ME:F_ME']),
      'ME',
      true
    )
    expect(visibleHandles.has('ME')).toBe(true)
    for (const h of ['DAD', 'MOM', 'GF', 'GM']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    expect(chipFor(chips, 'ME')).toMatchObject({
      cutKey: 'anc:ME:F_ME',
      side: 'ancestors',
      count: 4,
    })
  })

  it('child in TWO parent families: hides only the named family, other stays', () => {
    const f1 = fam('F1', 'DAD', 'MOM', ['ME'])
    const f2 = fam('F2', 'SD', 'SM', ['ME']) // adoptive/second parent family
    const fDad = fam('FDAD', 'GF', 'GM', ['DAD'])
    const people = [
      person('ME', {parentFamilies: [f1, f2]}),
      person('DAD', {parentFamilies: [fDad], ownFamilies: [f1]}),
      person('MOM', {ownFamilies: [f1]}),
      person('GF', {ownFamilies: [fDad]}),
      person('GM', {ownFamilies: [fDad]}),
      person('SD', {ownFamilies: [f2]}),
      person('SM', {ownFamilies: [f2]}),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['anc:ME:F1']),
      'ME',
      true
    )
    for (const hide of ['DAD', 'MOM', 'GF', 'GM']) {
      expect(visibleHandles.has(hide)).toBe(false)
    }
    for (const keep of ['ME', 'SD', 'SM']) {
      expect(visibleHandles.has(keep)).toBe(true)
    }
  })

  it('directional: an ancestor reachable only via a down-then-marriage loop is still hidden', () => {
    const fGp = fam('F_GP', 'GF', 'GM', ['DAD', 'UNCLE'])
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const fKid = fam('F_KID', 'KID', 'COUSIN', [])
    const fUncle = fam('F_UNCLE', 'UNCLE', 'AUNT', ['COUSIN'])
    const fMine = fam('F_MINE', 'ME', 'SP', ['KID'])
    const people = [
      person('GF', {ownFamilies: [fGp]}),
      person('GM', {ownFamilies: [fGp]}),
      person('DAD', {parentFamilies: [fGp], ownFamilies: [fMe]}),
      person('UNCLE', {parentFamilies: [fGp], ownFamilies: [fUncle]}),
      person('AUNT', {ownFamilies: [fUncle]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('ME', {parentFamilies: [fMe], ownFamilies: [fMine]}),
      person('SP', {ownFamilies: [fMine]}),
      person('KID', {parentFamilies: [fMine], ownFamilies: [fKid]}),
      person('COUSIN', {parentFamilies: [fUncle], ownFamilies: [fKid]}),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['anc:ME:F_ME']),
      'ME',
      true
    )
    for (const h of ['DAD', 'MOM', 'GF', 'GM', 'UNCLE', 'AUNT', 'COUSIN']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    for (const h of ['ME', 'SP', 'KID']) {
      expect(visibleHandles.has(h)).toBe(true)
    }
    expect(disconnectedVisible(people, visibleHandles, 'ME', true)).toEqual([])
  })

  it('protects P own subtree when P is collateral (P != root), not just root descendants', () => {
    // R's line: GGF/GGM -> GF (& GUNCLE); GF/GM -> R. GUNCLE (great-uncle,
    // collateral to R) has child COUSIN. Collapsing GUNCLE's ancestors through
    // fGG must hide GGF/GGM but KEEP GUNCLE and COUSIN (GUNCLE's subtree),
    // which are NOT under root's downClosure — needs downClosure([P]).
    const fGG = fam('FGG', 'GGF', 'GGM', ['GF', 'GUNCLE'])
    const fR = fam('FR', 'GF', 'GM', ['R'])
    const fGU = fam('FGU', 'GUNCLE', 'GAUNT', ['COUSIN'])
    const people = [
      person('GGF', {ownFamilies: [fGG]}),
      person('GGM', {ownFamilies: [fGG]}),
      person('GF', {parentFamilies: [fGG], ownFamilies: [fR]}),
      person('GUNCLE', {parentFamilies: [fGG], ownFamilies: [fGU]}),
      person('GAUNT', {ownFamilies: [fGU]}),
      person('COUSIN', {parentFamilies: [fGU]}),
      person('GM', {ownFamilies: [fR]}),
      person('R', {parentFamilies: [fR]}),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['anc:GUNCLE:FGG']),
      'R',
      true
    )
    expect(visibleHandles.has('GUNCLE')).toBe(true)
    expect(visibleHandles.has('COUSIN')).toBe(true)
    for (const h of ['GGF', 'GGM']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    expect(disconnectedVisible(people, visibleHandles, 'R', true)).toEqual([])
  })

  it('root is always visible under a cut on its own ancestors', () => {
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [fMe]}),
      person('DAD', {ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['anc:ME:F_ME']),
      'ME',
      true
    )
    expect(visibleHandles.has('ME')).toBe(true)
  })
})

describe('spouse:<F>:<S> — spouse branch, children kept', () => {
  it('hides the spouse and their ancestry, keeps the children and near spouse', () => {
    const f = fam('F', 'ROOT', 'SP', ['K1', 'K2'])
    const fSp = fam('FSP', 'SPDAD', 'SPMOM', ['SP'])
    const people = [
      person('ROOT', {ownFamilies: [f]}),
      person('SP', {parentFamilies: [fSp], ownFamilies: [f]}),
      person('SPDAD', {ownFamilies: [fSp]}),
      person('SPMOM', {ownFamilies: [fSp]}),
      person('K1', {parentFamilies: [f]}),
      person('K2', {parentFamilies: [f]}),
    ]
    const {visibleHandles, chips} = pruneGraph(
      people,
      new Set(['spouse:F:SP']),
      'ROOT',
      true
    )
    expect(visibleHandles.has('ROOT')).toBe(true)
    expect(visibleHandles.has('K1')).toBe(true)
    expect(visibleHandles.has('K2')).toBe(true)
    for (const h of ['SP', 'SPDAD', 'SPMOM']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    expect(chipFor(chips, 'ROOT')).toMatchObject({
      cutKey: 'spouse:F:SP',
      side: 'spouse',
    })
    expect(disconnectedVisible(people, visibleHandles, 'ROOT', true)).toEqual(
      []
    )
  })
})

describe('children:<F> — descendants, both spouses kept', () => {
  it('hides children and their descendants/in-laws, keeps both spouses', () => {
    const f = fam('F', 'ROOT', 'SP', ['K1'])
    const fK = fam('FK', 'K1', 'KSP', ['GK'])
    const people = [
      person('ROOT', {ownFamilies: [f]}),
      person('SP', {ownFamilies: [f]}),
      person('K1', {parentFamilies: [f], ownFamilies: [fK]}),
      person('KSP', {ownFamilies: [fK]}),
      person('GK', {parentFamilies: [fK]}),
    ]
    const {visibleHandles, chips} = pruneGraph(
      people,
      new Set(['children:F']),
      'ROOT',
      true
    )
    expect(visibleHandles.has('ROOT')).toBe(true)
    expect(visibleHandles.has('SP')).toBe(true)
    for (const h of ['K1', 'KSP', 'GK']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    expect(chipFor(chips, 'ROOT')).toMatchObject({side: 'children'})
    expect(disconnectedVisible(people, visibleHandles, 'ROOT', true)).toEqual(
      []
    )
  })

  it("children:<root's own family> == desc preset when root has one family", () => {
    const f = fam('F', 'ROOT', 'SP', ['K1'])
    const fK = fam('FK', 'K1', 'KSP', ['GK'])
    const people = [
      person('ROOT', {ownFamilies: [f]}),
      person('SP', {ownFamilies: [f]}),
      person('K1', {parentFamilies: [f], ownFamilies: [fK]}),
      person('KSP', {ownFamilies: [fK]}),
      person('GK', {parentFamilies: [fK]}),
    ]
    const a = pruneGraph(
      people,
      new Set(['children:F']),
      'ROOT',
      true
    ).visibleHandles
    const b = pruneGraph(
      people,
      presetCollapseDescendants(people, 'ROOT', true),
      'ROOT',
      true
    ).visibleHandles
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('multi-marriage root: children:<F1> hides only that marriage, unlike desc', () => {
    const f1 = fam('F1', 'ROOT', 'W1', ['K1'])
    const f2 = fam('F2', 'ROOT', 'W2', ['K2'])
    const people = [
      person('ROOT', {ownFamilies: [f1, f2]}),
      person('W1', {ownFamilies: [f1]}),
      person('W2', {ownFamilies: [f2]}),
      person('K1', {parentFamilies: [f1]}),
      person('K2', {parentFamilies: [f2]}),
    ]
    const perFamily = pruneGraph(
      people,
      new Set(['children:F1']),
      'ROOT',
      true
    ).visibleHandles
    expect(perFamily.has('K1')).toBe(false)
    expect(perFamily.has('K2')).toBe(true) // other marriage untouched
    const descAll = pruneGraph(
      people,
      presetCollapseDescendants(people, 'ROOT', true),
      'ROOT',
      true
    ).visibleHandles
    expect(descAll.has('K1')).toBe(false)
    expect(descAll.has('K2')).toBe(false) // desc hides both
    expect(disconnectedVisible(people, perFamily, 'ROOT', true)).toEqual([])
  })
})

describe('whole marriage = spouse + children', () => {
  it('applying both keys hides spouse and children, keeps root', () => {
    const f = fam('F', 'ROOT', 'SP', ['K1'])
    const people = [
      person('ROOT', {ownFamilies: [f]}),
      person('SP', {ownFamilies: [f]}),
      person('K1', {parentFamilies: [f]}),
    ]
    const {visibleHandles} = pruneGraph(
      people,
      new Set(['spouse:F:SP', 'children:F']),
      'ROOT',
      true
    )
    expect(visibleHandles.has('ROOT')).toBe(true)
    expect(visibleHandles.has('SP')).toBe(false)
    expect(visibleHandles.has('K1')).toBe(false)
  })
})

describe("'line' preset (direct blood line only)", () => {
  const fMe = fam('F_ME', 'DAD', 'MOM', ['ME', 'SIB'])
  const fDad = fam('F_DAD', 'GF', 'GM', ['DAD'])
  const fKid = fam('F_KID', 'ME', 'SP', ['KID'])
  const fSp = fam('F_SP', 'SPF', 'SPM', ['SP'])
  const people = [
    person('ME', {parentFamilies: [fMe], ownFamilies: [fKid]}),
    person('SIB', {parentFamilies: [fMe]}),
    person('DAD', {parentFamilies: [fDad], ownFamilies: [fMe]}),
    person('MOM', {ownFamilies: [fMe]}),
    person('GF', {ownFamilies: [fDad]}),
    person('GM', {ownFamilies: [fDad]}),
    person('SP', {parentFamilies: [fSp], ownFamilies: [fKid]}),
    person('SPF', {ownFamilies: [fSp]}),
    person('SPM', {ownFamilies: [fSp]}),
    person('KID', {parentFamilies: [fKid]}),
  ]

  it('keeps root, blood ancestors and blood descendants; hides everyone else', () => {
    const {visibleHandles} = pruneGraph(people, new Set(['line']), 'ME', true)
    for (const keep of ['ME', 'DAD', 'MOM', 'GF', 'GM', 'KID']) {
      expect(visibleHandles.has(keep)).toBe(true)
    }
    for (const hide of ['SIB', 'SP', 'SPF', 'SPM']) {
      expect(visibleHandles.has(hide)).toBe(false)
    }
  })

  it('emits boundary chips on kept people bordering hidden relatives', () => {
    const {chips} = pruneGraph(people, new Set(['line']), 'ME', true)
    expect(chips.every(c => c.cutKey === 'line')).toBe(true)
    expect(chipFor(chips, 'MOM')?.count).toBeGreaterThan(0)
    expect(chipFor(chips, 'KID')?.count).toBeGreaterThan(0)
  })
})

describe("'desc' preset (collapse all descendants)", () => {
  const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
  const fMine = fam('F_MINE', 'ME', 'SP', ['KID'])
  const fKid = fam('F_KID', 'KID', 'KSP', ['GKID'])
  const people = [
    person('DAD', {ownFamilies: [fMe]}),
    person('MOM', {ownFamilies: [fMe]}),
    person('ME', {parentFamilies: [fMe], ownFamilies: [fMine]}),
    person('SP', {ownFamilies: [fMine]}),
    person('KID', {parentFamilies: [fMine], ownFamilies: [fKid]}),
    person('KSP', {ownFamilies: [fKid]}),
    person('GKID', {parentFamilies: [fKid]}),
  ]

  it('hides descendants and their in-laws, keeps root, its spouse and ancestors', () => {
    const {visibleHandles} = pruneGraph(people, new Set(['desc']), 'ME', true)
    for (const keep of ['ME', 'SP', 'DAD', 'MOM']) {
      expect(visibleHandles.has(keep)).toBe(true)
    }
    for (const hide of ['KID', 'KSP', 'GKID']) {
      expect(visibleHandles.has(hide)).toBe(false)
    }
  })
})

describe('hiddenCountForCut', () => {
  it('counts currently-visible persons a cut would hide', () => {
    const f1 = fam('F1', 'DAD', 'MOM', ['ME'])
    const fDad = fam('FDAD', 'GF', 'GM', ['DAD'])
    const people = [
      person('ME', {parentFamilies: [f1]}),
      person('DAD', {parentFamilies: [fDad], ownFamilies: [f1]}),
      person('MOM', {ownFamilies: [f1]}),
      person('GF', {ownFamilies: [fDad]}),
      person('GM', {ownFamilies: [fDad]}),
    ]
    expect(hiddenCountForCut(people, new Set(), 'anc:ME:F1', 'ME', true)).toBe(
      4
    )
  })

  it('is relative to the current collapsed state (already-hidden not recounted)', () => {
    const f1 = fam('F1', 'DAD', 'MOM', ['ME'])
    const fDad = fam('FDAD', 'GF', 'GM', ['DAD'])
    const people = [
      person('ME', {parentFamilies: [f1]}),
      person('DAD', {parentFamilies: [fDad], ownFamilies: [f1]}),
      person('MOM', {ownFamilies: [f1]}),
      person('GF', {ownFamilies: [fDad]}),
      person('GM', {ownFamilies: [fDad]}),
    ]
    const already = new Set(['anc:ME:F1'])
    expect(hiddenCountForCut(people, already, 'anc:ME:F1', 'ME', true)).toBe(0)
  })
})

describe('makeCutResolver', () => {
  it('returns the hidden set of a single cut over the given people (one ctx)', () => {
    const f1 = fam('F1', 'DAD', 'MOM', ['ME'])
    const fDad = fam('FDAD', 'GF', 'GM', ['DAD'])
    const people = [
      person('ME', {parentFamilies: [f1]}),
      person('DAD', {parentFamilies: [fDad], ownFamilies: [f1]}),
      person('MOM', {ownFamilies: [f1]}),
      person('GF', {ownFamilies: [fDad]}),
      person('GM', {ownFamilies: [fDad]}),
    ]
    const resolve = makeCutResolver(people, 'ME', true)
    const hidden = resolve('anc:ME:F1')
    expect([...hidden].sort()).toEqual(['DAD', 'GF', 'GM', 'MOM'])
    // Same marginal count as hiddenCountForCut on the full graph, no collapse.
    expect(hidden.size).toBe(
      hiddenCountForCut(people, new Set(), 'anc:ME:F1', 'ME', true)
    )
    // Unknown/empty key -> empty set.
    expect(resolve('bogus:X').size).toBe(0)
  })
})

describe('directAncestorHandles', () => {
  it('collects blood ancestors through the direct line, excluding laterals', () => {
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME', 'SIB'])
    const fDad = fam('F_DAD', 'GF', 'GM', ['DAD', 'UNCLE'])
    const people = [
      person('ME', {parentFamilies: [fMe]}),
      person('SIB', {parentFamilies: [fMe]}),
      person('DAD', {parentFamilies: [fDad], ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('UNCLE', {parentFamilies: [fDad]}),
      person('GF', {ownFamilies: [fDad]}),
      person('GM', {ownFamilies: [fDad]}),
    ]
    const anc = directAncestorHandles(people, 'ME', true)
    expect([...anc].sort()).toEqual(['DAD', 'GF', 'GM', 'MOM'])
    expect(anc.has('SIB')).toBe(false)
    expect(anc.has('UNCLE')).toBe(false)
  })

  it('returns an empty set for a root with no known parents', () => {
    const people = [person('ME')]
    expect(directAncestorHandles(people, 'ME', true).size).toBe(0)
  })
})

describe('presets return their single preset cut', () => {
  it('presetDirectLineOnly -> {line}', () => {
    expect([...presetDirectLineOnly([], 'ME', true)]).toEqual(['line'])
  })
  it('presetCollapseDescendants -> {desc}', () => {
    expect([...presetCollapseDescendants([], 'ME', true)]).toEqual(['desc'])
  })
})
