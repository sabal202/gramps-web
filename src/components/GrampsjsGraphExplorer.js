/*
Whole-tree graph explorer — an Obsidian-like force-directed graph of every
(visible) person in the tree, rendered on a canvas.

Data comes from `GET /api/analysis/graph/` (see GrampsjsViewGraphExplorer).
All heavy math lives in src/graphExplorer.js (pure, unit-tested); this file
is the canvas renderer, the d3-force simulation and the control panel.

Rendering notes (hard-won on a 12k-node tree):
- forceManyBody().distanceMax(N) is NOT used: the hard force cutoff creates
  visible ring/shell density artifacts around heavy clusters.
- Node radius is world-space but with a screen-space floor (1.2/k px), or
  dots vanish when zoomed out.
- Programmatic zoom fits are instant (no d3 transition): transitions freeze
  when the tab is not compositing and can strand the transform mid-flight.
*/

import {LitElement, css, html} from 'lit'
import {
  drag as d3drag,
  extent as d3extent,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  pointer as d3pointer,
  quantileSorted,
  scaleLinear,
  select as d3select,
  zoom as d3zoom,
  zoomIdentity,
} from 'd3'

import '@material/web/slider/slider.js'
import '@material/web/switch/switch.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/iconbutton/icon-button.js'
import {mdiClose, mdiCog, mdiOpenInNew, mdiVectorPolyline} from '@mdi/js'

import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import './GrampsjsIcon.js'
import {
  betweennessCentrality,
  buildAdjacency,
  computeComponents,
  descendantCounts,
  estimateBirthYears,
  surnameKey,
} from '../graphExplorer.js'

// Categorical palettes (colorblind-validated ordering) for light and dark
// surfaces; slot order matters, do not cycle extra hues.
const CAT8_LIGHT = [
  '#2a78d6',
  '#008300',
  '#d55181',
  '#c98500',
  '#1baf7a',
  '#d95926',
  '#4a3aa7',
  '#e34948',
]
const CAT8_DARK = [
  '#3987e5',
  '#008300',
  '#d55181',
  '#c98500',
  '#199e70',
  '#d95926',
  '#9085e9',
  '#e66767',
]
// Sequential birth-year ramp stops: older = darker, newer = lighter.
const YEAR_RAMP_LIGHT = ['#0d366b', '#1c5cab', '#3987e5', '#86b6ef']
const YEAR_RAMP_DARK = ['#184f95', '#3987e5', '#86b6ef', '#cde2fb']

// Panel parameters survive tab switches within the session (the component is
// remounted when the user switches chart tabs).
const savedParams = {
  minComp: 1,
  tagFilter: -1,
  colorMode: 'year',
  sizeMode: 'degree',
  baseR: 2.2,
  sizeScale: 1.0,
  edgeA: 0.3,
  labelK: 2.0,
  showMaiden: true,
  center: 0.06,
  repel: 100,
  linkSSpouse: 1.5,
  linkSChild: 1.0,
  linkDSpouse: 15,
  linkDChild: 30,
  timeAxis: true,
  timeS: 0.45,
  layoutMode: 'force',
  semS: 0.5,
}

// world-units scale for the normalized [-1, 1] semantic-map coordinates
const SEMANTIC_SCALE = 1800

