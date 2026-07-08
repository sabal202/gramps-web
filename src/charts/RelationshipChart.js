import {create, select} from 'd3-selection'
import {zoom} from 'd3-zoom'
import {linkVertical} from 'd3-shape'
import {Graphviz} from '@hpcc-js/wasm'
import {
  mdiChevronUp,
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
} from '@mdi/js'
import {chartNameDisplayFormat} from '../util.js'
import {appendAddPersonButton} from './addPersonButton.js'
import {childRefStyle, selectParentFamilies} from './familyHelpers.js'
import {getMaidenSurname} from './util.js'
import {
  parentFamiliesOf,
  familyNodeExists,
  buildAdjacency,
} from './adjacency.js'
import {pruneGraph, directAncestorHandles, makeCutResolver} from './collapse.js'

const DASHED_EDGE_CLASS = 'dashed_edge'
// Per-edge class prefix carrying the edge's target person handle (see
// generateDot). Read back in remasterChart to highlight the direct blood line
// without depending on graphviz's edge output order.
const EDGE_TARGET_CLASS_PREFIX = 'edgetarget_'
const DASH_CHILD_EDGE = '5,3' // longer dash suits the full-height child→parent edge; kept in sync with DASH_NON_BIRTH in TreeChart.js
// Muted accent for the direct-ancestor-line highlight (Task 10) — additive
// only, never the sole carrier of meaning (root itself already gets a
// drop-shadow; laterals/in-laws get no accent at all).
const DIRECT_LINE_COLOR =
  'color-mix(in srgb, var(--md-sys-color-primary) 45%, transparent)'

// Reserved horizontal width (inches) of the family marriage-marker node.
// nodesep is 0, so this gap is the only room between spouse cards; it must fit
// the family-node controls (whole-marriage ring + "▶/◀" spouse tab). The marker
// glyph itself is drawn centered by d3 (remasterChart), so only the reserved
// gap grows, not the drawn marker. Was 0.1 (controls overlapped the cards).
const FAMILY_NODE_WIDTH_IN = 0.85

const sexColor = {
  F: 'var(--color-girl)',
  M: 'var(--color-boy)',
  X: 'var(--color-other)',
  U: 'var(--color-unknown)',
}

const UNKNOWN_MARITAL_STATUS = 'unknown'

/**
 * Extract the first 4-digit year from a date string. Returns '' if not found.
 * @param {string|null|undefined} dateStr
 * @returns {string}
 */
function extractYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const m = dateStr.match(/\d{4}/)
  return m ? m[0] : ''
}

/**
 * Format a short year label for a family node union bar.
 * Returns '' when there is nothing meaningful to show.
 *
 * Rules:
 *   married  / widowed  → marriage year (e.g. "1985") or ''
 *   divorced            → "<marriageYear>–<divorceYear>" (en-dash);
 *                         no marriage year → just "<divorceYear>";
 *                         no divorce year  → marriage year
 *   partners            → marriage year if present else ''
 *   unknown / other     → ''
 *
 * @param {string|null|undefined} status
 * @param {{marriage: object|null, divorce: object|null}|null|undefined} unionDates
 * @returns {string}
 */
export function formatUnionDates(status, unionDates) {
  if (!status) return ''
  const marriageYear = extractYear(unionDates?.marriage?.date)
  const divorceYear = extractYear(unionDates?.divorce?.date)
  switch (status) {
    case 'married':
    case 'widowed':
      return marriageYear
    case 'divorced': {
      if (marriageYear && divorceYear) return `${marriageYear}–${divorceYear}`
      if (divorceYear) return divorceYear
      return marriageYear
    }
    case 'partners':
      return marriageYear
    default:
      return ''
  }
}

/**
 * Map a marital status string to a plain descriptor that drives SVG marker
 * rendering. Pure function — no DOM side-effects, safe to unit-test.
 *
 * Descriptor shape:
 *   rings   {0|1|2}  — number of ring circles to draw
 *   filled  {boolean} — whether rings are filled (true) or open/unfilled (false)
 *   dashed  {boolean} — whether the union bar uses stroke-dasharray
 *   slash   {boolean} — whether to draw a diagonal slash (divorce glyph)
 *   cross   {boolean} — whether to draw a small cross above the ring (widowed)
 *
 * @param {string} status
 * @returns {{ rings: number, filled: boolean, dashed: boolean, slash: boolean, cross: boolean }}
 */
export function maritalStatusToMarker(status) {
  switch (status) {
    case 'married':
      return {rings: 2, filled: true, dashed: false, slash: false, cross: false}
    case 'divorced':
      return {rings: 2, filled: true, dashed: false, slash: true, cross: false}
    case 'partners':
      return {rings: 1, filled: false, dashed: true, slash: false, cross: false}
    case 'widowed':
      return {rings: 1, filled: true, dashed: false, slash: false, cross: true}
    default:
      // 'unknown' and any unrecognised value → neutral: bar only, no ring
      return {
        rings: 0,
        filled: false,
        dashed: false,
        slash: false,
        cross: false,
      }
  }
}

/**
 * Build a map of family handle → union status/dates from the profiled families
 * carried on each person object (person.profile.families[]).
 *
 * Pure function — no side-effects; safe to unit-test directly.
 *
 * @param {Array} people - array of person objects from the API
 * @returns {Object} map keyed by family handle:
 *   { [handle]: { maritalStatus: string, marriage: object|null, divorce: object|null } }
 */
export function buildFamilyUnionMap(people) {
  const map = {}
  if (!Array.isArray(people)) return map
  for (const person of people) {
    const families = person?.profile?.families
    if (!Array.isArray(families)) continue
    for (const fam of families) {
      const handle = fam?.handle
      if (!handle) continue
      // First writer wins — all spouses share the same family record so values
      // should be identical; we skip if already populated to avoid redundant work.
      if (map[handle]) continue
      map[handle] = {
        maritalStatus: fam?.marital_status ?? UNKNOWN_MARITAL_STATUS,
        marriage: fam?.marriage ?? null,
        divorce: fam?.divorce ?? null,
      }
    }
  }
  return map
}

