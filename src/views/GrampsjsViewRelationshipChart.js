import {html, css} from 'lit'

import {GrampsjsViewTreeChartBase} from './GrampsjsViewTreeChartBase.js'
import '../components/GrampsjsRelationshipChart.js'
import '../components/GrampsjsTreeChartAddPerson.js'

export class GrampsjsViewRelationshipChart extends GrampsjsViewTreeChartBase {
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          margin: 0;
        }
      `,
    ]
  }

  static get properties() {
    return {
      ...super.properties,
      _collapsed: {type: Object},
    }
  }

  constructor() {
    super()
    this._setSep = true
    this._setMaxImages = true
    this._setShowUnionDates = true
    this._setShowAllParents = true
    this.color = ''
    this.defaults.nAnc = 10
    this.defaults.showUnionDates = false
    this.defaults.showAllParents = true
    // Set<string> of collapse cut keys (see charts/collapse.js). Session-
    // scoped: survives re-rooting (same view instance) but not a page
    // reload or a tab switch away and back (the relationship-chart element
    // is remounted then). See design doc §1.
    this._collapsed = new Set()
    this._boundHandleCollapseToggle = this._handleCollapseToggle.bind(this)
  }

  connectedCallback() {
    super.connectedCallback()
    // Window-level, like the existing pedigree:person-selected pattern (see
    // clicked() in RelationshipChart.js and its window.addEventListener in
    // GrampsjsViewTree.js) — the SVG controls dispatch with a bare
    // `dispatchEvent(...)` call, which targets window, not the element.
    window.addEventListener(
      'chart:collapse-toggle',
      this._boundHandleCollapseToggle
    )
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener(
      'chart:collapse-toggle',
      this._boundHandleCollapseToggle
    )
  }

  // Toggles a single cut key. Always swaps in a brand-new Set so Lit's
  // default (reference) change detection sees the update and re-renders.
  _handleCollapseToggle(e) {
    const cutKey = e.detail?.cutKey
    if (!cutKey) return
    // The chart is about to be rebuilt from scratch (a fresh SVG node), so
    // whatever node the hover-preview popup is currently anchored to may
    // no longer exist afterwards and would never fire mouseleave — force
    // it closed now rather than leave it stranded. See
    // GrampsjsObjectPreview's force-hide path and clicked() in
    // RelationshipChart.js, which does the same before a reroot.
    window.dispatchEvent(
      new CustomEvent('object:preview-hide', {detail: {force: true}})
    )
    const next = new Set(this._collapsed)
    if (next.has(cutKey)) {
      next.delete(cutKey)
    } else {
      next.add(cutKey)
    }
    this._collapsed = next
  }

  get nAnc() {
    return this.appState?.settings?.relationshipChartAnc ?? this.defaults.nAnc
  }

  set nAnc(value) {
    this.appState.updateSettings({relationshipChartAnc: value}, false)
  }

  get nMaxImages() {
    return (
      this.appState?.settings?.relationshipChartMaxImages ??
      this.defaults.nMaxImages
    )
  }

  set nMaxImages(value) {
    this.appState.updateSettings({relationshipChartMaxImages: value}, false)
  }

  get nameDisplayFormat() {
    return (
      this.appState?.settings?.relationshipChartNameDisplayFormat ??
      this.defaults.nameDisplayFormat
    )
  }

  set nameDisplayFormat(value) {
    this.appState.updateSettings(
      {relationshipChartNameDisplayFormat: value},
      false
    )
  }

  get showUnionDates() {
    return (
      this.appState?.settings?.relationshipChartShowUnionDates ??
      this.defaults.showUnionDates
    )
  }

  // The relationship chart renders per-family union status, so it needs the
  // family profiles the other charts do not.
  get _profileParam() {
    return 'self,families'
  }

  // Also fetch parent_family_list so extended.parent_families is populated,
  // enabling the "show all parent families" feature.
  get _extendParam() {
    return 'event_ref_list,primary_parent_family,family_list,parent_family_list'
  }

  get showAllParents() {
    return (
      this.appState?.settings?.relationshipChartShowAllParents ??
      this.defaults.showAllParents
    )
  }

  set showAllParents(value) {
    this.appState.updateSettings(
      {relationshipChartShowAllParents: value},
      false
    )
  }

  set showUnionDates(value) {
    this.appState.updateSettings(
      {relationshipChartShowUnionDates: value},
      false
    )
  }

  _resetLevels() {
    this.nAnc = this.defaults.nAnc
    this.nMaxImages = this.defaults.nMaxImages
    this.nameDisplayFormat = this.defaults.nameDisplayFormat
    this.showUnionDates = this.defaults.showUnionDates
    this.showAllParents = this.defaults.showAllParents
    this.showMaidenName = this.defaults.showMaidenName
    this._collapsed = new Set()
  }

  _getPersonRules(grampsId) {
    return {
      function: 'or',
      rules: [
        {
          name: 'DegreesOfSeparation',
          values: [grampsId, this.nAnc],
        },
      ],
    }
  }

  renderChart() {
    return html`
      <div @add-new-person-relation="${this._handleAddPersonRelation}">
        <grampsjs-relationship-chart
          grampsId=${this.grampsId}
          nAnc=${this.nAnc + 1}
          nMaxImages=${this.nMaxImages}
          nameDisplayFormat=${this.nameDisplayFormat}
          ?showUnionDates=${this.showUnionDates}
          ?showAllParents=${this.showAllParents}
          ?showMaidenName=${this.showMaidenName}
          ?canEdit="${this._editMode}"
          .data=${this._data}
          .collapsed=${this._collapsed}
        >
        </grampsjs-relationship-chart>
      </div>
    `
  }

  renderContent() {
    return html`
      ${super.renderContent()}
      <grampsjs-tree-chart-add-person
        .appState="${this.appState}"
      ></grampsjs-tree-chart-add-person>
    `
  }
}

window.customElements.define(
  'grampsjs-view-relationship-chart',
  GrampsjsViewRelationshipChart
)
