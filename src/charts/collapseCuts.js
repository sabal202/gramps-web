// Enumerates the collapse cuts offered by the chart collapse UI, with
// hidden-person counts. Pure — no DOM. Wraps the upstream engine
// (charts/collapse.js), which owns the cut semantics (see the header there:
// anc:<P>:<F>, spouse:<F>:<S>, children:<F> and the line/desc presets).
//
// Labels are NOT composed here: entries carry name/surname parts and the UI
// composes them with its own translated templates.
import {
  makeCtx,
  makeCutResolver,
  directAncestorHandles,
} from './collapse.js'

/**
 * Lists the collapse cuts available on the current graph, grouped for the
 * collapse dialog.
 *
 * @param {object[]} people raw chart people (profile + extended families)
 * @param {string} rootHandle handle of the chart's root person
 * @param {boolean} showAllParents must match what the chart renders
 * @returns {{presets: object[], spouse: object[], children: object[], ancestors: object[]}}
 *   each entry: {cutKey, count, ...naming parts}
 */
export function enumerateCuts(people, rootHandle, showAllParents = false) {
  const ctx = makeCtx(people, showAllParents)
  const resolve = makeCutResolver(people, rootHandle, showAllParents, ctx)
  const rootAncestors = directAncestorHandles(
    people,
    rootHandle,
    showAllParents,
    ctx
  )
  const personsByHandle = new Map(people.map(p => [p.handle, p]))
  const nameOf = h => {
    const prof = personsByHandle.get(h)?.profile
    return prof?.name_display || prof?.name_given || ''
  }
  const surnameOf = h => personsByHandle.get(h)?.profile?.name_surname || ''

  const withCount = cutKey => ({
    cutKey,
    count: resolve(cutKey)?.size ?? 0,
  })

  // Presets — always offered.
  const presets = [
    {...withCount('line'), kind: 'line'},
    {...withCount('desc'), kind: 'desc'},
  ].filter(cut => cut.count > 0)

  // Spouse branches: for each family with two known spouses, offer hiding the
  // spouse that is NOT the root and NOT on the root's direct ancestor line.
  const spouse = []
  for (const [familyHandle, rec] of ctx.adj.familyNodes) {
    if (!rec.father || !rec.mother) continue
    for (const far of [rec.father, rec.mother]) {
      if (far === rootHandle || rootAncestors.has(far)) continue
      spouse.push({
        ...withCount(`spouse:${familyHandle}:${far}`),
        name: nameOf(far),
      })
    }
  }
  spouse.sort((a, b) => a.count - b.count)

  // Children of one family: both spouses stay.
  const children = []
  for (const familyHandle of ctx.adj.familyNodes.keys()) {
    const kids = ctx.childrenOfFamily.get(familyHandle) ?? []
    if (kids.length === 0) continue
    const rec = ctx.adj.familyNodes.get(familyHandle)
    const surname =
      surnameOf(rec.father) ||
      surnameOf(rec.mother) ||
      nameOf(kids[0]).split(' ').slice(-1)[0] ||
      ''
    children.push({...withCount(`children:${familyHandle}`), surname})
  }
  children.sort((a, b) => a.count - b.count)

  // Ancestor lines: per person P and each of P's parent families F.
  const ancestors = []
  for (const [personHandle, fams] of ctx.adj.ancEdges) {
    if (personHandle === rootHandle) continue
    for (const familyHandle of fams) {
      const rec = ctx.adj.familyNodes.get(familyHandle)
      if (!rec) continue
      const surname = surnameOf(rec.father) || surnameOf(rec.mother)
      ancestors.push({
        ...withCount(`anc:${personHandle}:${familyHandle}`),
        name: nameOf(personHandle),
        surname,
      })
    }
  }
  ancestors.sort((a, b) => a.count - b.count)

  return {presets, spouse, children, ancestors}
}
