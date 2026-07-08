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

const chipFor = (chips, anchorHandle) =>
  chips.find(c => c.anchorHandle === anchorHandle)

describe('pruneGraph', () => {
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

  it('anc cut on root hides all its ancestors and anchors a chip on root', () => {
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
      new Set(['anc:ME']),
      'ME',
      true
    )
    expect(visibleHandles.has('ME')).toBe(true)
    for (const h of ['DAD', 'MOM', 'GF', 'GM']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    const chip = chipFor(chips, 'ME')
    expect(chip).toMatchObject({cutKey: 'anc:ME', side: 'ancestors', count: 4})
  })

  it('directional: an ancestor reachable only through a DOWN-then-marriage loop is still hidden (the key fix)', () => {
    // GF/GM -> DAD and UNCLE. ME = DAD x MOM. ME's child KID married COUSIN,
    // COUSIN is UNCLE's child. So GF/GM are reachable from ME both up through
    // DAD and, via a marriage, down through KID -> COUSIN -> UNCLE. The old
    // reachability model kept them visible; the directional model hides them.
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
    const {visibleHandles} = pruneGraph(people, new Set(['anc:ME']), 'ME', true)
    // Whole ancestral cone hidden despite the marriage loop back to root.
    for (const h of ['DAD', 'MOM', 'GF', 'GM', 'UNCLE', 'AUNT', 'COUSIN']) {
      expect(visibleHandles.has(h)).toBe(false)
    }
    // Root and root's descendants kept.
    expect(visibleHandles.has('ME')).toBe(true)
    expect(visibleHandles.has('SP')).toBe(true)
    expect(visibleHandles.has('KID')).toBe(true)
  })

  it('anc cut keeps ancestors root still reaches up a different blood line', () => {
    // DAD is ME's father AND (uncle-niece) MOM's uncle: GF/GM -> DAD, AUNT;
    // AUNT -> MOM. Collapsing DAD's ancestors leaves GF/GM visible because ME
    // still reaches them going up through MOM -> AUNT.
    const fGp = fam('F_GP', 'GF', 'GM', ['DAD', 'AUNT'])
    const fAunt = fam('F_AUNT', 'UNCLEX', 'AUNT', ['MOM'])
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('GF', {ownFamilies: [fGp]}),
      person('GM', {ownFamilies: [fGp]}),
      person('DAD', {parentFamilies: [fGp], ownFamilies: [fMe]}),
      person('AUNT', {parentFamilies: [fGp], ownFamilies: [fAunt]}),
      person('UNCLEX', {ownFamilies: [fAunt]}),
      person('MOM', {parentFamilies: [fAunt], ownFamilies: [fMe]}),
      person('ME', {parentFamilies: [fMe]}),
    ]
    const {visibleHandles, chips} = pruneGraph(
      people,
      new Set(['anc:DAD']),
      'ME',
      true
    )
    expect(visibleHandles.has('GF')).toBe(true)
    expect(visibleHandles.has('GM')).toBe(true)
    expect(visibleHandles.has('DAD')).toBe(true)
    expect(chipFor(chips, 'DAD').count).toBe(0)
  })

  it('union cut hides the far spouse and that union children, keeping the near spouse', () => {
    // G married W1 (root line, F1) then W2 (side family F2, child UNCLE).
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
    const {visibleHandles, chips} = pruneGraph(
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
    const chip = chipFor(chips, 'G')
    expect(chip).toMatchObject({
      cutKey: 'union:F2:W2',
      side: 'marriage',
      count: 2,
    })
  })

  it('a disconnected person stays visible under anc/union cuts', () => {
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [fMe]}),
      person('DAD', {ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
      person('LONER'),
    ]
    const {visibleHandles} = pruneGraph(people, new Set(['anc:ME']), 'ME', true)
    expect(visibleHandles.has('LONER')).toBe(true)
  })

  it('root is always visible, even with a cut on its own ancestors', () => {
    const fMe = fam('F_ME', 'DAD', 'MOM', ['ME'])
    const people = [
      person('ME', {parentFamilies: [fMe]}),
      person('DAD', {ownFamilies: [fMe]}),
      person('MOM', {ownFamilies: [fMe]}),
    ]
    const {visibleHandles} = pruneGraph(people, new Set(['anc:ME']), 'ME', true)
    expect(visibleHandles.has('ME')).toBe(true)
  })
})

describe("'line' preset (direct blood line only)", () => {
  // ME with ancestors DAD/GF and a sibling SIB, plus a descendant KID whose
  // spouse SP brings an in-law parent SPF. Only ME + blood ancestors + blood
  // descendants should survive.
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
    // SIB hangs off DAD/MOM; the SP in-law family hangs off KID.
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
