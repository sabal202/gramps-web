// Directional collapse/expand core for the relationship chart.
//
// No DOM, no D3 — just the adjacency graph from adjacency.js in, and the set
// of visible handles + chip metadata out. See
// docs/superpowers/specs/2026-07-08-relchart-collapse-expand-design.md.
//
// Semantics (directional subtree, chosen 2026-07-08). The first model hid only
// nodes "dominated" by a cut, which on a densely intermarried tree (a single
// connected component where root reaches almost everyone through marriage
// links) hid almost nothing. Collapse now hides a whole branch in one
// direction — INCLUDING the in-law families married into that branch, which
// only appear in the chart because of it — bounded by a "keep" skeleton so it
// can never eat root's own line.
//
//   anc:<P>       hide P's ancestral cone: ancestors root can no longer reach
//                 going up once P's child->parent links are cut, plus their
//                 collateral descendants and in-laws. Root, root's descendants
//                 and the direct line up to P are kept.
//   union:<F>:<S> hide far spouse S's cone and the F couple's descendants
//                 (+ in-laws). Near spouse N and root's line kept.
//   line          preset: keep ONLY root + root's blood ancestors + root's
//                 blood descendants; hide every collateral and in-law.
//   desc          preset: hide everyone below root (descendants + their
//                 in-laws); keep root, root's spouses and root's ancestors.

import {buildAdjacency} from './adjacency.js'

// ---------------------------------------------------------------------------
// Graph helpers.
// ---------------------------------------------------------------------------

function buildChildrenOfFamily(adj) {
  const childrenOfFamily = new Map()
  for (const [personHandle, fams] of adj.ancEdges) {
    for (const f of fams) {
      if (!childrenOfFamily.has(f)) childrenOfFamily.set(f, [])
      childrenOfFamily.get(f).push(personHandle)
    }
  }
  return childrenOfFamily
}

function makeCtx(people, showAllParents) {
  const adj = buildAdjacency(people, {showAllParents})
  const childrenOfFamily = buildChildrenOfFamily(adj)
  const parentsOf = person => {
    const out = []
    for (const f of adj.ancEdges.get(person) ?? []) {
      const rec = adj.familyNodes.get(f)
      if (!rec) continue
      if (rec.father) out.push(rec.father)
      if (rec.mother) out.push(rec.mother)
    }
    return out
  }
  const childrenOf = person => {
    const out = []
    for (const f of adj.ownFamiliesOf.get(person) ?? []) {
      for (const c of childrenOfFamily.get(f) ?? []) out.push(c)
    }
    return out
  }
  const spousesOf = person => {
    const out = []
    for (const f of adj.ownFamiliesOf.get(person) ?? []) {
      const rec = adj.familyNodes.get(f) || {}
      const other = rec.father === person ? rec.mother : rec.father
      if (other) out.push(other)
    }
    return out
  }
  return {adj, childrenOfFamily, parentsOf, childrenOf, spousesOf}
}

// Upward (child -> parents) closure from `seeds`. `blockUpOf` holds handles
// whose own child->parent step is not traversed (cuts a person's link to their
// parents). Includes the seeds.
function upClosure(ctx, seeds, blockUpOf = new Set()) {
  const seen = new Set(seeds)
  const stack = [...seeds]
  while (stack.length) {
    const cur = stack.pop()
    if (blockUpOf.has(cur)) continue
    for (const p of ctx.parentsOf(cur)) {
      if (!seen.has(p)) {
        seen.add(p)
        stack.push(p)
      }
    }
  }
  return seen
}

// Downward (parent -> children) closure from `seeds`. Includes the seeds.
function downClosure(ctx, seeds) {
  const seen = new Set(seeds)
  const stack = [...seeds]
  while (stack.length) {
    const cur = stack.pop()
    for (const c of ctx.childrenOf(cur)) {
      if (!seen.has(c)) {
        seen.add(c)
        stack.push(c)
      }
    }
  }
  return seen
}

// Connected person-set of `seeds` in the FULL graph (persons + family nodes,
// all edges) with every handle in `keep` treated as a wall: never entered,
// never expanded through. This is what makes a collapse pull in the whole
// branch — descendants, spouses married in, and those spouses' own lines —
// while `keep` (root's skeleton) stops it bleeding into the kept side.
function component(ctx, seeds, keep) {
  const seen = new Set()
  const hidden = new Set()
  const stack = []
  const push = h => {
    if (keep.has(h) || seen.has(h)) return
    seen.add(h)
    stack.push(h)
    if (ctx.adj.personHandles.has(h)) hidden.add(h)
  }
  for (const s of seeds) push(s)
  while (stack.length) {
    const cur = stack.pop()
    for (const n of ctx.adj.neighbors.get(cur) ?? []) push(n)
  }
  return hidden
}

// ---------------------------------------------------------------------------
// Per-cut hidden sets.
// ---------------------------------------------------------------------------

function parseUnionCut(cut) {
  const rest = cut.slice('union:'.length)
  const idx = rest.indexOf(':')
  return {family: rest.slice(0, idx), hiddenSpouse: rest.slice(idx + 1)}
}

function hiddenAnc(ctx, rootHandle, P, protectDesc) {
  const keepAnc = upClosure(ctx, [rootHandle], new Set([P]))
  const upP = upClosure(ctx, [P])
  upP.delete(P)
  const lostAnc = [...upP].filter(h => !keepAnc.has(h))
  const keep = new Set([
    rootHandle,
    ...keepAnc,
    ...protectDesc,
    ...downClosure(ctx, [P]), // P's own subtree stays
  ])
  const hidden = component(ctx, lostAnc, keep)
  return {
    hidden,
    chips: [{count: hidden.size, anchorHandle: P, side: 'ancestors'}],
  }
}

