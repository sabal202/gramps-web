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
      const rest = cut.slice(6)
      const idx = rest.indexOf(':')
      const family = rest.slice(0, idx)
      const hiddenSpouse = rest.slice(idx + 1)
      removed.add(edgeKey(family, hiddenSpouse))
      for (const [h, fams] of adj.ancEdges) {
        if (fams.has(family) && h !== rootHandle)
          removed.add(edgeKey(h, family))
      }
    }
  }
  return removed
}

function anchorFor(cut, adj) {
  if (cut.startsWith('anc:')) {
    return {anchorHandle: cut.slice(4), side: 'ancestors'}
  }
  const rest = cut.slice(6)
  const idx = rest.indexOf(':')
  const family = rest.slice(0, idx)
  const hiddenSpouse = rest.slice(idx + 1)
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
  const R0 = reach(rootHandle, adj.neighbors, new Set())
  const Rc = reach(
    rootHandle,
    adj.neighbors,
    cutEdgesFor(collapsed, adj, rootHandle)
  )
  const hidden = new Set([...R0].filter(h => !Rc.has(h) && allHandles.has(h)))
  const visibleHandles = new Set([...allHandles].filter(h => !hidden.has(h)))

  const chipCounts = new Map()
  const chipAnchors = new Map()
  for (const cut of collapsed) {
    const without = reach(
      rootHandle,
      adj.neighbors,
      cutEdgesFor(
        new Set([...collapsed].filter(c => c !== cut)),
        adj,
        rootHandle
      )
    )
    let n = 0
    for (const h of without) if (!Rc.has(h) && allHandles.has(h)) n += 1
    chipCounts.set(cut, n)
    chipAnchors.set(cut, anchorFor(cut, adj))
  }

  return {visibleHandles, chipCounts, chipAnchors}
}
