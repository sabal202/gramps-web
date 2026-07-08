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
        canEdit: this.canEdit,
        initialZoom: this._savedZoom,
        collapsed: this.collapsed,
        rootHandle,
        unionStatusLabels: {
          married: this._('Married'),
          divorced: this._('Divorced'),
          widowed: this._('Widowed'),
          partners: this._('Unmarried partners'),
        },
      })}
    `
  }
}

window.customElements.define(
  'grampsjs-relationship-chart',
  GrampsjsRelationshipChart
)