function lerpColor(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = stops[i]
  const b = stops[i + 1]
  const ch = (s, j) => parseInt(s.slice(1 + 2 * j, 3 + 2 * j), 16)
  const mix = j => Math.round(ch(a, j) + (ch(b, j) - ch(a, j)) * f)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

class GrampsjsGraphExplorer extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      css`
        :host {
          display: block;
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          cursor: grab;
        }

        canvas.dragging {
          cursor: grabbing;
        }

        #panel {
          position: absolute;
          top: 8px;
          right: 8px;
          bottom: 8px;
          width: 300px;
          background: var(--md-sys-color-surface);
          border: 1px solid var(--md-sys-color-outline-variant);
          border-radius: 12px;
          overflow-y: auto;
          padding: 4px 14px 16px;
          transition: transform 0.2s ease;
          z-index: 3;
        }

        #panel.hidden {
          transform: translateX(324px);
        }

        #panelToggle {
          position: absolute;
          top: 10px;
          right: 320px;
          z-index: 4;
        }

        #panelToggle.panelHidden {
          right: 10px;
        }

        details {
          border-bottom: 1px solid var(--md-sys-color-outline-variant);
          padding: 6px 0;
        }

        details:last-of-type {
          border-bottom: none;
        }

        summary {
          cursor: pointer;
          color: var(--md-sys-color-on-surface);
          font-weight: 500;
          font-size: 14px;
          padding: 6px 0;
          user-select: none;
        }

        .row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 6px 0 0;
        }

        .row label {
          flex: 1;
          color: var(--md-sys-color-on-surface-variant);
          font-size: 13px;
        }

        .row output {
          color: var(--md-sys-color-on-surface-variant);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }

        md-slider {
          width: 100%;
          margin: 0;
          --md-slider-active-track-height: 2px;
          --md-slider-inactive-track-height: 2px;
          --md-slider-handle-height: 14px;
          --md-slider-handle-width: 14px;
        }

        md-outlined-select,
        md-outlined-text-field {
          width: 100%;
          margin-top: 8px;
        }

        .switchrow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin: 10px 0 4px;
          color: var(--md-sys-color-on-surface-variant);
          font-size: 13px;
        }

        .btnrow {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .btnrow button {
          background: var(--md-sys-color-surface-container-highest);
          color: var(--md-sys-color-on-surface);
          border: none;
          border-radius: 8px;
          padding: 7px 12px;
          cursor: pointer;
          font-size: 12.5px;
          font-family: inherit;
        }

        .btnrow button:hover {
          background: var(--md-sys-color-surface-container-high, #eee);
        }

        .hint {
          color: var(--md-sys-color-on-surface-variant);
          opacity: 0.75;
          font-size: 11.5px;
          margin: 4px 0;
        }

        #hud {
          position: absolute;
          top: 10px;
          left: 10px;
          max-width: 330px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 2;
        }

        #stats {
          background: var(--md-sys-color-surface);
          border: 1px solid var(--md-sys-color-outline-variant);
          border-radius: 8px;
          padding: 6px 11px;
          font-size: 12px;
          color: var(--md-sys-color-on-surface-variant);
        }

        #card {
          background: var(--md-sys-color-surface);
          border: 1px solid var(--md-sys-color-outline-variant);
          border-radius: 12px;
          padding: 11px 13px;
          position: relative;
        }

        #card h3 {
          margin: 0 24px 2px 0;
          font-size: 15px;
          color: var(--md-sys-color-on-surface);
          font-weight: 550;
        }

        #card .sub {
          color: var(--md-sys-color-on-surface-variant);
          font-size: 12.5px;
          margin-bottom: 6px;
        }

        #card .meta {
          font-size: 12.5px;
          color: var(--md-sys-color-on-surface);
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 1px 12px;
        }

        #card .meta span:nth-child(odd) {
          color: var(--md-sys-color-on-surface-variant);
        }

        #card .open-link {
          margin-top: 8px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--md-sys-color-primary);
          font-size: 13px;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          font-family: inherit;
        }

        #cardClose {
          position: absolute;
          top: 4px;
          right: 4px;
          --md-icon-button-icon-size: 18px;
          width: 32px;
          height: 32px;
        }

        #tip {
          position: absolute;
          display: none;
          pointer-events: none;
          z-index: 10;
          background: var(--md-sys-color-surface);
          border: 1px solid var(--md-sys-color-outline-variant);
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12.5px;
          max-width: 260px;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
          color: var(--md-sys-color-on-surface-variant);
        }

        #tip b {
          color: var(--md-sys-color-on-surface);
          font-weight: 550;
        }

        #legend {
          position: absolute;
          left: 10px;
          bottom: 10px;
          max-width: 360px;
          background: var(--md-sys-color-surface);
          border: 1px solid var(--md-sys-color-outline-variant);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--md-sys-color-on-surface-variant);
          z-index: 2;
        }

        #legend .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 4px 12px;
          margin-top: 4px;
        }

        #legend .chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        #legend .dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          display: inline-block;
        }

        #legend .grad {
          height: 8px;
          border-radius: 4px;
          margin: 5px 0 3px;
        }

        #legend .gradlbl {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          opacity: 0.8;
        }

        #searchResults {
          margin-top: 4px;
          max-height: 160px;
          overflow-y: auto;
        }

        #searchResults div {
          padding: 4px 6px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12.5px;
          color: var(--md-sys-color-on-surface-variant);
        }

        #searchResults div:hover {
          background: var(--md-sys-color-surface-container-highest);
          color: var(--md-sys-color-on-surface);
        }

        @media (max-width: 600px) {
          #panel {
            width: min(300px, calc(100vw - 40px));
          }

          #legend {
            max-width: calc(100vw - 40px);
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      data: {type: Object},
      _panelHidden: {type: Boolean},
      _selected: {type: Object},
      _searchMatches: {type: Array},
      _paused: {type: Boolean},
      _statsHtml: {type: String},
      _pathFrom: {type: Object},
      _path: {type: Object},
    }
  }

  constructor() {
    super()
    this.data = null
    this.params = {...savedParams}
    this._panelHidden = window.innerWidth < 700
    this._selected = null
    this._pathFrom = null
    this._path = null
    this._searchMatches = null
    this._paused = false
    this._nodes = []
    this._links = []
    this._visNodes = []
    this._visLinks = []
    this._adj = []
    this._sim = null
    this._transform = zoomIdentity
    this._hover = null
    this._searchSet = null
    this._renderQueued = false
    this._userMoved = false
    this._resizeObserver = null
    this._themeColors = null
    this._boundInvalidateTheme = () => {
      this._themeColors = null
      this._requestRender()
    }
  }

  /* ================= lifecycle ================= */

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('settings:changed', this._boundInvalidateTheme)
  }

  disconnectedCallback() {
    Object.assign(savedParams, this.params)
    if (this._sim) {
      this._sim.stop()
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
    }
    window.removeEventListener('settings:changed', this._boundInvalidateTheme)
    super.disconnectedCallback()
  }

  firstUpdated() {
    this._canvas = this.renderRoot.querySelector('canvas')
    this._ctx = this._canvas.getContext('2d')
    this._resizeObserver = new ResizeObserver(() => this._resize())
    this._resizeObserver.observe(this)
    this._resize()
    this._setupInteraction()
    if (this.data?.people?.length) {
      this._initGraph()
    }
  }

  updated(changed) {
    super.updated(changed)
    if (changed.has('data') && this.data?.people?.length && this._canvas) {
      this._initGraph()
    }
  }

  /* ================= graph setup ================= */

  _initGraph() {
    const {people, links} = this.data
    this._tagNames = this.data.tags || []
    this._nodes = people.map((p, i) => {
      const fam = p.family_surname ?? p.surname ?? ''
      const pat = p.patronymic || ''
      const maiden = p.maiden_surname || ''
      const altNames = p.alt_names || []
      return {
        id: i,
        handle: p.handle,
        gid: p.gramps_id,
        given: p.given_name || '',
        surname: p.surname || '',
        fam,
        pat,
        maiden,
        altNames,
        // search haystack over every recorded name variant
        hay: [p.given_name, pat, p.surname, fam, maiden, ...altNames]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
        sex: p.gender,
        by: p.birth_year,
        dy: p.death_year,
        tags: p.tags || [],
        cit: p.citations || 0,
        hyp: (p.tags || []).some(t =>
          /гипотез|hypothes/i.test(this._tagNames[t] || '')
        ),
        deg: 0,
        x: 0,
        y: 0,
      }
    })
    // tag frequency: top-8 for coloring, full ranked list for the filter
    {
      const tagCount = new Map()
      for (const n of this._nodes) {
        for (const t of n.tags) {
          tagCount.set(t, (tagCount.get(t) || 0) + 1)
        }
      }
      this._tagsByCount = [...tagCount.entries()].sort((a, b) => b[1] - a[1])
      this._tagSlot = new Map(
        this._tagsByCount.slice(0, 8).map(([t], i) => [t, i])
      )
    }
    this._bc = null
    this._desc = null
    this._links = links.map(l => ({
      source: l.source,
      target: l.target,
      t: l.type === 'spouse' ? 0 : 1,
    }))
    for (const l of this._links) {
      this._nodes[l.source].deg += 1
      this._nodes[l.target].deg += 1
    }
    this._adj = buildAdjacency(this._nodes.length, this._links)
    const {comp, compSize, compOrder, compRank} = computeComponents(this._adj)
    this._comp = comp
    this._compSize = compSize
    this._compOrder = compOrder
    this._compRank = compRank
    this._nodes.forEach((n, i) => {
      n.comp = comp[i]
    })

    // estimated birth years (for the generation axis)
    const {years, estimated} = estimateBirthYears(people, links)
    this._nodes.forEach((n, i) => {
      n.byEst = years[i]
      n.estimated = estimated[i]
    })

    // year color scale over the 2..98 percentile of real years
    const allYears = this._nodes
      .filter(d => d.by && d.by > 1500 && d.by < 2050)
      .map(d => d.by)
      .sort((a, b) => a - b)
    this._yearDomain = allYears.length
      ? [quantileSorted(allYears, 0.02), quantileSorted(allYears, 0.98)]
      : [1800, 1950]
    const [y0, y1] = d3extent(
      this._nodes.filter(d => d.byEst !== null),
      d => d.byEst
    )
    this._yearExtent = [y0 ?? 1700, y1 ?? 2000]
    this._yearY = scaleLinear()
      .domain(this._yearExtent)
      .range([
        -(this._yearExtent[1] - this._yearExtent[0]) * 9,
        (this._yearExtent[1] - this._yearExtent[0]) * 9,
      ])

    // top surnames (feminine forms merged)
    const surnCount = new Map()
    for (const n of this._nodes) {
      const k = surnameKey(n.surname)
      if (k) {
        surnCount.set(k, (surnCount.get(k) || 0) + 1)
      }
    }
    this._topSurnames = [...surnCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
    this._surnSlot = new Map(this._topSurnames.map(([k], i) => [k, i]))

    this._labelOrder = [...this._nodes].sort((a, b) => b.deg - a.deg)
    this._placeInitial()
    this._setupSimulation()
    this._applyFilter()
    this._userMoved = false
    // fit periodically while the layout settles, until the user interacts
    if (this._autoFit) {
      clearInterval(this._autoFit)
    }
    this._autoFit = setInterval(() => {
      if (this._userMoved || !this._sim) {
        clearInterval(this._autoFit)
        return
      }
      this._fitView()
      if (this._sim.alpha() < 0.02) {
        clearInterval(this._autoFit)
      }
    }, 1200)
    this._fitView()
  }

  _placeInitial() {
    // component centers scattered in a disc (large components near the
    // middle), nodes jittered inside their component's circle
    const nComp = this._compSize.length
    const totalArea = this._compOrder.reduce(
      (s, cid) => s + (13 * Math.sqrt(this._compSize[cid]) + 12) ** 2,
      0
    )
    const R = Math.sqrt(totalArea / 0.35)
    const centers = new Array(nComp)
    this._compOrder.forEach((cid, rank) => {
      const r = 13 * Math.sqrt(this._compSize[cid]) + 12
      const bias = 0.15 + (0.85 * rank) / nComp
      const dist = R * bias * Math.sqrt(Math.random())
      const a = Math.random() * 2 * Math.PI
      centers[cid] = {x: dist * Math.cos(a), y: dist * Math.sin(a), r}
    })
    for (const n of this._nodes) {
      const c = centers[n.comp]
      const a = Math.random() * 2 * Math.PI
      const rr = c.r * Math.sqrt(Math.random())
      n.x = c.x + rr * Math.cos(a)
      n.y = c.y + rr * Math.sin(a)
    }
  }

  _setupSimulation() {
    if (this._sim) {
      this._sim.stop()
    }
    this._linkForce = forceLink(this._links)
      .id(d => d.id)
      .distance(l => this._linkDistance(l))
      .strength(l => this._linkStrength(l))
    this._charge = forceManyBody().theta(0.9)
    this._fx = forceX(0)
    this._fy = forceY(0)
    this._sim = forceSimulation(this._nodes)
      .force('link', this._linkForce)
      .force('charge', this._charge)
      .force('x', this._fx)
      .force('y', this._fy)
      .velocityDecay(0.3)
      .alphaDecay(0.008)
      .on('tick', () => this._requestRender())
    this._applyForces()
  }

  // Marriages and parent-child links have separate strength/distance controls:
  // spouses should sit close together (especially along X in generation-axis
  // mode, where Y is pinned by year), while descent chains need slack.
  _linkDistance(l) {
    return l.t === 0 ? this.params.linkDSpouse : this.params.linkDChild
  }

  _linkStrength(l) {
    const base = l.t === 0 ? this.params.linkSSpouse : this.params.linkSChild
    // d3's stabilizing 1/min(degree) scaling, capped at 1 to stay stable
    return Math.min(1, base / Math.min(l.source.deg || 1, l.target.deg || 1))
  }

  _applyForces() {
    const p = this.params
    this._charge.strength(-p.repel)
    this._linkForce
      .distance(l => this._linkDistance(l))
      .strength(l => this._linkStrength(l))
    const sem =
      p.layoutMode === 'semantic' && this._semMap ? this._semMap : null
    if (sem) {
      this._fx
        .x(d => sem.get(d.id)?.[0] ?? 0)
        .strength(d => (sem.has(d.id) ? p.semS : 0.02))
    } else {
      this._fx.x(0).strength(p.center)
    }
    if (p.timeAxis) {
      this._fy
        .y(d => (d.byEst !== null ? this._yearY(d.byEst) : 0))
        .strength(d => {
          if (d.byEst === null) {
            return 0.01
          }
          // estimated years pull weaker than known ones
          return d.estimated ? p.timeS * 0.5 : p.timeS
        })
    } else if (sem) {
      this._fy
        .y(d => sem.get(d.id)?.[1] ?? 0)
        .strength(d => (sem.has(d.id) ? p.semS : 0.02))
    } else {
      this._fy.y(0).strength(p.center)
    }
  }

  _applyFilter() {
    const min = this.params.minComp
    const tf = this.params.tagFilter
    const visible = new Set()
    for (const d of this._nodes) {
      if (this._compSize[d.comp] < min) {
        continue
      }
      if (tf >= 0 && !d.tags.includes(tf)) {
        continue
      }
      visible.add(d.id)
    }
    this._visSet = visible
    this._visNodes = this._nodes.filter(d => visible.has(d.id))
    this._visLinks = this._links.filter(
      l => visible.has(l.source.id) && visible.has(l.target.id)
    )
    this._sim.nodes(this._visNodes)
    this._linkForce.links(this._visLinks)
    this._applyForces()
    this._updateStats()
    this._reheat(0.3)
    this._requestRender()
  }

  _reheat(alpha = 0.6) {
    if (!this._paused && this._sim) {
      this._sim.alpha(Math.max(this._sim.alpha(), alpha)).restart()
    }
  }

  /* ================= interaction ================= */

  _setupInteraction() {
    const canvas = this._canvas
    const sel = d3select(canvas)

    const pick = (px, py) => {
      const t = this._transform
      const node = this._sim?.find(t.invertX(px), t.invertY(py), 14 / t.k)
      return node && this._visSet?.has(node.id) ? node : null
    }
    this._pickNode = pick

    const zoomBehavior = d3zoom()
      .scaleExtent([0.02, 30])
      .filter(ev => {
        if (ev.type === 'mousedown' || ev.type === 'touchstart') {
          this._userMoved = true
          const [px, py] = d3pointer(ev, canvas)
          return !pick(px, py)
        }
        if (ev.type === 'wheel') {
          this._userMoved = true
        }
        return !ev.button
      })
      .on('zoom', ev => {
        this._transform = ev.transform
        this._requestRender()
      })
    this._zoom = zoomBehavior

    // d3-drag uses subject.x/y as the drag origin in CONTAINER (screen)
    // pixels, while the node stores WORLD coordinates. Wrap the node with its
    // screen position so event.x/y stay in screen space and invert cleanly —
    // returning the node directly makes it teleport on the first drag tick.
    const dragBehavior = d3drag()
      .container(canvas)
      .subject(ev => {
        const node = pick(ev.x, ev.y)
        if (!node) {
          return null
        }
        return {
          x: this._transform.applyX(node.x),
          y: this._transform.applyY(node.y),
          node,
        }
      })
      .on('start', ev => {
        const {node} = ev.subject
        canvas.classList.add('dragging')
        node.fx = node.x
        node.fy = node.y
        if (!this._paused) {
          this._sim.alphaTarget(0.25).restart()
        }
      })
      .on('drag', ev => {
        const {node} = ev.subject
        node.fx = this._transform.invertX(ev.x)
        node.fy = this._transform.invertY(ev.y)
        this._requestRender()
      })
      .on('end', ev => {
        const {node} = ev.subject
        canvas.classList.remove('dragging')
        this._sim.alphaTarget(0)
        node.fx = null
        node.fy = null
      })

    sel.call(dragBehavior).call(zoomBehavior).on('dblclick.zoom', null)

    canvas.addEventListener('mousemove', ev => {
      if (ev.buttons) {
        return
      }
      const r = canvas.getBoundingClientRect()
      const n = pick(ev.clientX - r.left, ev.clientY - r.top)
      if (n !== this._hover) {
        this._hover = n
        this._requestRender()
      }
      const tip = this.renderRoot.querySelector('#tip')
      if (n) {
        tip.style.display = 'block'
        tip.innerHTML = this._tipHtml(n)
        tip.style.left = `${Math.min(
          ev.clientX - r.left + 14,
          r.width - 270
        )}px`
        tip.style.top = `${ev.clientY - r.top + 14}px`
      } else {
        tip.style.display = 'none'
      }
    })
    canvas.addEventListener('mouseleave', () => {
      this._hover = null
      this.renderRoot.querySelector('#tip').style.display = 'none'
      this._requestRender()
    })
    canvas.addEventListener('click', ev => {
      const r = canvas.getBoundingClientRect()
      const node = pick(ev.clientX - r.left, ev.clientY - r.top)
      if (this._pathFrom && node && node.id !== this._pathFrom.id) {
        this._completePath(node)
        return
      }
      this._selected = node
      this._requestRender()
    })
  }

  /* ================= path between two people ================= */

  _startPath() {
    this._pathFrom = this._selected
    this._path = null
    this._selected = null
    this._requestRender()
  }

  _clearPath() {
    this._pathFrom = null
    this._path = null
    this._requestRender()
  }

  _shortestPath(a, b) {
    if (this._comp[a] !== this._comp[b]) {
      return null
    }
    const prev = new Map([[a, -1]])
    const queue = [a]
    let head = 0
    while (head < queue.length) {
      const v = queue[head]
      head += 1
      if (v === b) {
        break
      }
      for (const w of this._adj[v]) {
        if (!prev.has(w)) {
          prev.set(w, v)
          queue.push(w)
        }
      }
    }
    if (!prev.has(b)) {
      return null
    }
    const chain = []
    for (let v = b; v !== -1; v = prev.get(v)) {
      chain.push(v)
    }
    return chain.reverse()
  }

  async _completePath(target) {
    const from = this._pathFrom
    this._pathFrom = null
    const chain = this._shortestPath(from.id, target.id)
    if (!chain) {
      this._path = {from, to: target, none: true}
      this._requestRender()
      return
    }
    this._path = {
      from,
      to: target,
      chain,
      nodesSet: new Set(chain),
      rel: null,
    }
    this._requestRender()
    // best-effort human-readable kinship label from the server
    try {
      const res = await this.appState.apiGet(
        `/api/relations/${target.handle}/${from.handle}`
      )
      if ('data' in res && this._path && this._path.to === target) {
        this._path = {
          ...this._path,
          rel: res.data.relationship_string || '',
        }
      }
    } catch {
      // path stays highlighted without a label
    }
  }

  _tipHtml(n) {
    const esc = s =>
      (s || '').replace(
        /[&<>"]/g,
        c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])
      )
    let yrs = this._lifeYears(n)
    if (!yrs && n.estimated) {
      yrs = `≈${n.byEst}`
    }
    // maiden name always shows here (search matches it even when canvas
    // labels have the maiden toggle off)
    return (
      `<b>${esc(this._nodeLabel(n, true))}</b><br>` +
      `${yrs}${yrs ? ' · ' : ''}${this._('Links')}: ${n.deg} · ${esc(n.gid)}`
    )
  }

  // Display label in the charts' default "Surname Given Patronymic" order,
  // optionally with the maiden (birth) surname appended.
  _nodeLabel(n, withMaiden = this.params.showMaiden) {
    const base =
      [n.fam, n.given, n.pat].filter(Boolean).join(' ') || n.surname || '—'
    if (withMaiden && n.maiden) {
      // same convention as the person-card header: maiden surname in parens
      return `${base} (${n.maiden})`
    }
    return base
  }

  _sizeMetric(n) {
    switch (this.params.sizeMode) {
      case 'uniform':
        return 0
      case 'betweenness': {
        if (!this._bc) {
          this._bc = betweennessCentrality(this._adj)
          this._bcMax = this._bc.reduce((m, v) => (v > m ? v : m), 0)
        }
        return this._bcMax > 0 ? 6 * Math.sqrt(this._bc[n.id] / this._bcMax) : 0
      }
      case 'descendants': {
        if (!this._desc) {
          this._desc = descendantCounts(this._nodes.length, this.data.links)
        }
        return Math.sqrt(this._desc[n.id])
      }
      case 'degree':
      default:
        return Math.sqrt(n.deg)
    }
  }

  _nodeRadius(n) {
    return this.params.baseR + this.params.sizeScale * this._sizeMetric(n)
  }

  // eslint-disable-next-line class-methods-use-this
  _lifeYears(n) {
    if (n.by && n.dy) {
      return `${n.by}–${n.dy}`
    }
    if (n.by) {
      return `*${n.by}`
    }
    if (n.dy) {
      return `†${n.dy}`
    }
    return ''
  }

  _resize() {
    if (!this._canvas) {
      return
    }
    this._dpr = window.devicePixelRatio || 1
    this._w = this._canvas.clientWidth
    this._h = this._canvas.clientHeight
    this._canvas.width = this._w * this._dpr
    this._canvas.height = this._h * this._dpr
    this._requestRender()
  }

  _fitView() {
    if (!this._visNodes.length || !this._w) {
      return
    }
    const xe = d3extent(this._visNodes, d => d.x)
    const ye = d3extent(this._visNodes, d => d.y)
    const w = xe[1] - xe[0] + 40
    const h = ye[1] - ye[0] + 40
    const k = Math.min(this._w / w, this._h / h) * 0.95
    const cx = (xe[0] + xe[1]) / 2
    const cy = (ye[0] + ye[1]) / 2
    d3select(this._canvas).call(
      this._zoom.transform,
      zoomIdentity
        .translate(this._w / 2, this._h / 2)
        .scale(k)
        .translate(-cx, -cy)
    )
  }

  _flyTo(n) {
    const target = zoomIdentity
      .translate(this._w / 2, this._h / 2)
      .scale(Math.max(this._transform.k, 2.5))
      .translate(-n.x, -n.y)
    d3select(this._canvas).call(this._zoom.transform, target)
  }

  /* ================= colors ================= */

  _colors() {
    if (this._themeColors) {
      return this._themeColors
    }
    const styles = getComputedStyle(this)
    const token = (name, fallback) =>
      styles.getPropertyValue(name).trim() || fallback
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    this._themeColors = {
      dark,
      cat8: dark ? CAT8_DARK : CAT8_LIGHT,
      yearRamp: dark ? YEAR_RAMP_DARK : YEAR_RAMP_LIGHT,
      grey: token('--md-sys-color-outline', dark ? '#8f9099' : '#79747e'),
      edge: token(
        '--md-sys-color-outline-variant',
        dark ? '#494a52' : '#c4c6d0'
      ),
      edgeSpouse: '#d55181',
      label: token(
        '--md-sys-color-on-surface-variant',
        dark ? '#c6c5d0' : '#46464f'
      ),
      labelStrong: token(
        '--md-sys-color-on-surface',
        dark ? '#e4e2e6' : '#1b1b1f'
      ),
      ring: token('--md-sys-color-primary', '#6d4c41'),
      grid: token(
        '--md-sys-color-outline-variant',
        dark ? '#494a52' : '#c4c6d0'
      ),
      male: dark ? '#3987e5' : '#2a78d6',
      female: '#d55181',
    }
    return this._themeColors
  }

  _yearColor(y) {
    const [a, b] = this._yearDomain
    return lerpColor(this._colors().yearRamp, (y - a) / (b - a || 1))
  }

  _nodeColor(d) {
    const c = this._colors()
    switch (this.params.colorMode) {
      case 'surname': {
        const s = this._surnSlot.get(surnameKey(d.surname))
        return s === undefined ? c.grey : c.cat8[s]
      }
      case 'component': {
        const r = this._compRank[d.comp]
        return r < 8 ? c.cat8[r] : c.grey
      }
      case 'sex':
        if (d.sex === 1) {
          return c.male
        }
        return d.sex === 0 ? c.female : c.grey
      case 'tag': {
        for (const t of d.tags) {
          const s = this._tagSlot.get(t)
          if (s !== undefined) {
            return c.cat8[s]
          }
        }
        return c.grey
      }
      case 'citations': {
        if (d.cit >= 4) {
          return '#008300'
        }
        if (d.cit >= 2) {
          return c.dark ? '#199e70' : '#1baf7a'
        }
        if (d.cit >= 1) {
          return '#c98500'
        }
        return c.dark ? '#e66767' : '#d03b3b'
      }
      case 'year':
      default:
        return d.by && d.by > 1500 && d.by < 2050
          ? this._yearColor(d.by)
          : c.grey
    }
  }

  /* ================= canvas render ================= */

  _requestRender() {
    if (this._renderQueued) {
      return
    }
    this._renderQueued = true
    requestAnimationFrame(() => {
      this._renderQueued = false
      this._renderCanvas()
    })
  }

  _renderCanvas() {
    const ctx = this._ctx
    if (!ctx) {
      return
    }
    const c = this._colors()
    const t = this._transform
    const {k} = t
    ctx.save()
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height)
    ctx.scale(this._dpr, this._dpr)
    ctx.translate(t.x, t.y)
    ctx.scale(k, k)

    const x0 = t.invertX(0)
    const x1 = t.invertX(this._w)
    const y0 = t.invertY(0)
    const y1 = t.invertY(this._h)

    // decade gridlines in generation-axis mode
    if (this.params.timeAxis) {
      ctx.strokeStyle = c.grid
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1 / k
      ctx.fillStyle = c.label
      ctx.font = `${11 / k}px system-ui, sans-serif`
      const dec0 = Math.ceil(this._yearExtent[0] / 10) * 10
      const dec1 = Math.floor(this._yearExtent[1] / 10) * 10
      for (let yr = dec0; yr <= dec1; yr += 10) {
        const yy = this._yearY(yr)
        if (yy < y0 - 20 || yy > y1 + 20) {
          continue
        }
        ctx.beginPath()
        ctx.moveTo(x0, yy)
        ctx.lineTo(x1, yy)
        ctx.stroke()
        ctx.fillText(yr, x0 + 6 / k, yy - 3 / k)
      }
      ctx.globalAlpha = 1
    }

    const hl = this._hover || this._selected
    const hlSet = hl ? new Set([hl.id, ...this._adj[hl.id]]) : null
    const searchActive = !!this._searchSet
    const path = this._path?.nodesSet ? this._path : null

    // edges in 4 batches: (child|spouse) × (normal|highlighted)
    const styles = [
      {t: 1, hi: false, color: c.edge, alpha: this.params.edgeA, w: 0.7},
      {
        t: 0,
        hi: false,
        color: c.edgeSpouse,
        alpha: Math.min(this.params.edgeA * 1.2, 1),
        w: 0.9,
      },
      {t: 1, hi: true, color: c.labelStrong, alpha: 0.9, w: 1.3},
      {t: 0, hi: true, color: c.edgeSpouse, alpha: 0.95, w: 1.5},
    ]
    for (const st of styles) {
      ctx.beginPath()
      let any = false
      for (const l of this._visLinks) {
        if (l.t !== st.t) {
          continue
        }
        const isHl = hlSet
          ? l.source.id === hl.id || l.target.id === hl.id
          : false
        if (isHl !== st.hi) {
          continue
        }
        const sx = l.source.x
        const sy = l.source.y
        const tx = l.target.x
        const ty = l.target.y
        if (
          Math.max(sx, tx) < x0 ||
          Math.min(sx, tx) > x1 ||
          Math.max(sy, ty) < y0 ||
          Math.min(sy, ty) > y1
        ) {
          continue
        }
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
        any = true
      }
      if (!any) {
        continue
      }
      ctx.strokeStyle = st.color
      ctx.globalAlpha =
        (hlSet || searchActive || path) && !st.hi ? st.alpha * 0.25 : st.alpha
      ctx.lineWidth = st.w / k
      ctx.stroke()
    }

    // kinship path overlay: thick accent polyline over the chain
    if (path) {
      ctx.strokeStyle = c.ring
      ctx.globalAlpha = 0.95
      ctx.lineWidth = 2.4 / k
      ctx.beginPath()
      path.chain.forEach((id, i) => {
        const n = this._nodes[id]
        if (i === 0) {
          ctx.moveTo(n.x, n.y)
        } else {
          ctx.lineTo(n.x, n.y)
        }
      })
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // nodes
    ctx.globalAlpha = 1
    for (const n of this._visNodes) {
      if (n.x < x0 - 10 || n.x > x1 + 10 || n.y < y0 - 10 || n.y > y1 + 10) {
        continue
      }
      const r = Math.max(this._nodeRadius(n), 1.2 / k)
      let a = 1
      if (hlSet && !hlSet.has(n.id)) {
        a = 0.15
      }
      if (searchActive && !this._searchSet.has(n.id)) {
        a = Math.min(a, 0.12)
      }
      if (path && !path.nodesSet.has(n.id)) {
        a = Math.min(a, 0.12)
      }
      ctx.globalAlpha = a
      ctx.fillStyle = this._nodeColor(n)
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, 6.2832)
      ctx.fill()
      if (n.hyp) {
        // hypothesis-tagged person: warning-colored ring
        ctx.strokeStyle = '#c98500'
        ctx.lineWidth = 1.2 / k
        ctx.beginPath()
        ctx.arc(n.x, n.y, r + 1.6 / k, 0, 6.2832)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // selection / hover rings
    for (const n of [this._selected, this._hover]) {
      if (!n) {
        continue
      }
      const r = this._nodeRadius(n)
      ctx.strokeStyle = c.ring
      ctx.lineWidth = 1.6 / k
      ctx.beginPath()
      ctx.arc(n.x, n.y, r + 2.5 / k, 0, 6.2832)
      ctx.stroke()
    }

    // labels
    if (k >= this.params.labelK || hlSet || path) {
      ctx.font = `${11 / k}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      let drawn = 0
      const cap = 350
      if (k >= this.params.labelK) {
        ctx.fillStyle = c.label
        for (const n of this._labelOrder) {
          if (drawn >= cap) {
            break
          }
          if (!this._visSet?.has(n.id)) {
            continue
          }
          if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) {
            continue
          }
          if (hlSet && !hlSet.has(n.id)) {
            continue
          }
          if (searchActive && !this._searchSet.has(n.id)) {
            continue
          }
          const r = this._nodeRadius(n)
          ctx.fillText(this._nodeLabel(n), n.x, n.y + r + 12 / k)
          drawn += 1
        }
      }
      const alwaysLabel = new Set([
        ...(hlSet ?? []),
        ...(path ? path.nodesSet : []),
      ])
      if (alwaysLabel.size) {
        ctx.fillStyle = c.labelStrong
        for (const id of alwaysLabel) {
          const n = this._nodes[id]
          if (!this._visSet?.has(n.id)) {
            continue
          }
          if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) {
            continue
          }
          const r = this._nodeRadius(n)
          ctx.fillText(this._nodeLabel(n), n.x, n.y + r + 12 / k)
        }
      }
    }
    ctx.restore()
  }

  /* ================= panel handlers ================= */

  _onParam(key, value) {
    this.params[key] = value
    if (key === 'minComp') {
      this._applyFilter()
      this.requestUpdate()
      return
    }
    if (
      [
        'center',
        'repel',
        'linkSSpouse',
        'linkSChild',
        'linkDSpouse',
        'linkDChild',
        'timeS',
        'semS',
      ].includes(key)
    ) {
      this._applyForces()
      this._reheat(0.3)
    }
    this._requestRender()
    this.requestUpdate()
  }

  _onTimeAxis(ev) {
    this.params.timeAxis = ev.target.selected
    this._applyForces()
    this._reheat(0.5)
    this.requestUpdate()
  }

  _onColorMode(ev) {
    this.params.colorMode = ev.target.value
    this._requestRender()
    this.requestUpdate()
  }

  _onSizeMode(ev) {
    this.params.sizeMode = ev.target.value
    this._requestRender()
    this.requestUpdate()
  }

  _onTagFilter(ev) {
    this.params.tagFilter = Number(ev.target.value)
    this._applyFilter()
    this.requestUpdate()
  }

  _onLayoutMode(ev) {
    this.params.layoutMode = ev.target.value
    if (this.params.layoutMode === 'semantic' && !this._semMap) {
      this._fetchSemanticMap()
      return
    }
    this._applyForces()
    this._reheat(0.8)
    this.requestUpdate()
  }

  async _fetchSemanticMap() {
    this._semLoading = true
    this.requestUpdate()
    const res = await this.appState.apiGet('/api/analysis/semantic-map/')
    this._semLoading = false
    if ('data' in res && res.data.people?.length) {
      const byHandle = new Map(this._nodes.map(n => [n.handle, n]))
      this._semMap = new Map()
      for (const p of res.data.people) {
        const n = byHandle.get(p.handle)
        if (n) {
          this._semMap.set(n.id, [p.x * SEMANTIC_SCALE, p.y * SEMANTIC_SCALE])
        }
      }
      this._semMethod = res.data.method
      this._applyForces()
      this._reheat(0.8)
    } else {
      // endpoint unavailable (e.g. semantic search not configured)
      this.params.layoutMode = 'force'
      this._semError = true
    }
    this.requestUpdate()
  }

  _onShowMaiden(ev) {
    this.params.showMaiden = ev.target.selected
    this._requestRender()
    this.requestUpdate()
  }

  _onSearch(ev) {
    const q = ev.target.value.trim().toLowerCase()
    if (!q) {
      this._searchSet = null
      this._searchMatches = null
      this._requestRender()
      return
    }
    const matches = []
    for (const n of this._nodes) {
      if (!this._visSet?.has(n.id)) {
        continue
      }
      // haystack covers given, patronymic, primary + family surname, maiden
      // surname and every alternate name variant
      if (n.hay.includes(q)) {
        matches.push(n)
      }
    }
    matches.sort((a, b) => b.deg - a.deg)
    this._searchSet = new Set(matches.map(n => n.id))
    this._searchMatches = matches
    this._requestRender()
  }

  _handleReheat() {
    this._paused = false
    this._sim.alpha(1).restart()
  }

  _handlePause() {
    this._paused = !this._paused
    if (this._paused) {
      this._sim.stop()
    } else {
      this._sim.restart()
    }
  }

  _openSelected() {
    if (this._selected) {
      fireEvent(this, 'nav', {path: `person/${this._selected.gid}`})
    }
  }

  _updateStats() {
    const nVis = this._visNodes.length
    const lVis = this._visLinks.length
    const cVis = new Set(this._visNodes.map(d => d.comp)).size
    const total = this._nodes.length
    this._statsHtml =
      `${this._('people')}: ${nVis.toLocaleString()} · ` +
      `${this._('links')}: ${lVis.toLocaleString()} · ` +
      `${this._('islands')}: ${cVis.toLocaleString()}` +
      (nVis < total
        ? ` (${this._('of %s').replace('%s', total.toLocaleString())})`
        : '')
  }

  /* ================= template ================= */

  _renderSlider(label, key, min, max, step, fmt = v => v) {
    return html`
      <div class="row">
        <label>${label}</label>
        <output>${fmt(this.params[key])}</output>
      </div>
      <md-slider
        min="${min}"
        max="${max}"
        step="${step}"
        value="${this.params[key]}"
        @input="${e => this._onParam(key, Number(e.target.value))}"
      ></md-slider>
    `
  }

  _renderLegend() {
    const c = this._canvas ? this._colors() : null
    if (!c) {
      return ''
    }
    const {colorMode} = this.params
    if (colorMode === 'year') {
      const stops = Array.from({length: 11}, (_, i) =>
        lerpColor(c.yearRamp, i / 10)
      ).join(',')
      return html`
        ${this._('Birth year')}
        <div
          class="grad"
          style="background:linear-gradient(90deg,${stops})"
        ></div>
        <div class="gradlbl">
          <span>≤${this._yearDomain[0]}</span>
          <span>≥${this._yearDomain[1]}</span>
        </div>
        <div class="chips">
          <span class="chip"
            ><span class="dot" style="background:${c.grey}"></span>${this._(
              'birth year unknown'
            )}</span
          >
        </div>
      `
    }
    if (colorMode === 'surname') {
      return html`
        ${this._('Surname (top 8)')}
        <div class="chips">
          ${this._topSurnames.map(
            ([s, count], i) => html`
              <span class="chip"
                ><span class="dot" style="background:${c.cat8[i]}"></span
                >${s}&nbsp;(${count})</span
              >
            `
          )}
          <span class="chip"
            ><span class="dot" style="background:${c.grey}"></span>${this._(
              'others'
            )}</span
          >
        </div>
      `
    }
    if (colorMode === 'tag') {
      return html`
        ${this._('Tag (top 8)')}
        <div class="chips">
          ${this._tagsByCount
            .slice(0, 8)
            .map(
              ([t, count], i) => html`
                <span class="chip"
                  ><span class="dot" style="background:${c.cat8[i]}"></span
                  >${this._tagNames[t]}&nbsp;(${count})</span
                >
              `
            )}
          <span class="chip"
            ><span class="dot" style="background:${c.grey}"></span>${this._(
              'others'
            )}</span
          >
        </div>
        <div class="gradlbl" style="margin-top:4px">
          <span>⭘ ${this._('ring')} = ${this._('hypothesis-tagged link')}</span>
        </div>
      `
    }
    if (colorMode === 'citations') {
      const steps = [
        [c.dark ? '#e66767' : '#d03b3b', '0'],
        ['#c98500', '1'],
        [c.dark ? '#199e70' : '#1baf7a', '2–3'],
        ['#008300', '4+'],
      ]
      return html`
        ${this._('Sources (citations)')}
        <div class="chips">
          ${steps.map(
            ([col, label]) => html`
              <span class="chip"
                ><span class="dot" style="background:${col}"></span
                >${label}</span
              >
            `
          )}
        </div>
      `
    }
    if (colorMode === 'component') {
      return html`
        ${this._('Islands (top 8)')}
        <div class="chips">
          ${this._compOrder
            .slice(0, 8)
            .map(
              (cid, i) => html`
                <span class="chip"
                  ><span class="dot" style="background:${c.cat8[i]}"></span
                  >№${i + 1} — ${this._compSize[cid]}</span
                >
              `
            )}
          <span class="chip"
            ><span class="dot" style="background:${c.grey}"></span>${this._(
              'others'
            )}</span
          >
        </div>
      `
    }
    return html`
      <div class="chips">
        <span class="chip"
          ><span class="dot" style="background:${c.male}"></span>${this._(
            'men'
          )}</span
        >
        <span class="chip"
          ><span class="dot" style="background:${c.female}"></span>${this._(
            'women'
          )}</span
        >
        <span class="chip"
          ><span class="dot" style="background:${c.grey}"></span>${this._(
            'not specified'
          )}</span
        >
      </div>
    `
  }

  _renderCard() {
    const n = this._selected
    if (!n) {
      return ''
    }
    let yrs = this._lifeYears(n)
    if (!yrs && n.estimated) {
      yrs = `≈${n.byEst}`
    }
    let sexSign = ''
    if (n.sex === 1) {
      sexSign = '♂ '
    } else if (n.sex === 0) {
      sexSign = '♀ '
    }
    return html`
      <div id="card">
        <md-icon-button
          id="cardClose"
          @click="${() => {
            this._selected = null
            this._requestRender()
          }}"
        >
          <grampsjs-icon
            .path="${mdiClose}"
            color="var(--md-sys-color-on-surface-variant)"
          ></grampsjs-icon>
        </md-icon-button>
        <h3>${this._nodeLabel(n, false)}</h3>
        <div class="sub">${sexSign}${yrs}</div>
        <div class="meta">
          ${n.maiden
            ? html`<span>${this._('Maiden name')}</span
                ><span>${n.maiden}</span>`
            : ''}
          ${n.altNames.length
            ? html`<span>${this._('Other names')}</span
                ><span>${n.altNames.join('; ')}</span>`
            : ''}
          <span>ID</span><span>${n.gid}</span> <span>${this._('Links')}</span
          ><span>${n.deg}</span> <span>${this._('Island')}</span
          ><span
            >№${this._compRank[n.comp] + 1} (${this._compSize[n.comp]})</span
          >
        </div>
        <button class="open-link" @click="${this._openSelected}">
          <grampsjs-icon
            .path="${mdiOpenInNew}"
            height="16"
            width="16"
            color="var(--md-sys-color-primary)"
          ></grampsjs-icon>
          ${this._('Open person page')}
        </button>
        <br />
        <button class="open-link" @click="${this._startPath}">
          <grampsjs-icon
            .path="${mdiVectorPolyline}"
            height="16"
            width="16"
            color="var(--md-sys-color-primary)"
          ></grampsjs-icon>
          ${this._('Path from this person')}
        </button>
      </div>
    `
  }

  _renderPathPanel() {
    if (this._pathFrom) {
      return html`
        <div id="card">
          <md-icon-button id="cardClose" @click="${this._clearPath}">
            <grampsjs-icon
              .path="${mdiClose}"
              color="var(--md-sys-color-on-surface-variant)"
            ></grampsjs-icon>
          </md-icon-button>
          <h3>${this._('Path')}</h3>
          <div class="sub">
            ${this._('Click another person to trace the path from')}
            ${this._nodeLabel(this._pathFrom, false)}
          </div>
        </div>
      `
    }
    const p = this._path
    if (!p) {
      return ''
    }
    return html`
      <div id="card">
        <md-icon-button id="cardClose" @click="${this._clearPath}">
          <grampsjs-icon
            .path="${mdiClose}"
            color="var(--md-sys-color-on-surface-variant)"
          ></grampsjs-icon>
        </md-icon-button>
        <h3>${this._('Path')}</h3>
        <div class="sub">
          ${this._nodeLabel(p.from, false)} → ${this._nodeLabel(p.to, false)}
        </div>
        ${p.none
          ? html`<div class="meta">
              <span>${this._('Not connected (different islands)')}</span>
            </div>`
          : html`
              <div class="meta">
                <span>${this._('Links')}</span
                ><span>${p.chain.length - 1}</span>
                ${p.rel
                  ? html`<span>${this._('Relationship')}</span
                      ><span>${p.rel}</span>`
                  : ''}
              </div>
            `}
      </div>
    `
  }

  render() {
    return html`
      <canvas></canvas>

      <div id="hud">
        <div id="stats">${this._statsHtml || ''}</div>
        ${this._renderPathPanel()} ${this._renderCard()}
      </div>

      <div id="tip"></div>
      <div id="legend">${this._renderLegend()}</div>

      <md-icon-button
        id="panelToggle"
        class="${this._panelHidden ? 'panelHidden' : ''}"
        @click="${() => {
          this._panelHidden = !this._panelHidden
        }}"
      >
        <grampsjs-icon
          .path="${mdiCog}"
          color="var(--md-sys-color-on-surface-variant)"
        ></grampsjs-icon>
      </md-icon-button>

      <div id="panel" class="${this._panelHidden ? 'hidden' : ''}">
        <details open>
          <summary>${this._('Search')}</summary>
          <md-outlined-text-field
            placeholder="${this._('Name or surname')}"
            @input="${this._onSearch}"
          ></md-outlined-text-field>
          ${this._searchMatches
            ? html`
                <div class="hint">
                  ${this._('Found:')} ${this._searchMatches.length}
                </div>
                <div id="searchResults">
                  ${this._searchMatches.slice(0, 15).map(
                    n => html`
                      <div
                        @click="${() => {
                          this._userMoved = true
                          this._flyTo(n)
                          this._selected = n
                          this._requestRender()
                        }}"
                        @keydown="${() => {}}"
                      >
                        ${`${this._nodeLabel(n, true)} ${this._lifeYears(
                          n
                        )}`.trim()}
                      </div>
                    `
                  )}
                </div>
              `
            : ''}
        </details>

        <details open>
          <summary>${this._('Filters')}</summary>
          ${this._renderSlider(
            this._('Minimum island size'),
            'minComp',
            1,
            60,
            1
          )}
          <div class="hint">${this._('Hides small disconnected islands')}</div>
          ${this._tagsByCount?.length
            ? html`
                <md-outlined-select
                  @change="${this._onTagFilter}"
                  value="${String(this.params.tagFilter)}"
                >
                  <md-select-option value="-1"
                    >${this._('All tags')}</md-select-option
                  >
                  ${this._tagsByCount
                    .slice(0, 30)
                    .map(
                      ([t, count]) => html`
                        <md-select-option value="${String(t)}"
                          >${this._tagNames[t]} (${count})</md-select-option
                        >
                      `
                    )}
                </md-outlined-select>
              `
            : ''}
        </details>

        <details open>
          <summary>${this._('Color')}</summary>
          <md-outlined-select
            @change="${this._onColorMode}"
            value="${this.params.colorMode}"
          >
            <md-select-option value="year"
              >${this._('Generations (birth year)')}</md-select-option
            >
            <md-select-option value="surname"
              >${this._('Surname (top 8)')}</md-select-option
            >
            <md-select-option value="component"
              >${this._('Connectivity islands')}</md-select-option
            >
            <md-select-option value="sex">${this._('Gender')}</md-select-option>
            ${this._tagsByCount?.length
              ? html`<md-select-option value="tag"
                  >${this._('Tag (top 8)')}</md-select-option
                >`
              : ''}
            <md-select-option value="citations"
              >${this._('Sources (citations)')}</md-select-option
            >
          </md-outlined-select>
        </details>

        <details open>
          <summary>${this._('Node size')}</summary>
          <md-outlined-select
            @change="${this._onSizeMode}"
            value="${this.params.sizeMode}"
          >
            <md-select-option value="uniform"
              >${this._('Uniform')}</md-select-option
            >
            <md-select-option value="degree"
              >${this._('Number of links')}</md-select-option
            >
            <md-select-option value="betweenness"
              >${this._('Betweenness (bridge people)')}</md-select-option
            >
            <md-select-option value="descendants"
              >${this._('Number of descendants')}</md-select-option
            >
          </md-outlined-select>
          ${this._renderSlider(this._('Dot size'), 'baseR', 0.6, 7, 0.2, v =>
            v.toFixed(1)
          )}
          ${this.params.sizeMode === 'uniform'
            ? ''
            : this._renderSlider(
                this._('Size scale'),
                'sizeScale',
                0.1,
                3,
                0.1,
                v => v.toFixed(1)
              )}
        </details>

        <details open>
          <summary>${this._('Display')}</summary>
          <div class="switchrow">
            <span>${this._('Show maiden name')}</span>
            <md-switch
              ?selected="${this.params.showMaiden}"
              @change="${this._onShowMaiden}"
            ></md-switch>
          </div>
          ${this._renderSlider(
            this._('Link brightness'),
            'edgeA',
            0.04,
            0.9,
            0.02,
            v => v.toFixed(2)
          )}
          ${this._renderSlider(
            this._('Label zoom threshold'),
            'labelK',
            0.4,
            8,
            0.2,
            v => v.toFixed(1)
          )}
        </details>

        <details open>
          <summary>${this._('Layout')}</summary>
          <md-outlined-select
            @change="${this._onLayoutMode}"
            value="${this.params.layoutMode}"
          >
            <md-select-option value="force"
              >${this._('Force-directed')}</md-select-option
            >
            <md-select-option value="semantic"
              >${this._('Semantic map (beta)')}</md-select-option
            >
          </md-outlined-select>
          ${this._semLoading
            ? html`<div class="hint">${this._('Loading semantic map')}…</div>`
            : ''}
          ${this.params.layoutMode === 'semantic'
            ? html`
                ${this._renderSlider(
                  this._('Layout strength'),
                  'semS',
                  0.05,
                  1,
                  0.05,
                  v => v.toFixed(2)
                )}
                <div class="hint">
                  ${this._(
                    'People with similar records are pulled together'
                  )}${this._semMethod ? ` (${this._semMethod})` : ''}
                </div>
              `
            : ''}
        </details>

        <details open>
          <summary>${this._('Forces')}</summary>
          ${this._renderSlider(this._('Centering'), 'center', 0, 0.4, 0.01, v =>
            v.toFixed(2)
          )}
          ${this._renderSlider(this._('Repulsion'), 'repel', 0, 400, 5)}
          ${this._renderSlider(
            this._('Link strength: marriages'),
            'linkSSpouse',
            0,
            2,
            0.05,
            v => v.toFixed(2)
          )}
          ${this._renderSlider(
            this._('Link strength: parent-child'),
            'linkSChild',
            0,
            2,
            0.05,
            v => v.toFixed(2)
          )}
          ${this._renderSlider(
            this._('Link distance: marriages'),
            'linkDSpouse',
            6,
            120,
            2
          )}
          ${this._renderSlider(
            this._('Link distance: parent-child'),
            'linkDChild',
            8,
            200,
            2
          )}
          <div class="btnrow">
            <button @click="${this._handleReheat}">
              ${this._('Shake up')}
            </button>
            <button @click="${this._handlePause}">
              ${this._paused ? this._('Resume') : this._('Pause')}
            </button>
            <button
              @click="${() => {
                this._userMoved = true
                this._fitView()
              }}"
            >
              ${this._('Fit to screen')}
            </button>
          </div>
        </details>

        <details open>
          <summary>${this._('Generation axis')}</summary>
          <div class="switchrow">
            <span>${this._('Y = birth year')}</span>
            <md-switch
              ?selected="${this.params.timeAxis}"
              @change="${this._onTimeAxis}"
            ></md-switch>
          </div>
          ${this._renderSlider(
            this._('Axis strength'),
            'timeS',
            0.02,
            1,
            0.02,
            v => v.toFixed(2)
          )}
          <div class="hint">
            ${this._(
              'People without a birth year are placed by an estimate from their relatives'
            )}
          </div>
        </details>
      </div>
    `
  }
}

window.customElements.define('grampsjs-graph-explorer', GrampsjsGraphExplorer)
