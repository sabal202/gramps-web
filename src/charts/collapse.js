// Pure collapse/expand reachability core for the relationship chart.
//
// No DOM, no D3 — just the adjacency graph from adjacency.js in, and the set
// of visible handles + chip metadata out. See
// docs/superpowers/specs/2026-07-08-relchart-collapse-expand-design.md §2.

import {buildAdjacency} from './adjacency.js'

// Reachable set from root over `neighbors`, skipping edges in `cutEdges`
// (a Set of "a|b" keys, a < b).
function reach(rootHandle, neighbors, cutEdges) {
  const seen = new Set()
  if (!neighbors.has(rootHandle)) return seen
  const stack = [rootHandle]
  seen.add(rootHandle)
  while (stack.length) {
    const cur = stack.pop()
    for (const nxt of neighbors.get(cur) ?? []) {
      const key = cur < nxt ? `${cur}|${nxt}` : `${nxt}|${cur}`
      if (cutEdges.has(key)) continue
      if (!seen.has(nxt)) {
        seen.add(nxt)
        stack.push(nxt)
      }
    }
  }
  return seen
}

const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

// Parses a "union:<familyHandle>:<hiddenSpouseHandle>" cut key. Handles
// never contain ":", so the first segment up to the first ":" is the
// family and everything after it is the hidden spouse.
function parseUnionCut(cut) {
  const rest = cut.slice('union:'.length)
  const idx = rest.indexOf(':')
  return {family: rest.slice(0, idx), hiddenSpouse: rest.slice(idx + 1)}
}

// rootHandle guards root's own child edge from ever being severed by a
// union cut (so collapsing a union that root herself belongs to as a child
// never cuts root off from her own parent-family).
function cutEdgesFor(cuts, adj, rootHandle) {
  const removed = new Set()
  for (const cut of cuts) {
    if (cut.startsWith('anc:')) {
      const p = cut.slice(4)
      for (const f of adj.ancEdges.get(p) ?? []) removed.add(edgeKey(p, f))
    } else if (cut.startsWith('union:')) {
      const {family, hiddenSpouse} = parseUnionCut(cut)
      removed.add(edgeKey(family, hiddenSpouse))
      for (const [h, fams] of adj.ancEdges) {
        if (fams.has(family) && h !== rootHandle)
          removed.add(edgeKey(h, family))
      }
    }
  }
  return removed
}

// The handles that "anchor" a cut's far side, independent of root: for
// anc:P it's P's own parent-family node(s) (P herself stays put and is
// never part of her own cut); for union:F:S it's the hidden spouse plus
// each of the union's children (except root's own child edge, guarded the
// same way as cutEdgesFor).
function anchorsFor(cut, adj, rootHandle) {
  if (cut.startsWith('anc:')) {
    const p = cut.slice(4)
    return [...(adj.ancEdges.get(p) ?? [])]
  }
  const {family, hiddenSpouse} = parseUnionCut(cut)
  const anchors = [hiddenSpouse]
  for (const [h, fams] of adj.ancEdges) {
    if (fams.has(family) && h !== rootHandle) anchors.push(h)
  }
  return anchors
}

function anchorFor(cut, adj) {
  if (cut.startsWith('anc:')) {
    return {anchorHandle: cut.slice(4), side: 'ancestors'}
  }
  const {family, hiddenSpouse} = parseUnionCut(cut)
  const rec = adj.familyNodes.get(family) || {}
  const nearSpouse = rec.father === hiddenSpouse ? rec.mother : rec.father
  return {anchorHandle: nearSpouse, side: 'marriage'}
}

/**
 * Prunes the relationship-chart graph down to what should be visible given
 * a set of collapse cuts.
 *
 * @param {object[]} people
 * @param {Set<string>} collapsed  Set of cut keys: "anc:<personHandle>" |
 *   "union:<familyHandle>:<hiddenSpouseHandle>".
 * @param {string} rootHandle
 * @param {boolean} showAllParents
 * @returns {{
 *   visibleHandles: Set<string>,
 *   chipCounts: Map<string, number>,
 *   chipAnchors: Map<string, {anchorHandle: string, side: string}>,
 * }}
 */
export function pruneGraph(people, collapsed, rootHandle, showAllParents) {
  const adj = buildAdjacency(people, {showAllParents})
  const allHandles = adj.personHandles
  const Rc = reach(
    rootHandle,
    adj.neighbors,
    cutEdgesFor(collapsed, adj, rootHandle)
  )

  const hidden = new Set()
  const chipCounts = new Map()
  const chipAnchors = new Map()

  for (const cut of collapsed) {
    // This cut's own far side, computed independent of the CURRENT root:
    // everyone reachable from its anchors without crossing back over ITS
    // OWN severed edges. A node only actually counts as hidden by this cut
    // if it is ALSO unreachable from root any other way (Rc):
    //  - keeps a pedigree-collapse ancestor (reachable via another,
    //    uncut line) visible, and its cut's chip count at 0;
    //  - keeps root itself, and anyone only "reachable" because root
    //    happens to sit inside this cut's own far side (e.g. re-rooted
    //    onto the hidden spouse's own ancestors), safely visible instead
    //    of wrongly hiding the near side — see the "does not invert"
    //    tests in collapse.test.js for why a naive global
    //    reach(root)\reach(root,cuts) diff can otherwise flip which side
    //    gets hidden depending on where root sits.
    const cutOwnEdges = cutEdgesFor(new Set([cut]), adj, rootHandle)
    const world = new Set()
    for (const anchor of anchorsFor(cut, adj, rootHandle)) {
      for (const h of reach(anchor, adj.neighbors, cutOwnEdges)) world.add(h)
    }
    let n = 0
    for (const h of world) {
      if (h === rootHandle || !allHandles.has(h) || Rc.has(h)) continue
      hidden.add(h)
      n += 1
    }
    chipCounts.set(cut, n)
    chipAnchors.set(cut, anchorFor(cut, adj))
  }

  const visibleHandles = new Set([...allHandles].filter(h => !hidden.has(h)))
  return {visibleHandles, chipCounts, chipAnchors}
}
