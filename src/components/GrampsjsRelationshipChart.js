import {html, css} from 'lit'
import {zoomTransform} from 'd3-zoom'

import '@material/mwc-menu'
import '@material/mwc-list/mwc-list-item'

import {GrampsjsChartBase} from './GrampsjsChartBase.js'
import {RelationshipChart} from '../charts/RelationshipChart.js'
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
    this._savedZoom = null
    this.collapsed = new Set()
  }

  willUpdate() {
    // Save zoom transform before Lit replaces the SVG node
    const svg = this.renderRoot
      ?.getElementById('container')
      ?.querySelector('svg')
    this._savedZoom = svg ? zoomTransform(svg) : null
  }

  renderChart() {
    if (this.data.length === 0 || !this.grampsId) {
      return ''
    }
    const rootHandle = this.data.find(
      p => p.gramps_id === this.grampsId
    )?.handle
    return html`
      ${RelationshipChart(this.data, {
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
        maidenLabel: this._('née'),
        // Only grow the box HEIGHT for the extra maiden-name line; keep the
        // default width (190) so the graph doesn't sprawl horizontally and the
        // pinned-size avatar leaves the name its full width.
        boxHeight: this.showMaidenName ? 108 : 90,
        canEdit: this.canEdit,
        initialZoom: this._savedZoom,
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
          spouseAria: count =>
            this._("Hide spouse's branch (%s hidden)", count),
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
      })}
    `
  }
}

window.customElements.define(
  'grampsjs-relationship-chart',
  GrampsjsRelationshipChart
)