function hiddenUnion(ctx, rootHandle, family, S, protectDesc) {
  const rec = ctx.adj.familyNodes.get(family) || {}
  const N = rec.father === S ? rec.mother : rec.father
  const keepAnc = upClosure(ctx, [rootHandle], new Set([S]))
  const upS = upClosure(ctx, [S])
  const lostS = [...upS].filter(h => !keepAnc.has(h))
  const kids = ctx.childrenOfFamily.get(family) ?? []
  const keep = new Set([rootHandle, ...keepAnc, ...protectDesc])
  if (N) keep.add(N)
  const hidden = component(ctx, [...lostS, ...kids], keep)
  return {
    hidden,
    chips: [{count: hidden.size, anchorHandle: N, side: 'marriage'}],
  }
}

// Boundary chips for a preset: one small "N hidden" badge on every KEPT person
// that has hidden relatives one family-hop away, so the user can see where the
// preset cut things off (and click to expand the whole preset). cutKey is the
// preset key itself.
function boundaryChips(ctx, keepSet, hidden, cutKey) {
  const chips = []
  for (const k of keepSet) {
    if (!ctx.adj.personHandles.has(k)) continue
    let count = 0
    const counted = new Set()
    for (const f of [
      ...(ctx.adj.ancEdges.get(k) ?? []),
      ...(ctx.adj.ownFamiliesOf.get(k) ?? []),
    ]) {
      const rec = ctx.adj.familyNodes.get(f) || {}
      const neigh = [
        rec.father,
        rec.mother,
        ...(ctx.childrenOfFamily.get(f) ?? []),
      ]
      for (const n of neigh) {
        if (n && n !== k && hidden.has(n) && !counted.has(n)) {
          counted.add(n)
          count += 1
        }
      }
    }
    if (count > 0) chips.push({count, anchorHandle: k, side: 'preset', cutKey})
  }
  return chips
}

function hiddenLine(ctx, rootHandle) {
  const keep = new Set([
    rootHandle,
    ...upClosure(ctx, [rootHandle]),
    ...downClosure(ctx, [rootHandle]),
  ])
  const hidden = new Set([...ctx.adj.personHandles].filter(h => !keep.has(h)))
  return {hidden, keep}
}

function hiddenDesc(ctx, rootHandle) {
  const keep = new Set([
    rootHandle,
    ...upClosure(ctx, [rootHandle]),
    ...ctx.spousesOf(rootHandle),
  ])
  const hidden = component(ctx, ctx.childrenOf(rootHandle), keep)
  return {hidden, keep}
}

/**
 * Prunes the relationship-chart graph down to what should be visible given a
 * set of collapse cuts.
 *
 * @param {object[]} people
 * @param {Set<string>} collapsed  Cut keys: "anc:<P>" | "union:<F>:<S>" |
 *   "line" | "desc".
 * @param {string} rootHandle
 * @param {boolean} showAllParents
 * @returns {{
 *   visibleHandles: Set<string>,
 *   chips: Array<{cutKey: string, count: number, anchorHandle: string, side: string}>,
 * }}
 */
export function pruneGraph(people, collapsed, rootHandle, showAllParents) {
  const ctx = makeCtx(people, showAllParents)
  const protectDesc = downClosure(ctx, [rootHandle])

  const hidden = new Set()
  const chips = []

  for (const cut of collapsed) {
    let res
    if (cut === 'line') {
      const {hidden: h, keep} = hiddenLine(ctx, rootHandle)
      res = {hidden: h, chips: boundaryChips(ctx, keep, h, 'line')}
    } else if (cut === 'desc') {
      const {hidden: h, keep} = hiddenDesc(ctx, rootHandle)
      res = {hidden: h, chips: boundaryChips(ctx, keep, h, 'desc')}
    } else if (cut.startsWith('anc:')) {
      res = hiddenAnc(ctx, rootHandle, cut.slice(4), protectDesc)
    } else if (cut.startsWith('union:')) {
      const {family, hiddenSpouse} = parseUnionCut(cut)
      res = hiddenUnion(ctx, rootHandle, family, hiddenSpouse, protectDesc)
    } else {
      continue
    }
    for (const h of res.hidden) hidden.add(h)
    for (const chip of res.chips) {
      chips.push({cutKey: chip.cutKey ?? cut, ...chip})
    }
  }

  const visibleHandles = new Set(
    [...ctx.adj.personHandles].filter(h => !hidden.has(h))
  )
  return {visibleHandles, chips}
}

/**
 * Root's direct blood-ancestor handles (for the direct-line highlight):
 * child->parent closure upward from rootHandle, excluding rootHandle itself.
 *
 * @param {object[]} people
 * @param {string} rootHandle
 * @param {boolean} showAllParents
 * @returns {Set<string>}
 */
export function directAncestorHandles(people, rootHandle, showAllParents) {
  const ctx = makeCtx(people, showAllParents)
  const up = upClosure(ctx, [rootHandle])
  up.delete(rootHandle)
  return up
}

/**
 * "Collapse all descendants" preset — a single 'desc' cut.
 * @returns {Set<string>}
 */
// eslint-disable-next-line no-unused-vars
export function presetCollapseDescendants(people, rootHandle, showAllParents) {
  return new Set(['desc'])
}

/**
 * "Show only direct line" preset — a single 'line' cut.
 * @returns {Set<string>}
 */
// eslint-disable-next-line no-unused-vars
export function presetDirectLineOnly(people, rootHandle, showAllParents) {
  return new Set(['line'])
}
