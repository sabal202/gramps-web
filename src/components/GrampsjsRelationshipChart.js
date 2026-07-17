import {css} from 'lit'

import '@material/mwc-menu'
import '@material/mwc-list/mwc-list-item'

import {GrampsjsChartBase} from './GrampsjsChartBase.js'
import {
  RelationshipChart,
  relationshipViewBox,
  repaintNameFormat,
} from '../charts/RelationshipChart.js'
import {getImageUrl} from '../charts/util.js'

class GrampsjsRelationshipChart extends GrampsjsChartBase {
  static get styles() {
    return [
      super.styles,
      css`
        svg a {
          text-decoration: none !important;
        }
        svg .personBox {
          fill: var(--grampsjs-color-shade-230);
        }
        mwc-menu {
          --mdc-typography-subtitle1-font-size: 13px;
          --mdc-menu-item-height: 36px;
        }

        /* Collapse/expand affordances (see charts/RelationshipChart.js
           addCollapseAffordances). Revealed on hover of the containing
           node and on keyboard focus of that node (:focus-within — v1
           puts tabindex on the node itself, not on the small "-" control,
           see addCollapseAffordances for why). Chips (⊕N) are excluded
           from this rule — they indicate hidden data and stay visible. */
        svg .collapse-control {
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        @media (prefers-reduced-motion: reduce) {
          svg .collapse-control {
            transition: none;
          }
        }
        svg .node:hover .collapse-control,
        svg .node:focus-within .collapse-control {
          opacity: 1;
        }
        svg .node[tabindex]:focus-visible {
          outline: 2px solid var(--md-sys-color-primary);
          outline-offset: 2px;
        }
        svg .collapse-chip:focus-visible {
          outline: 2px solid var(--md-sys-color-primary);
          outline-offset: 2px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      grampsId: {type: String},
      nAnc: {type: Number},
      nMaxImages: {type: Number},
      gapX: {type: Number},
      nameDisplayFormat: {type: String},
      showUnionDates: {type: Boolean},
      showAllParents: {type: Boolean},
      showMaidenName: {type: Boolean},
      canEdit: {type: Boolean},
      // Set<string> of collapse cut keys (see charts/collapse.js). Not a
      // reflected attribute — always passed as a Lit property.
      collapsed: {type: Object},
    }
  }

  constructor() {
    super()
    this.grampsId = ''
    this.gapX = 30
    // The persistent chart controller ({node, update}) from RelationshipChart.
    // Created on first draw and reused: structural changes call its update()
    // (keyed-join redraw on the same SVG) instead of rebuilding a new node.
    this._chart = null
    this.collapsed = new Set()
  }

  shouldUpdate(changed) {
    // A container resize only changes the SVG viewBox (a pure function of the
    // container size — see relationshipViewBox), NOT the graphviz layout. So
    // when the ONLY changed properties are the container dimensions, patch the
    // existing SVG's viewBox imperatively and skip the update entirely, instead
    // of rebuilding the whole chart (graphviz relayout + full DOM rebuild) on
    // every ResizeObserver tick.
    const onlyResize = [...changed.keys()].every(
      k => k === 'containerWidth' || k === 'containerHeight'
    )
    if (
      onlyResize &&
      (changed.has('containerWidth') || changed.has('containerHeight'))
    ) {
      const svg = this.renderRoot
        ?.getElementById('container')
        ?.querySelector('svg')
      if (svg && this.containerWidth > 0 && this.containerHeight > 0) {
        svg.setAttribute(
          'viewBox',
          relationshipViewBox(this.containerWidth, this.containerHeight).join(
            ' '
          )
        )
      }
      return false
    }

    // A name-display-format change alters only the text of the two name lines
    // (see formatNameLines), not box sizes or the graphviz layout. So when it
    // is the ONLY changed prop, repaint those lines in place and skip the full
    // rebuild (relayout + DOM teardown). Falls through to a normal rebuild if
    // the chart is not drawn yet (async layout pending) or has no named people.
    const onlyNameFormat =
      changed.has('nameDisplayFormat') &&
      [...changed.keys()].every(k => k === 'nameDisplayFormat')
    if (onlyNameFormat) {
      const svg = this.renderRoot
        ?.getElementById('container')
        ?.querySelector('svg')
      if (svg && repaintNameFormat(svg, this.nameDisplayFormat) > 0) {
        return false
      }
    }

    return true
  }

  renderChart() {
    if (this.data.length === 0 || !this.grampsId) {
      // No chart to show — drop the controller so a later (re)mount rebuilds.
      this._chart = null
      return ''
    }
    const rootHandle = this.data.find(
      p => p.gramps_id === this.grampsId
    )?.handle
    const opts = {
      nAnc: this.nAnc,
      maxImages: this.nMaxImages,
      grampsId: this.grampsId,
      getImageUrl: d => getImageUrl(d?.data || {}, 100),
      bboxWidth: this.containerWidth,
      bboxHeight: this.containerHeight,
      nameDisplayFormat: this.nameDisplayFormat,
      showUnionDates: this.showUnionDates,
      showAllParents: this.showAllParents,
      showMaidenName: this.showMaidenName,
      // Wider boxes when the maiden line is on give long Russian
      // name+patronymic more room and reduce clipping; taller boxes make
      // room for the extra maiden-name line (uniform across all nodes here
      // — the union bar assumes equal box heights, see RelationshipChart.js).
      boxWidth: this.showMaidenName ? 210 : 190,
      boxHeight: this.showMaidenName ? 104 : 90,
      canEdit: this.canEdit,
      // During a reroot, Lit paints once with the new grampsId but the old
      // (stale) data before _fetchData resolves; rootHandle is then undefined
      // and pruning against an unresolved root would over-hide the graph.
      // Treat "no resolved root" as "no active cuts" for that transient paint.
      collapsed: rootHandle ? this.collapsed : new Set(),
      rootHandle,
      unionStatusLabels: {
        married: this._('Married'),
        divorced: this._('Divorced'),
        widowed: this._('Widowed'),
        partners: this._('Unmarried partners'),
      },
      collapseLabels: {
        // Desktop tab/ring aria-labels + tooltips — embed the count so a
        // screen reader or native <title> tooltip states the effect
        // up-front, before activating the control.
        ancestorsAria: (familyLabel, count) =>
          familyLabel
            ? this._('Collapse ancestors: %s (%s hidden)', familyLabel, count)
            : this._('Collapse ancestors (%s hidden)', count),
        spouseAria: count => this._("Hide spouse's branch (%s hidden)", count),
        childrenAria: count => this._('Hide children (%s hidden)', count),
        wholeMarriageAria: this._('Collapse whole marriage'),
        expandHidden: n => this._('Expand %s hidden', n),
        collapseRevealed: this._('Collapse'),
        // Mobile bottom-sheet item labels — plain action names; the sheet
        // renders the count/dashed state itself (see
        // GrampsjsCollapseSheet).
        spouseTab: this._("Hide spouse's branch"),
        childrenTab: this._('Hide children'),
        wholeMarriage: this._('Collapse whole marriage'),
        makeHomePerson: this._('Make home person'),
        familySheetTitle: this._('Family'),
      },
    }
    // Create the chart once, then reuse it: a structural change drives an
    // in-place keyed-join redraw on the same persistent SVG (preserving pan/
    // zoom, avatars and the Graphviz WASM instance) instead of building a new
    // node. Returning the same node keeps Lit from re-inserting it.
    if (this._chart) {
      this._chart.update(this.data, opts)
    } else {
      this._chart = RelationshipChart(this.data, opts)
    }
    return this._chart.node
  }
}

window.customElements.define(
  'grampsjs-relationship-chart',
  GrampsjsRelationshipChart
)