function createGraph(graph) {
  const data = graph.getData()
  graph.unionMap = buildFamilyUnionMap(data)

  // Which handles are known/visible — same set addPerson populates in step 1,
  // used to evaluate family-node existence via the shared adjacency rules.
  const knownHandles = new Set(data.map(p => p.handle))

  // step 1: collect all persons to be shown
  for (const p of data) {
    graph.addPerson(p)
  }

  // step 2: create nodes for relevant families
  for (const p of data) {
    for (const f of p.extended.families) {
      if (familyNodeExists(f, knownHandles, {asParentFamily: false})) {
        graph.addNode(f, f.handle, f.father_handle, f.mother_handle)
      }
    }
    for (const f of parentFamiliesOf(p, graph.showAllParents)) {
      if (f?.handle) {
        graph.addNode(f, f.handle, f.father_handle, f.mother_handle)
      }
    }
  }

  // step 3: add nodes for remaining persons not part of any families
  for (const p of data) {
    const nnodes = graph.getNodesOfPerson(p.handle).length
    if (nnodes < 1) {
      graph.addNode(undefined, `p_${p.handle}`, p.handle, false)
    }
  }

  // step 4: create edges (child → parent family)
  for (const p of data) {
    const me = p.handle
    for (const f of parentFamiliesOf(p, graph.showAllParents)) {
      const father = f.father_handle
      const mother = f.mother_handle
      // OFF-gate must be a perfect no-op vs current behavior: no dashing at all when the
      // toggle is off, even for a non-birth child in the primary family.
      const dashed = graph.showAllParents ? childRefStyle(f, me).dashed : false
      if (graph.known(father) && graph.known(mother)) {
        graph.addEdge(f.handle, false, me, dashed)
      } else if (graph.known(father)) {
        graph.addEdge(f.handle, father, me, dashed)
      } else if (graph.known(mother)) {
        graph.addEdge(f.handle, mother, me, dashed)
      }
    }
  }

  // step 5: connect unconnected couples (no parents and more than one family)
  for (const p of data) {
    // Has any known parent across all selected parent families?
    const hasKnownParent = parentFamiliesOf(p, graph.showAllParents).some(
      f =>
        (f?.father_handle && graph.known(f.father_handle)) ||
        (f?.mother_handle && graph.known(f.mother_handle))
    )
    if (!hasKnownParent) {
      let np = 0
      for (const f of p.extended.families) {
        let ck = 0
        for (const c of f.child_ref_list) {
          if (graph.known(c.ref)) {
            ck += 1
          }
        }
        if (
          (graph.known(f?.father_handle) && graph.known(f?.mother_handle)) ||
          ck > 0
        ) {
          np += 1
        }
      }
      // occurs more than one time and needs to be connected by fake parent
      if (np > 1) {
        const fakeHandle = `fakeparent${p.handle}`
        graph.addPerson({
          handle: fakeHandle,
          gramps_id: '',
          profile: {
            fake: true,
            name_given: 'FAKE',
            name_surname: p.profile.name_surname,
          },
        })
        graph.addNode({fake: true}, `p_${fakeHandle}`, fakeHandle, false)
        graph.addEdge(`p_${fakeHandle}`, fakeHandle, p.handle, false)
      }
    }
  }
}

function generateDot(graph) {
  let dot = ''
  // nodes
  for (const n of graph.getNodes()) {
    const pf = n.father
    const pm = n.mother
    const widthInches = n.fake ? 0 : graph.boxWidth / 66
    const heightInches = n.fake ? 0 : graph.boxHeight / 66 - 0.3
    if (pf && pm) {
      dot += `
      subgraph "cluster_${n.handle}" {
        cluster=true
        color=white
        margin="50,0"
        label="."
        "node_${n.handle}x${pf}" [
          class="person_${pf}"
          margin=0
          shape="none"
          fixedsize=true
          width=${widthInches}
          height=${heightInches}
          label=<->
        ]
        "node_${n.handle}" [
          class="family_${n.handle}"
          label=<.>
          shape="none"
          margin=0
          fixedsize=true
          width=${FAMILY_NODE_WIDTH_IN}
          height=${heightInches}
        ]
        "node_${n.handle}x${pm}" [
          class="person_${pm}"
          margin=0.25
          shape="none"
          fixedsize=true
          width=${widthInches}
          height=${heightInches}
          label=<->
        ]
      }
    `
    } else {
      const p = pf || pm
      dot += `
      subgraph "cluster_${n.handle}" {
        cluster=true
        color=white
        label="."
        "node_${n.handle}x${p}" [
          class="person_${p}"
          margin=0.25
          shape="none"
          fixedsize=true
          width=${widthInches}
          height=${heightInches}
          label=<->
        ]
      }
    `
    }
  }
  // edges
  for (const e of graph.getEdges()) {
    // Tag each edge with its target person via a class, so the direct-line
    // highlight in remasterChart can identify the edge by identity (graphviz
    // preserves the DOT `class` on the output edge <g>) rather than by DOM
    // order, which graphviz does not guarantee matches the DOT edge order.
    const classes = [`${EDGE_TARGET_CLASS_PREFIX}${e.targetPerson}`]
    if (e.dashed) classes.push(DASHED_EDGE_CLASS)
    const classAttr = `, class="${classes.join(' ')}"`
    for (const targetnode of graph.getNodesOfPerson(e.targetPerson)) {
      if (e.sourcePerson) {
        // one-person node as source
        dot += `"node_${e.sourceFamily}x${e.sourcePerson}" -> "node_${targetnode}x${e.targetPerson}" [label="", arrowhead=none, color="#555"${classAttr}]
      `
      } else {
        dot += `"node_${e.sourceFamily}" -> "node_${targetnode}x${e.targetPerson}" [ltail="node_${e.sourceFamily}", label="", arrowhead=none, color="#555"${classAttr}]
      `
      }
    }
  }

  // frame dot code with global commands
  dot = `
    digraph gramps {
      compound=true
      ranksep=2.8
      labelloc="t"
      charset="UTF-8"
      pad=2
      splines=polyline
      //splines=ortho
      //splines=spline
      // this controls the number of iterations = nslimit * no_nodes
      nslimit=2.0
      nodesep=0
      ${dot}
    }
  `
  return dot
}

class Relgraph {
  constructor(data, boxWidth, boxHeight, grampsId, showAllParents = false) {
    this.data = data
    this.boxWidth = boxWidth
    this.boxHeight = boxHeight
    this.rootPersonGrampsId = grampsId
    this.showAllParents = showAllParents
    this.rootPerson = undefined
    this.nodes = {}
    this.edges = {}
    this.edge_seen = {}
    this.person_node_map = {}
    this.persons = {}
    this.dot = undefined
    this.shrinkToFit = false
    this.unionMap = {}
    createGraph(this)
  }

  getData() {
    return this.data
  }

  getDot() {
    if (!this.dot) {
      this.dot = generateDot(this)
    }
    return this.dot
  }

  addPerson(p) {
    const me = p.handle
    this.persons[me] = {
      handle: me,
      profile: p.profile,
      data: p,
    }
    if (p.gramps_id === this.rootPersonGrampsId) {
      this.rootPerson = this.persons[me]
    }
  }

  getRootPerson() {
    return this.rootPerson
  }

  getPersons() {
    return Object.values(this.persons)
  }

  known(me) {
    return this.persons[me] || false
  }

  addNode(fdata, family, father, mother) {
    const unionEntry = this.unionMap?.[family]
    const n = {
      handle: family,
      type: fdata?.type,
      fake: fdata?.fake,
      maritalStatus: unionEntry?.maritalStatus ?? UNKNOWN_MARITAL_STATUS,
      unionDates: {
        marriage: unionEntry?.marriage ?? null,
        divorce: unionEntry?.divorce ?? null,
      },
    }
    if (father && this.known(father)) {
      n.father = father
      // remember in which nodes these person can be found
      this.person_node_map[father] = this.person_node_map[father] ?? {}
      this.person_node_map[father][family] = true
      // map persondata into node
      n.fatherdata = this.known(father)
    }
    if (mother && this.known(mother)) {
      n.mother = mother
      // remember in which nodes these person can be found
      this.person_node_map[mother] = this.person_node_map[mother] ?? {}
      this.person_node_map[mother][family] = true
      // map persondata into node
      n.motherdata = this.known(mother)
    }
    if (n.father || n.mother) {
      this.nodes[family] = n
    }
  }

  getNode(family) {
    return this.nodes[family] || false
  }

  getNodes() {
    return Object.values(this.nodes)
  }

  getNodesOfPerson(me) {
    if (this.person_node_map[me]) {
      const x = Object.keys(this.person_node_map[me])
      return x
    }
    return []
  }

