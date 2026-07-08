// Shared adjacency/reachability builder for the relationship chart.
//
// Produces an undirected graph over person handles and family-node handles
// that is consumed by both the pure prune/collapse logic and by the
// Graphviz `createGraph` renderer, so the two can never disagree about which
// nodes exist and how they connect.
//
// No DOM, no D3, no imports from other chart files except familyHelpers.js —
// just data in, data out.

import {selectParentFamilies} from './familyHelpers.js'

/**
 * Returns the parent families to use for a person, honouring the
 * showAllParents toggle.
 *
 * - showAllParents true  → all parent families (selectParentFamilies).
 * - showAllParents false → primary parent family only (or [] if none).
 *
 * @param {object|null|undefined} person
 * @param {boolean} showAllParents
 * @returns {object[]}
 */
export const parentFamiliesOf = (person, showAllParents) => {
  if (showAllParents) return selectParentFamilies(person)
  const ppf = person?.extended?.primary_parent_family
  return ppf ? [ppf] : []
}

/**
 * Decides whether a family node should exist in the graph, given the set of
 * known (visible) person handles.
 *
 * - asParentFamily true  (ascending, family is a parent-family of a child) →
 *   exists if EITHER parent is known.
 * - asParentFamily false (descending, family is a person's own family) →
 *   exists if BOTH parents are known.
 *
 * @param {object|null|undefined} family
 * @param {Set<string>} knownHandles
 * @param {{asParentFamily: boolean}} options
 * @returns {boolean}
 */
export const familyNodeExists = (family, knownHandles, {asParentFamily}) => {
  if (!family) return false
  const f = Boolean(
    family.father_handle && knownHandles.has(family.father_handle)
  )
  const m = Boolean(
    family.mother_handle && knownHandles.has(family.mother_handle)
  )
  return asParentFamily ? f || m : f && m
}

/**
 * Builds an undirected adjacency graph over persons and family nodes.
 *
 * @param {object[]} people  Array of person objects (API shape).
 * @param {{showAllParents: boolean}} options
 * @returns {{
 *   personHandles: Set<string>,
 *   familyNodes: Map<string, {father?: string, mother?: string}>,
 *   neighbors: Map<string, Set<string>>,
 *   ancEdges: Map<string, Set<string>>,
 *   ownFamiliesOf: Map<string, Set<string>>,
 * }}
 */
export function buildAdjacency(people, {showAllParents}) {
  const personHandles = new Set(people.map(p => p.handle))
  const familyNodes = new Map()
  const neighbors = new Map()
  const ancEdges = new Map()
  const ownFamiliesOf = new Map()

  const addVertex = h => {
    if (!neighbors.has(h)) neighbors.set(h, new Set())
  }
  const addEdge = (a, b) => {
    addVertex(a)
    addVertex(b)
    neighbors.get(a).add(b)
    neighbors.get(b).add(a)
  }
  const ensureFamilyNode = (family, asParentFamily) => {
    if (!familyNodeExists(family, personHandles, {asParentFamily})) return false
    if (!familyNodes.has(family.handle)) {
      const rec = {}
      if (family.father_handle && personHandles.has(family.father_handle)) {
        rec.father = family.father_handle
      }
      if (family.mother_handle && personHandles.has(family.mother_handle)) {
        rec.mother = family.mother_handle
      }
      familyNodes.set(family.handle, rec)
    }
    return true
  }

  for (const p of people) {
    addVertex(p.handle)
  }

  // Own families (spouse → union link) — descending: needs both parents known.
  for (const p of people) {
    ownFamiliesOf.set(p.handle, new Set())
    for (const f of p.extended?.families ?? []) {
      if (ensureFamilyNode(f, false)) {
        addEdge(p.handle, f.handle)
        ownFamiliesOf.get(p.handle).add(f.handle)
      }
    }
  }

  // Parent families (child → parent-family link) — ascending: needs either parent known.
  for (const p of people) {
    ancEdges.set(p.handle, new Set())
    for (const f of parentFamiliesOf(p, showAllParents)) {
      if (f?.handle && ensureFamilyNode(f, true)) {
        addEdge(p.handle, f.handle)
        ancEdges.get(p.handle).add(f.handle)
      }
    }
  }

  return {personHandles, familyNodes, neighbors, ancEdges, ownFamiliesOf}
}