  addEdge(sourcefamily, sourceperson, targetperson, dashed = false) {
    const key = `${sourcefamily}__${sourceperson}__${targetperson}`
    this.edges[key] = {
      sourceFamily: sourcefamily,
      sourcePerson: sourceperson,
      targetPerson: targetperson,
      dashed,
    }
  }

  getEdges() {
    return Object.values(this.edges)
  }
}

const clipString = (s, length) => {
  if (!s) {
    return ''
  }
  const fontSize = 13
  const nChar = length / (fontSize * 0.6)
  if (s.length <= nChar) {
    return s
  }
  if (nChar < 2) {
    return ''
  }
  return `${s.slice(0, nChar - 2)}…`
}

const getPatronymic = primaryName =>
  (primaryName?.surname_list ?? [])
    .filter(s => s.origintype === 'Patronymic')
    .map(s => s.surname)
    .join(' ')

const getFamilySurname = primaryName =>
  (primaryName?.surname_list ?? [])
    .filter(s => s.origintype !== 'Patronymic')
    .map(s => s.surname)
    .join(' ')

function clicked(event, d) {
  // Force-hide any lingering hover-preview popup before the SVG gets
  // rebuilt under new root — the node under the cursor is about to be
  // removed, so no mouseleave will ever fire for it (see
  // GrampsjsObjectPreview's force-hide path).
  window.dispatchEvent(
    new CustomEvent('object:preview-hide', {detail: {force: true}})
  )
  dispatchEvent(
    new CustomEvent('pedigree:person-selected', {
      bubbles: true,
      composed: true,
      detail: {grampsId: d.profile?.gramps_id},
    })
  )
}

function dispatchCollapseToggle(cutKey) {
  // Bare dispatchEvent (no explicit target) resolves to window.dispatchEvent
  // in a browser — same pattern as pedigree:person-selected above, so the
  // view can listen with a single window-level handler regardless of where
  // in the shadow-DOM tree the control lives.
  dispatchEvent(
    new CustomEvent('chart:collapse-toggle', {
      bubbles: true,
      composed: true,
      detail: {cutKey},
    })
  )
}

// "Collapse whole marriage" (center-click of the family node) is not its own
// cut key — it is spouse:<F>:<S> AND children:<F> together (design §4.4).
// Desktop dispatches it as two ordinary toggles rather than a dedicated
// event; the view's existing per-key XOR toggle handles each independently.
function dispatchCollapseToggleMany(cutKeys) {
  for (const cutKey of cutKeys) dispatchCollapseToggle(cutKey)
}

function forceHidePreview() {
  window.dispatchEvent(
    new CustomEvent('object:preview-hide', {detail: {force: true}})
  )
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Shortest-hop distance from rootHandle to every other reachable vertex,
// over the full (uncollapsed) adjacency graph. Used only to decide, at
// control-render time, which side of an eligible union is the "far" one —
// this is a one-off UI decision (which spouse to name in the cut key when
// the control is drawn), not part of pruneGraph's own reachability logic.
function bfsDistances(rootHandle, neighbors) {
  const dist = new Map([[rootHandle, 0]])
  const queue = [rootHandle]
  while (queue.length) {
    const cur = queue.shift()
    for (const nxt of neighbors.get(cur) ?? []) {
      if (!dist.has(nxt)) {
        dist.set(nxt, dist.get(cur) + 1)
        queue.push(nxt)
      }
    }
  }
  return dist
}

// Vertical anchor for the family-node controls (B/C tabs + the whole-marriage
// ring): the union bar/rings are already drawn at this same height (see
// remasterChart), so anchoring here visually ties the controls to them.
const FAMILY_ANCHOR_Y_OFFSET = -10

// Pending touch long-press timer id (module-level: only one touch pointer can
// be pressing at a time). Cleared whenever affordances are (re)built so a timer
// armed on a now-discarded chart cannot fire a stale chart:collapse-menu.
let activeLongPressTimer = null

// Renders the granular collapse/expand affordances on top of an
// already-drawn chart (see
// docs/superpowers/specs/2026-07-09-relchart-granular-collapse-design.md):
//   - Desktop (hover-capable): a small "▲" tab on the top edge of a person
//     card per visible parent family (cut A, anc:<P>:<F>); a growing "family
//     ring" on family nodes offering a "▶/◀" tab toward the far spouse
//     (cut B, spouse:<F>:<S>) and a "▼" tab for children (cut C,
//     children:<F>); the ring's own center-click collapses both (B+C =
//     "whole marriage").
//   - Touch (hover:none): tapping a family node's hit-area dispatches
//     `chart:collapse-menu` (family options); long-pressing a person card
//     dispatches `chart:collapse-menu` (per-parent-family ancestor options +
//     "make home person"). Short tap still reroots (unchanged) — see
//     `touchState` below.
//   - Reopen pills — one per entry in `chips` (see collapse.js pruneGraph),
//     anchored on the visible person pruneGraph named for each, direction
//     matches the side that was cut.
// `nodes` is the already-built d3 selection of .node .person/.family <g>
// elements, data-bound to the same nodedata records used elsewhere in
// remasterChart. `data`/`collapsed`/`rootHandle`/`showAllParents` are the
// same values the factory passed to pruneGraph — needed here (in addition to
// the already-pruned `graph`) so hiddenCountForCut/pruneGraph can answer
// "what would cut X additionally hide" against the FULL tree, not just the
// currently-visible subset. `directAncestors` is root's blood-ancestor set
// (already computed once in remasterChart for the direct-line highlight).
// `touchState` is a small mutable ref shared with remasterChart's person
// click handler so a long-press can suppress the click it also generates.
function addCollapseAffordances(
  nodes,
  graph,
  boxWidth,
  boxHeight,
  chips,
  svg,
  zoomBehavior,
  collapseLabels,
  data,
  collapsed,
  rootHandle,
  showAllParents,
  directAncestors,
  touchState
) {
  // Cancel any long-press timer still pending from a previous render: the old
  // SVG subtree is discarded on rebuild but a timer's closure survives and
  // would dispatch a stale chart:collapse-menu (review finding 2026-07-09).
  if (activeLongPressTimer) {
    clearTimeout(activeLongPressTimer)
    activeLongPressTimer = null
  }

  // Transient paint with no resolved root (see the caller in
  // GrampsjsRelationshipChart.js) — nothing meaningful to offer.
  if (!rootHandle) return

  const knownHandles = new Set(graph.getData().map(p => p.handle))
  const isTouch = window.matchMedia('(hover: none)').matches
  const reduceMotion = prefersReducedMotion()

  // One adjacency build per render, shared by every tab/pill label AND every
  // hover preview: cutHidden(cutKey) -> the set of currently-visible persons
  // that cut would additionally hide. `.size` is the tooltip count; the set
  // drives preview dimming. Computed over the VISIBLE people (graph.getData()),
  // so a single cut's effect is exactly the marginal hide — far cheaper than a
  // full pruneGraph per control (see collapse.js makeCutResolver).
  const cutHidden = makeCutResolver(
    graph.getData(),
    rootHandle,
    graph.showAllParents
  )
  const countFor = cutKey => cutHidden(cutKey).size

  const adj = buildAdjacency(graph.getData(), {
    showAllParents: graph.showAllParents,
  })
  const distFromRoot = bfsDistances(rootHandle, adj.neighbors)
  // Which spouse the "B" (spouse-branch) tab hides: the one farther from
  // root over the uncollapsed graph. Ties fall back to hiding the father —
  // an arbitrary but deterministic choice; the near/far split only matters
  // when it differs from root's own blood line, and pruneGraph itself pins
  // whichever handle ends up in the key (see collapse.js).
  const farSpouseOf = d => {
    const df = distFromRoot.get(d.father) ?? -1
    const dm = distFromRoot.get(d.mother) ?? -1
    return df >= dm ? d.father : d.mother
  }

  // Screen-x of every visible person, used only to pick which side ("▶" or
  // "◀") the spouse tab should point — a one-off UI decision, not part of
  // pruneGraph's own reachability logic.
  const personXByHandle = new Map()
  nodes
    .filter(d => d.nodetype === 'person')
    .each(function collectX(d) {
      personXByHandle.set(d.handle, d.xCoord)
    })

  // Family objects by handle, from the FULL (unpruned) data — needed to
  // recompute childRefStyle's dashed/non-birth flag for ancestor cuts whose
  // family is no longer part of the visible (pruned) graph, i.e. reopen
  // pills for an already-collapsed anc:<P>:<F>.
  const familyByHandle = new Map()
  for (const p of data) {
    for (const f of selectParentFamilies(p)) {
      if (f?.handle) familyByHandle.set(f.handle, f)
    }
  }
  const dashedForAncCut = (P, F) => {
    const f = familyByHandle.get(F)
    return f ? childRefStyle(f, P).dashed : false
  }

  // "Family surname" shown in ancestor-tab tooltips/mobile-sheet labels:
  // either known parent's surname (whichever is visible), '' if neither is.
  const familySurnameOf = f => {
    const father = graph.known(f?.father_handle)
    const mother = graph.known(f?.mother_handle)
    return father?.profile?.name_surname || mother?.profile?.name_surname || ''
  }

  const visibleParentFamiliesOf = handle => {
    const p = graph.known(handle)
    if (!p) return []
    return parentFamiliesOf(p.data, graph.showAllParents).filter(f =>
      familyNodeExists(f, knownHandles, {asParentFamily: true})
    )
  }

  const focusPanToNode = d => {
    if (!svg || !zoomBehavior) return
    const cx = d.xCoord + boxWidth / 2
    const cy = d.yCoord + boxHeight / 2
    const t = reduceMotion ? svg : svg.transition().duration(200)
    t.call(zoomBehavior.translateTo, cx, cy)
  }

  // A tabbable control receives focus on MOUSEDOWN as well as on keyboard
  // Tab. Recentring the view on mouse-focus is actively harmful: it moves
  // the content out from under the pointer between mousedown and mouseup,
  // so the browser fires no click at all — which silently swallowed both
  // the person reroot click and the collapse click (bug found 2026-07-08).
  // Track pointer activity on the svg and only pan for keyboard-initiated
  // focus.
  let pointerInitiatedFocus = false
  if (svg) {
    svg
      .on('pointerdown.collapsefocus', () => {
        pointerInitiatedFocus = true
      })
      .on('pointerup.collapsefocus', () => {
        pointerInitiatedFocus = false
      })
  }

  // Dims (opacity) every currently-visible node that `cutKeys` would
  // additionally hide, so hovering/focusing a control previews its effect
  // before the click commits it. Lazy — only computed when actually shown,
  // since most tabs are never hovered in a given session.
  const withPreview = (cutKeys, selection) => {
    if (isTouch) return
    const show = () => {
      forceHidePreview()
      const goingHidden = new Set()
      for (const k of cutKeys) {
        for (const h of cutHidden(k)) goingHidden.add(h)
      }
      nodes.each(function dimIfHidden(nd) {
        const hide =
          (nd.nodetype === 'person' && goingHidden.has(nd.handle)) ||
          (nd.nodetype === 'family' &&
            (goingHidden.has(nd.father) || goingHidden.has(nd.mother)))
        if (hide) select(this).style('opacity', 0.25)
      })
    }
    const hide = () => nodes.style('opacity', null)
    selection
      .on('mouseenter.preview', show)
      .on('mouseleave.preview', hide)
      .on('focus.preview', show)
      .on('blur.preview', hide)
  }

  // Appends one directional pill control (used for ancestor tabs A and the
  // family B/C tabs): a small rounded rect with an MDI chevron, dashed
  // border for a non-birth ancestor link.
  const appendPill = (
    parent,
    {cx, cy, iconPath, dashed = false, ariaLabel, onActivate}
  ) => {
    const control = parent
      .append('g')
      .attr('class', 'collapse-control')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .attr('aria-label', ariaLabel)
      .attr('transform', `translate(${cx}, ${cy})`)
      .style('cursor', 'pointer')
      .style('touch-action', 'manipulation')
    control
      .append('rect')
      .attr('x', -11)
      .attr('y', -9)
      .attr('width', 22)
      .attr('height', 18)
      .attr('rx', 9)
      .attr('ry', 9)
      .attr('fill', 'var(--md-sys-color-tertiary-container)')
      .attr('stroke', 'var(--md-sys-color-outline)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', dashed ? '3,2' : null)
    control
      .append('path')
      .attr('d', iconPath)
      .attr('fill', 'var(--md-sys-color-on-tertiary-container)')
      .attr('transform', 'translate(-9,-9) scale(0.75,0.75)')
      .style('pointer-events', 'none')
    control.append('title').text(ariaLabel)
    const activate = event => {
      event.stopPropagation()
      forceHidePreview()
      onActivate()
    }
    control.on('click', activate).on('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activate(event)
      }
    })
    return control
  }

  // ---------------------------------------------------------------------
  // A — ancestor tabs (top edge of a person card), one per visible parent
  // family. Desktop: hover-revealed tabs. Touch: long-press dispatches a
  // bottom-sheet with the same set of families plus "make home person";
  // the long-press also flags touchState.suppressClick so the click the
  // browser generates on release does not ALSO reroot to this person.
  // ---------------------------------------------------------------------
  nodes
    .filter(d => d.nodetype === 'person')
    .each(function eachPerson(d) {
      const g = select(this)
      const families = visibleParentFamiliesOf(d.handle)

      if (isTouch) {
        const LONG_PRESS_MS = 500
        const MOVE_CANCEL_PX = 10
        let startX = 0
        let startY = 0
        const cancel = () => {
          if (activeLongPressTimer) {
            clearTimeout(activeLongPressTimer)
            activeLongPressTimer = null
          }
        }
        g.on('pointerdown.longpress', event => {
          startX = event.clientX
          startY = event.clientY
          cancel()
          activeLongPressTimer = setTimeout(() => {
            activeLongPressTimer = null
            touchState.suppressClick = true
            forceHidePreview()
            const options = families.map(f => {
              const cutKey = `anc:${d.handle}:${f.handle}`
              return {
                cutKey,
                label: familySurnameOf(f),
                count: countFor(cutKey),
                dashed: graph.showAllParents
                  ? childRefStyle(f, d.handle).dashed
                  : false,
              }
            })
            if (options.length) options.push({divider: true})
            options.push({
              action: 'reroot',
              grampsId: d.profile?.gramps_id,
              label: collapseLabels.makeHomePerson,
            })
            const name = [d.profile?.name_given, d.profile?.name_surname]
              .filter(Boolean)
              .join(' ')
            window.dispatchEvent(
              new CustomEvent('chart:collapse-menu', {
                detail: {
                  anchorType: 'person',
                  handle: d.handle,
                  title: name,
                  options,
                },
              })
            )
          }, LONG_PRESS_MS)
        })
          .on('pointermove.longpress', event => {
            if (!activeLongPressTimer) return
            if (
              Math.hypot(event.clientX - startX, event.clientY - startY) >
              MOVE_CANCEL_PX
            ) {
              cancel()
            }
          })
          .on(
            'pointerup.longpress pointercancel.longpress pointerleave.longpress',
            cancel
          )
        return
      }

      if (families.length === 0) return
      families.forEach((f, i) => {
        const cx = (boxWidth * (i + 1)) / (families.length + 1)
        const cy = -9
        const dashed = graph.showAllParents
          ? childRefStyle(f, d.handle).dashed
          : false
        const cutKey = `anc:${d.handle}:${f.handle}`
        const count = countFor(cutKey)
        const label = familySurnameOf(f)
        const tab = appendPill(g, {
          cx,
          cy,
          iconPath: mdiChevronUp,
          dashed,
          ariaLabel: collapseLabels.ancestorsAria(label, count),
          onActivate: () => dispatchCollapseToggle(cutKey),
        })
        tab.attr('tabindex', '0').on('focus', () => {
          if (!pointerInitiatedFocus) focusPanToNode(d)
        })
        withPreview([cutKey], tab)
      })
    })

  // ---------------------------------------------------------------------
  // B/C — family node: hover-grown ring (center-click = whole marriage) +
  // "▶/◀" spouse tab + "▼" children tab. Touch: tapping the family node's
  // (enlarged) hit-area dispatches a bottom-sheet with the same options.
  // ---------------------------------------------------------------------
  nodes
    .filter(d => d.nodetype === 'family' && d.father && d.mother)
    .each(function eachFamily(d) {
      const g = select(this)
      const farSpouse = farSpouseOf(d)
      // Never offer to hide root itself or root's own blood line — that
      // would eat the direct line the "keep ancestors" side of the chart
      // exists to protect (design §5).
      const suppressB =
        farSpouse === rootHandle || directAncestors.has(farSpouse)
      const sKey = `spouse:${d.handle}:${farSpouse}`
      const cKey = `children:${d.handle}`
      const activeKeys = suppressB ? [cKey] : [sKey, cKey]

      if (isTouch) {
        const dispatchMenu = event => {
          event.stopPropagation()
          if (event.preventDefault) event.preventDefault()
          forceHidePreview()
          const options = []
          if (!suppressB) {
            options.push({
              cutKey: sKey,
              label: collapseLabels.spouseTab,
              count: countFor(sKey),
            })
          }
          options.push({
            cutKey: cKey,
            label: collapseLabels.childrenTab,
            count: countFor(cKey),
          })
          if (!suppressB) {
            options.push({divider: true})
            options.push({
              action: 'whole',
              family: d.handle,
              spouse: farSpouse,
              label: collapseLabels.wholeMarriage,
            })
          }
          window.dispatchEvent(
            new CustomEvent('chart:collapse-menu', {
              detail: {
                anchorType: 'family',
                handle: d.handle,
                title: collapseLabels.familySheetTitle,
                options,
              },
            })
          )
        }
        g.append('circle')
          .attr('class', 'collapse-touch-hit')
          .attr('r', 22)
          .attr('cx', 0)
          .attr('cy', boxHeight / 2 + FAMILY_ANCHOR_Y_OFFSET)
          .attr('fill', 'transparent')
          .attr('role', 'button')
          .attr('tabindex', '0')
          .attr('aria-label', collapseLabels.familySheetTitle)
          .style('touch-action', 'manipulation')
          .on('click', dispatchMenu)
          .on('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') dispatchMenu(event)
          })
        return
      }

      const anchorY = boxHeight / 2 + FAMILY_ANCHOR_Y_OFFSET
      const ring = g
        .append('circle')
        .attr('class', 'collapse-control family-ring')
        .attr('r', 13)
        .attr('cx', 0)
        .attr('cy', anchorY)
        .attr('fill', 'var(--md-sys-color-tertiary-container)')
        .attr('opacity', 0.35)
        .attr('role', 'button')
        .attr('tabindex', '0')
        .attr('aria-label', collapseLabels.wholeMarriageAria)
        .style('cursor', 'pointer')
        .style('touch-action', 'manipulation')
      ring.append('title').text(collapseLabels.wholeMarriageAria)

      const activateWhole = () => {
        const desiredCollapsed = !activeKeys.every(k => collapsed.has(k))
        const toToggle = activeKeys.filter(
          k => collapsed.has(k) !== desiredCollapsed
        )
        dispatchCollapseToggleMany(toToggle)
      }
      ring
        .on('click', function onRingClick(event) {
          event.stopPropagation()
          forceHidePreview()
          activateWhole()
        })
        .on('keydown', function onRingKeydown(event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.stopPropagation()
            forceHidePreview()
            activateWhole()
          }
        })
        .on('focus', () => {
          if (!pointerInitiatedFocus) focusPanToNode(d)
        })
      withPreview(activeKeys, ring)

      if (!suppressB) {
        const farX = personXByHandle.get(farSpouse)
        const pointRight = farX === undefined ? true : farX >= d.xCoord
        const sCount = countFor(sKey)
        const bTab = appendPill(g, {
          cx: pointRight ? 18 : -18,
          cy: anchorY,
          iconPath: pointRight ? mdiChevronRight : mdiChevronLeft,
          ariaLabel: collapseLabels.spouseAria(sCount),
          onActivate: () => dispatchCollapseToggle(sKey),
        })
        withPreview([sKey], bTab)
      }

      const cCount = countFor(cKey)
      const cTab = appendPill(g, {
        cx: 0,
        cy: anchorY + 20,
        iconPath: mdiChevronDown,
        ariaLabel: collapseLabels.childrenAria(cCount),
        onActivate: () => dispatchCollapseToggle(cKey),
      })
      withPreview([cKey], cTab)
    })

  // ---------------------------------------------------------------------
  // Reopen pills — one per chip returned by pruneGraph, anchored on the
  // visible person it names. Direction (icon + position) follows the
  // side that was cut; always visible (they indicate hidden data, not a
  // hover-only affordance) and clickable/focusable on both desktop and
  // touch. A person may anchor more than one pill (e.g. two collapsed
  // parent families), so identical anchors are staggered.
  // ---------------------------------------------------------------------
  const personNodeSelectionByHandle = new Map()
  nodes
    .filter(d => d.nodetype === 'person')
    .each(function collectPersonNodes(d) {
      personNodeSelectionByHandle.set(d.handle, select(this))
    })

  const chipsPerAnchor = new Map()
  for (const {cutKey, count, anchorHandle, side} of chips) {
    if (!anchorHandle) continue
    const anchorSelection = personNodeSelectionByHandle.get(anchorHandle)
    if (!anchorSelection) continue
    const seq = chipsPerAnchor.get(anchorHandle) ?? 0
    chipsPerAnchor.set(anchorHandle, seq + 1)
    const stagger = seq * 22

    let dx = boxWidth / 2
    let dy = -10 - stagger
    let iconPath = null
    let dashed = false
    if (side === 'ancestors') {
      dy = -34 - stagger
      iconPath = mdiChevronUp
      const [, P, F] = cutKey.split(':')
      dashed = dashedForAncCut(P, F)
    } else if (side === 'spouse') {
      dx = boxWidth + 14
      dy = boxHeight / 2 - 10 - stagger
      iconPath = mdiChevronRight
    } else if (side === 'children') {
      dy = boxHeight + 12 + stagger
      iconPath = mdiChevronDown
    }

    const ariaLabel = collapseLabels.expandHidden?.(count) ?? `+${count}`
    const chip = anchorSelection
      .append('g')
      .attr('class', 'collapse-chip')
      .attr('role', 'button')
      .attr('tabindex', '0')
      .attr('aria-label', ariaLabel)
      .attr('transform', `translate(${dx}, ${dy})`)
      .style('cursor', 'pointer')
      .style('touch-action', 'manipulation')
    chip.append('title').text(ariaLabel)
    chip
      .append('rect')
      .attr('x', -18)
      .attr('y', -10)
      .attr('width', 36)
      .attr('height', 20)
      .attr('rx', 10)
      .attr('ry', 10)
      .attr('fill', 'var(--md-sys-color-primary-container)')
      .attr('stroke', 'var(--md-sys-color-primary)')
      .attr('stroke-dasharray', dashed ? '3,2' : null)
      .attr('stroke-width', 1)
    if (iconPath) {
      chip
        .append('path')
        .attr('d', iconPath)
        .attr('fill', 'var(--md-sys-color-on-primary-container)')
        .attr('transform', 'translate(-16,-8) scale(0.55,0.55)')
        .style('pointer-events', 'none')
      chip
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--md-sys-color-on-primary-container)')
        .attr('x', 4)
        .attr('pointer-events', 'none')
        .text(`${count}`)
    } else {
      chip
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--md-sys-color-on-primary-container)')
        .attr('pointer-events', 'none')
        .text(`⊕ ${count}`)
    }
    const activateChip = event => {
      event.stopPropagation()
      forceHidePreview()
      dispatchCollapseToggle(cutKey)
    }
    chip
      .on('click', activateChip)
      .on('mouseenter', () => {
        if (!isTouch) forceHidePreview()
      })
      .on('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activateChip(event)
        }
      })
  }
}
function remasterChart(
  divhidden,
  targetsvg,
  graph,
  boxWidth,
  boxHeight,
  imgPadding,
  getImageUrl,
  maxImages,
  nameDisplayFormat,
  canEdit = false,
  showUnionDates = false,
  unionStatusLabels = {},
  showMaidenName = false,
  // chips come from pruneGraph (collapse/expand, see collapse.js): rendered
  // as ⊕N chips below.
  chips = [],
  // Outer <svg> selection + its d3-zoom behavior, so a focused node can
  // pan/recentre itself into view (best-effort; see focusPanToNode below).
  svg = null,
  zoomBehavior = null,
  collapseLabels = {},
  // Same values the factory passed to pruneGraph (see collapse.js) — needed
  // again here (in addition to the already-pruned `graph`) so
  // addCollapseAffordances can answer "what would cut X additionally hide"
  // against the FULL tree, not just the currently-visible subset.
  data = [],
  collapsed = new Set(),
  rootHandle = undefined,
  showAllParents = false
) {
  const gvchartx = divhidden.select('svg')
  const nodedata = []
  const imgRadius = (boxHeight - imgPadding * 2) / 2
  const textPadding = d =>
    d.imageUrl ? 2 * imgRadius + 2 * imgPadding : 2 * imgPadding
  const boxWidthTotal = d => boxWidth - textPadding(d)
  // Appends "(maiden surname)" to a rendered surname when the toggle is on
  // and this person has one (see getMaidenSurname for when that is null).
  const withMaidenName = (text, d) =>
    showMaidenName && d.maidenSurname ? `${text} (${d.maidenSurname})` : text
  gvchartx.selectAll('title').remove()
  // based on graphviz created nodes build array containing node data to be bound to d3 nodes
  let imageCount = 0
  gvchartx.selectAll('.node').each(function () {
    const e = select(this)
    const textElement = e.select('text')
    const x = textElement.attr('x')
    const y = textElement.attr('y')
    const c = e.attr('class')
    const found = c.match(/(?<handletype>family|person)_(?<handle>\S+)/)
    if (found.groups.handletype === 'person') {
      const d = graph.known(found.groups.handle)
      const imageUrl = getImageUrl(d)
      if (imageUrl) {
        imageCount += 1
      }
      nodedata.push({
        nodetype: d.profile.fake ? 'fake' : 'person',
        xCoord: x - boxWidth / 2 + 4,
        yCoord: y - boxHeight / 2,
        profile: d.profile,
        primaryName: d.data?.primary_name,
        maidenSurname: getMaidenSurname(d.data),
        imageUrl: imageCount > maxImages ? '' : imageUrl,
        handle: found.groups.handle,
      })
    } else if (found.groups.handletype === 'family') {
      const d = graph.getNode(found.groups.handle)
      nodedata.push({
        nodetype: 'family',
        xCoord: x,
        yCoord: y,
        type: d.type,
        maritalStatus: d.maritalStatus,
        markerDesc: maritalStatusToMarker(
          d.maritalStatus ?? UNKNOWN_MARITAL_STATUS
        ),
        unionDates: d.unionDates,
        unionLabel: formatUnionDates(d.maritalStatus, d.unionDates),
        handle: found.groups.handle,
        father: d.father,
        mother: d.mother,
      })
    }
  })
  // container for edges
  const edges = targetsvg.append('g').attr('class', 'edges')

  // build d3 based nodes with data bound to them
  const nodes = targetsvg
    .selectAll('.node')
    .data(nodedata)
    .enter()
    .append('g')
    .attr('transform', d => `translate(${d.xCoord} ${d.yCoord})`)
    .attr('class', d => `node ${d.nodetype}`)

  nodes
    .filter(d => d.nodetype === 'person')
    .append('rect')
    .attr('fill', d => sexColor[d.profile?.sex] ?? 'var(--color-unknown)')
    .attr('width', 24)
    .attr('height', boxHeight - 1)
    .attr('x', -4)
    .attr('y', 0)
    .attr('rx', 12)
    .attr('ry', 12)

  nodes
    .filter(d => d.nodetype === 'person')
    .append('rect', ':first-child')
    .attr('width', boxWidth)
    .attr('height', boxHeight)
    .attr('class', 'personBox')
    .attr('x', 0)
    .attr('y', 0)
    .attr('rx', 8)
    .attr('ry', 8)

  nodes
    .filter(
      d =>
        (d.profile?.name_given || d.profile?.name_surname) &&
        d.nodetype === 'person'
    )
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '500')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('text-overflow', 'ellipsis')
    .attr('overflow', 'hidden')
    .attr('x', d => textPadding(d))
    .attr('y', 25)
    .text(d =>
      clipString(
        nameDisplayFormat === chartNameDisplayFormat.surnameThenGiven
          ? `${withMaidenName(d.profile?.name_surname, d)},`
          : nameDisplayFormat ===
            chartNameDisplayFormat.givenPatronymicThenSurname
          ? [d.profile?.name_given, getPatronymic(d.primaryName)]
              .filter(Boolean)
              .join(' ')
          : nameDisplayFormat ===
            chartNameDisplayFormat.surnameThenGivenPatronymic
          ? withMaidenName(
              getFamilySurname(d.primaryName) || d.profile?.name_surname,
              d
            )
          : d.profile?.name_given,
        boxWidthTotal(d)
      )
    )

  nodes
    .filter(
      d =>
        (d.profile?.name_given || d.profile?.name_surname) &&
        d.nodetype === 'person'
    )
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '500')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('text-overflow', 'ellipsis')
    .attr('overflow', 'hidden')
    .attr('x', d => textPadding(d))
    .attr('y', 25 + 17)
    .text(d =>
      clipString(
        nameDisplayFormat === chartNameDisplayFormat.surnameThenGiven
          ? d.profile?.name_given
          : nameDisplayFormat ===
            chartNameDisplayFormat.givenPatronymicThenSurname
          ? withMaidenName(
              getFamilySurname(d.primaryName) || d.profile?.name_surname,
              d
            )
          : nameDisplayFormat ===
            chartNameDisplayFormat.surnameThenGivenPatronymic
          ? [d.profile?.name_given, getPatronymic(d.primaryName)]
              .filter(Boolean)
              .join(' ')
          : withMaidenName(d.profile?.name_surname, d),
        boxWidthTotal(d)
      )
    )

  nodes
    .filter(d => d.profile?.birth?.date && d.nodetype === 'person')
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('x', d => textPadding(d))
    .attr('y', 25 + 17 * 2)
    .text(d => clipString(`*${d.profile.birth.date}`, boxWidthTotal(d)))

  nodes
    .filter(d => d.profile?.death?.date && d.nodetype === 'person')
    .append('text')
    .attr('text-anchor', 'start')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('x', d => textPadding(d))
    .attr('y', 25 + 17 * 3)
    .text(d => clipString(`†${d.profile.death.date}`, boxWidthTotal(d)))

  // images
  nodes
    .filter(d => d.imageUrl)
    .append('circle')
    .attr('r', imgRadius)
    .attr('cy', imgRadius + imgPadding)
    .attr('cx', imgRadius + imgPadding)
    .attr('fill', d => `url(#imgpattern-${d.handle})`)

  const defs = targetsvg.append('defs')
  const imgPattern = defs
    .selectAll('.imgpattern')
    .data(nodedata)
    .enter()
    .filter(d => d.nodetype === 'person' && d.imageUrl)
    .append('pattern')
    .attr('id', d => `imgpattern-${d.handle}`)
    .attr('height', 1)
    .attr('width', 1)
    .attr('x', '0')
    .attr('y', '0')

  imgPattern
    .append('image')
    .attr('x', 0)
    .attr('y', 0)
    .attr('height', 70)
    .attr('width', 70)
    .attr('xlink:href', d => d.imageUrl)

  // Union bar — draw for every family node; unknown status → plain bar, no ring/decoration.
  // The bar is always drawn first (insert ':first-child') so rings/overlays render on top.
  nodes
    .filter(d => d.nodetype === 'family')
    .insert('line', ':first-child')
    .attr('class', 'union-bar')
    .attr('x1', -11)
    .attr('x2', 11)
    .attr('y1', boxHeight / 2 - 10)
    .attr('y2', boxHeight / 2 - 10)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', d => (d.markerDesc.dashed ? '3,2' : null))

  // Accessible label: name the union status on each family node (SVG <title>),
  // so the marker is not conveyed by shape/colour alone.
  nodes
    .filter(
      d => d.nodetype === 'family' && d.maritalStatus !== UNKNOWN_MARITAL_STATUS
    )
    .append('title')
    .text(d => unionStatusLabels[d.maritalStatus] ?? d.maritalStatus)

  // Ring(s) — two rings for married/divorced, one for partners/widowed, none for unknown
  // Left ring (always the first when rings > 0)
  nodes
    .filter(d => d.nodetype === 'family' && d.markerDesc.rings >= 1)
    .append('circle')
    .attr('class', 'union-ring union-ring-left')
    .attr('r', 5)
    .attr('cx', d => (d.markerDesc.rings === 2 ? -5 : 0))
    .attr('cy', boxHeight / 2 - 10)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('stroke-width', 1)
    .attr('fill', d =>
      d.markerDesc.filled ? 'var(--grampsjs-color-shade-220)' : 'none'
    )

  // Right ring (only for two-ring statuses: married, divorced)
  nodes
    .filter(d => d.nodetype === 'family' && d.markerDesc.rings === 2)
    .append('circle')
    .attr('class', 'union-ring union-ring-right')
    .attr('r', 5)
    .attr('cx', 5)
    .attr('cy', boxHeight / 2 - 10)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('stroke-width', 1)
    .attr('fill', d =>
      d.markerDesc.filled ? 'var(--grampsjs-color-shade-220)' : 'none'
    )

  // Divorce slash — diagonal line across the rings
  nodes
    .filter(d => d.nodetype === 'family' && d.markerDesc.slash)
    .append('line')
    .attr('class', 'union-slash')
    .attr('x1', -8)
    .attr('x2', 8)
    .attr('y1', boxHeight / 2 - 10 + 6)
    .attr('y2', boxHeight / 2 - 10 - 6)
    .attr('stroke', 'var(--md-sys-color-error)')
    .attr('stroke-width', 1.5)

  // Widowed cross — ✝ sits 5–11 px above the ring centre (cy = boxHeight/2 - 10)
  nodes
    .filter(d => d.nodetype === 'family' && d.markerDesc.cross)
    .append('line')
    .attr('class', 'union-cross-v')
    .attr('x1', 0)
    .attr('x2', 0)
    .attr('y1', boxHeight / 2 - 10 - 5)
    .attr('y2', boxHeight / 2 - 10 - 11)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('stroke-width', 1.5)

  nodes
    .filter(d => d.nodetype === 'family' && d.markerDesc.cross)
    .append('line')
    .attr('class', 'union-cross-h')
    .attr('x1', -3)
    .attr('x2', 3)
    .attr('y1', boxHeight / 2 - 10 - 8)
    .attr('y2', boxHeight / 2 - 10 - 8)
    .attr('stroke', 'var(--grampsjs-body-font-color-40)')
    .attr('stroke-width', 1.5)

  // Union date label — rendered only when showUnionDates is ON and a label exists
  if (showUnionDates) {
    nodes
      .filter(d => d.nodetype === 'family' && d.unionLabel)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px')
      .attr('fill', 'var(--grampsjs-body-font-color-90)')
      .attr('x', 0)
      .attr('y', boxHeight / 2 - 10 + 16)
      .text(d => d.unionLabel)
  }

  // Shared with addCollapseAffordances' touch long-press handling below: a
  // long-press on a person card dispatches the mobile collapse-menu AND
  // sets suppressClick, so the click the browser still generates on
  // pointer-release does not ALSO reroot to this person.
  const touchState = {suppressClick: false}
  nodes
    .filter(d => d.nodetype === 'person')
    .style('cursor', canEdit ? 'default' : 'pointer')
    .on(
      'click',
      canEdit
        ? null
        : function onPersonClick(event, d) {
            if (touchState.suppressClick) {
              touchState.suppressClick = false
              return
            }
            clicked(event, d)
          }
    )
    .on('mouseenter', function (event, d) {
      if (canEdit) return
      if (window.matchMedia('(hover: none)').matches) return
      const grampsId = d.profile?.gramps_id
      if (!grampsId) return
      window.dispatchEvent(
        new CustomEvent('object:preview-show', {
          detail: {
            objectType: 'person',
            grampsId,
            anchorRect: this.getBoundingClientRect(),
          },
        })
      )
    })
    .on('mouseleave', () => {
      if (window.matchMedia('(hover: none)').matches) return
      window.dispatchEvent(new CustomEvent('object:preview-hide'))
    })

  if (canEdit) {
    appendAddPersonButton(
      nodes.filter(d => d.nodetype === 'person'),
      boxWidth - 14,
      14,
      d => d.handle
    )
  }

  // Direct-ancestor-line highlight (Task 10): root's own blood-ancestor
  // handles, computed once and reused for both the edge pass below and the
  // person-box pass further down. Root itself is excluded (it already gets
  // its own drop-shadow highlight) but IS included in the set used to
  // decide which rendered *edges* qualify, since root's own edge to its
  // parent family is part of the direct line too.
  const directAncestors = directAncestorHandles(
    graph.getData(),
    graph.rootPerson?.handle,
    graph.showAllParents
  )
  const directLineForEdges = new Set([
    graph.rootPerson?.handle,
    ...directAncestors,
  ])

  const linkGenerator = linkVertical()
    .x(d => d.x)
    .y(d => d.y)
  // copy edges
  gvchartx.selectAll('.edge').each(function copyEdge() {
    const group = select(this)
    const classAttr = group.attr('class') ?? ''
    const dashed = classAttr.includes(DASHED_EDGE_CLASS)
    // Identify the edge's target person from the class graphviz carried over
    // (see EDGE_TARGET_CLASS_PREFIX) — robust to graphviz edge reordering.
    const targetMatch = classAttr.match(
      new RegExp(`${EDGE_TARGET_CLASS_PREFIX}(\\S+)`)
    )
    const edgeTarget = targetMatch ? targetMatch[1] : null
    const path = group.select('path')
    const pathData = path.attr('d')
    // extract points from path data
    const points = pathData
      ?.match(/-?[\d.]+,-?[\d.]+/g) // Find all "x,y" pairs
      ?.map(d => d.split(',').map(Number)) // Convert to [x, y] arrays
    // we use only the start and end point
    const firstAndLastPoint = [points[0], points[points.length - 1]]
    if (!points) {
      return
    }
    const isDirectLine =
      edgeTarget !== null && directLineForEdges.has(edgeTarget)
    // we replace the polyline with a smooth connector from start to end
    edges
      .append('path')
      .attr('class', 'edge')
      .attr(
        'd',
        linkGenerator({
          source: {x: firstAndLastPoint[0][0], y: firstAndLastPoint[0][1]},
          target: {x: firstAndLastPoint[1][0], y: firstAndLastPoint[1][1]},
        })
      )
      .attr('fill', 'none')
      .attr(
        'stroke',
        isDirectLine ? DIRECT_LINE_COLOR : 'var(--grampsjs-body-font-color-40)'
      )
      .attr('stroke-width', isDirectLine ? 2 : 1)
      .attr('stroke-dasharray', dashed ? DASH_CHILD_EDGE : null)
  })
  // edges.selectAll('path').attr('stroke-opacity', '0.4')

  // move root person to center
  nodes
    .filter(d => d.handle === graph.rootPerson?.handle)
    .each(d => {
      const rpc = {
        x: -1 * d.xCoord - boxWidth / 2,
        y: -1 * d.yCoord - boxHeight / 2,
      }
      targetsvg.attr('transform', `translate(${rpc.x} ${rpc.y})`)
    })

  // highlight root person
  nodes
    .filter(d => d.handle === graph.rootPerson?.handle)
    .style(
      'filter',
      'drop-shadow(0 3px 8px var(--grampsjs-body-font-color-30))'
    )

  // highlight direct blood ancestors of root (Task 10) — additive outline
  // only; root itself already stands out via the drop-shadow above, so it
  // is deliberately excluded here to avoid a redundant/competing accent.
  nodes
    .filter(d => d.nodetype === 'person' && directAncestors.has(d.handle))
    .select('.personBox')
    .attr('stroke', DIRECT_LINE_COLOR)
    .attr('stroke-width', 2)

  addCollapseAffordances(
    nodes,
    graph,
    boxWidth,
    boxHeight,
    chips,
    svg,
    zoomBehavior,
    collapseLabels,
    data,
    collapsed,
    rootHandle,
    showAllParents,
    directAncestors,
    touchState
  )

  // kill hidden graphviz generated svg
  gvchartx.remove()
}

export function RelationshipChart(
  data,
  {
    bboxWidth = 300,
    bboxHeight = 150,
    boxWidth = 190,
    boxHeight = 90,
    imgPadding = 10,
    getImageUrl = null,
    grampsId = 0,
    maxImages = 400,
    shrinkToFit = false,
    // orientation = 'LTR',
    nameDisplayFormat = chartNameDisplayFormat.surnameThenGiven,
    canEdit = false,
    showUnionDates = false,
    showAllParents = false,
    initialZoom = null,
    unionStatusLabels = {},
    showMaidenName = false,
    // Collapse/expand (see collapse.js): collapsed is a Set of cut keys,
    // rootHandle is the handle (not gramps_id) of the person named by
    // grampsId above — the caller derives it once and passes both down so
    // pruning and rooting never disagree about who "root" is.
    collapsed = new Set(),
    rootHandle = undefined,
    collapseLabels = {},
  }
) {
  // Prune BEFORE building the graph, so createGraph (incl. its fake-parent
  // glue step) runs only on the already-visible set — the drawn graph and
  // pruneGraph's visibility/chip bookkeeping can then never diverge. With
  // an empty `collapsed` set this is a no-op: pruneGraph never populates
  // `hidden` unless there is at least one active cut, so every person
  // passes the filter and rendering is unchanged from before this feature.
  const {visibleHandles, chips} = pruneGraph(
    data,
    collapsed,
    rootHandle,
    showAllParents
  )
  const prunedData = data.filter(p => visibleHandles.has(p.handle))

  const resultnode = create('div').style('width', '100%')
  const divhidden = resultnode.append('div').style('display', 'none')
  const zoomBehavior = zoom().on('zoom', e =>
    svg.select('#chart-content').attr('transform', e.transform)
  )
  const svg = resultnode
    .append('svg')
    .call(zoomBehavior)
    .attr('font-family', 'Inter var')
    .attr('font-size', 13)

  const chartContent = svg.append('g').attr('id', 'chart-content')

  if (initialZoom) {
    svg.node().__zoom = initialZoom
    chartContent.attr('transform', initialZoom.toString())
  }
  const graph = new Relgraph(
    prunedData,
    boxWidth,
    boxHeight,
    grampsId,
    showAllParents
  )
  const dot = graph.getDot()
  Graphviz.load().then(graphviz => {
    graphviz.dot(dot)
    divhidden.html(graphviz.layout(dot, 'svg', 'dot'))
    remasterChart(
      divhidden,
      chartContent.append('g'),
      graph,
      boxWidth,
      boxHeight,
      imgPadding,
      getImageUrl,
      maxImages,
      nameDisplayFormat,
      canEdit,
      showUnionDates,
      unionStatusLabels,
      showMaidenName,
      chips,
      svg,
      zoomBehavior,
      collapseLabels,
      data,
      collapsed,
      rootHandle,
      showAllParents
    )
    svg.attr('viewBox', [
      -bboxWidth / 2,
      -bboxHeight / 2,
      bboxWidth,
      bboxHeight,
    ])
    if (shrinkToFit) {
      const bbox = svg.node().getBBox()
      if (bbox.height > bboxHeight) {
        svg
          .attr('viewBox', [bbox.x, bbox.y - 20, bbox.width, bbox.height + 40])
          .attr('height', bboxHeight)
          .attr('width', bboxWidth)
      }
    }
  })

  return svg.node()
}
