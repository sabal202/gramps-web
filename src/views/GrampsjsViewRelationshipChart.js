import {html, css} from 'lit'
import {
  mdiFamilyTree,
  mdiArrowCollapseVertical,
  mdiArrowExpandVertical,
} from '@mdi/js'

import '@material/web/iconbutton/icon-button.js'
import {GrampsjsViewTreeChartBase} from './GrampsjsViewTreeChartBase.js'
import '../components/GrampsjsRelationshipChart.js'
import '../components/GrampsjsTreeChartAddPerson.js'
import '../components/GrampsjsCollapseSheet.js'
import '../components/GrampsjsIcon.js'
import '../components/GrampsjsTooltip.js'
import {
  presetCollapseDescendants,
  presetDirectLineOnly,
} from '../charts/collapse.js'

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
      // Mobile bottom-sheet state (see GrampsjsCollapseSheet + the chart's
      // touch handling in RelationshipChart.js addCollapseAffordances).
      _collapseMenuOpen: {type: Boolean},
      _collapseMenuTitle: {type: String},
      _collapseMenuItems: {type: Array},
    }
  }

  constructor() {
    super()
    this._setSep = true
    this._setMaxImages = true
    this._setShowUnionDates = true
    this._setShowAllParents = true
    this._setCollapsePresets = true
    this.color = ''
    this.defaults.nAnc = 10
    this.defaults.showUnionDates = false
    this.defaults.showAllParents = true
    // Set<string> of collapse cut keys (see charts/collapse.js). Session-
    // scoped: survives re-rooting (same view instance) but not a page
    // reload or a tab switch away and back (the relationship-chart element
    // is remounted then). See design doc §1.
    this._collapsed = new Set()
    this._collapseMenuOpen = false
    this._collapseMenuTitle = ''
    this._collapseMenuItems = []
    this._boundHandleCollapseToggle = this._handleCollapseToggle.bind(this)
    this._boundHandleCollapseMenu = this._handleCollapseMenu.bind(this)
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
    window.addEventListener(
      'chart:collapse-menu',
      this._boundHandleCollapseMenu
    )
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener(
      'chart:collapse-toggle',
      this._boundHandleCollapseToggle
    )
    window.removeEventListener(
      'chart:collapse-menu',
      this._boundHandleCollapseMenu
    )
  }

  // The chart is about to be rebuilt from scratch (a fresh SVG node), so
  // whatever node the hover-preview popup is currently anchored to may no
  // longer exist afterwards and would never fire mouseleave — force it
  // closed now rather than leave it stranded. See GrampsjsObjectPreview's
  // force-hide path and clicked() in RelationshipChart.js, which does the
  // same before a reroot.
  // eslint-disable-next-line class-methods-use-this
  _forceHidePreview() {
    window.dispatchEvent(
      new CustomEvent('object:preview-hide', {detail: {force: true}})
    )
  }

  get _rootHandle() {
    return this._data.find(p => p.gramps_id === this.grampsId)?.handle
  }

  // Toggles a single cut key. Always swaps in a brand-new Set so Lit's
  // default (reference) change detection sees the update and re-renders.
  // Shared by the window-level chart:collapse-toggle listener (desktop tabs
  // and reopen pills) and the mobile bottom-sheet's plain cutKey selections.
  _toggleCut(cutKey) {
    this._forceHidePreview()
    const next = new Set(this._collapsed)
    if (next.has(cutKey)) {
      next.delete(cutKey)
    } else {
      next.add(cutKey)
    }
    this._collapsed = next
  }

  _handleCollapseToggle(e) {
    const cutKey = e.detail?.cutKey
    if (!cutKey) return
    this._toggleCut(cutKey)
  }

  // Opens the mobile bottom-sheet (see GrampsjsCollapseSheet) with the
  // options the chart built for whatever was tapped/long-pressed — see
  // addCollapseAffordances' touch branch in RelationshipChart.js.
  _handleCollapseMenu(e) {
    this._collapseMenuTitle = e.detail?.title ?? ''
    this._collapseMenuItems = e.detail?.options ?? []
    this._collapseMenuOpen = true
  }

  _handleCollapseSheetClose() {
    this._collapseMenuOpen = false
  }

  // Handles a selection from the mobile bottom-sheet. "whole" adds BOTH the
  // spouse and children cuts for the family (not a toggle — this is the
  // sheet's explicit "collapse whole marriage" action, see design §4.4);
  // "reroot" re-centres the chart on the long-pressed person (the sheet's
  // "make home person" item); a plain cutKey reuses the normal toggle.
  _handleCollapseSelect(e) {
    const {cutKey, action, family, spouse, grampsId} = e.detail ?? {}
    if (action === 'whole') {
      this._forceHidePreview()
      const next = new Set(this._collapsed)
      next.add(`spouse:${family}:${spouse}`)
      next.add(`children:${family}`)
      this._collapsed = next
      return
    }
    if (action === 'reroot') {
      if (!grampsId) return
      this._forceHidePreview()
      dispatchEvent(
        new CustomEvent('pedigree:person-selected', {
          bubbles: true,
          composed: true,
          detail: {grampsId},
        })
      )
      return
    }
    if (cutKey) {
      this._toggleCut(cutKey)
    }
  }

  // Presets replace _collapsed wholesale (not merge) — predictable, and
  // matches "Show only direct line" / "Collapse all descendants" reading
  // as an absolute view state rather than an incremental tweak.
  _handleCollapseAllDescendants() {
    const rootHandle = this._rootHandle
    if (!rootHandle) return
    this._forceHidePreview()
    this._collapsed = presetCollapseDescendants(
      this._data,
      rootHandle,
      this.showAllParents
    )
  }

  _handleDirectLineOnly() {
    const rootHandle = this._rootHandle
    if (!rootHandle) return
    this._forceHidePreview()
    this._collapsed = presetDirectLineOnly(
      this._data,
      rootHandle,
      this.showAllParents
    )
  }

  _handleExpandAllCollapsed() {
    this._forceHidePreview()
    this._collapsed = new Set()
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

  // Always-visible corner shortcuts for the three collapse/expand presets,
  // in addition to the same actions already reachable via the settings
  // dialog (see _setCollapsePresets in GrampsjsViewTreeChartBase) — those
  // stay as-is, this is purely additive. Reuses the exact same handlers, so
  // there is no duplicated collapse logic here, only the buttons. Rendered
  // after the maiden-name toggle inside the shared .corner-controls bar (see
  // renderCornerControls in GrampsjsViewTreeChartBase) — no wrapper of its
  // own here anymore.
  renderCollapsePresetButtons() {
    return html`
      <md-icon-button
        id="btn-direct-line-only"
        @click="${this._handleDirectLineOnly}"
      >
        <grampsjs-icon .path="${mdiFamilyTree}"></grampsjs-icon>
      </md-icon-button>
      <grampsjs-tooltip for="btn-direct-line-only" .appState="${this.appState}"
        >${this._('Show only direct line')}</grampsjs-tooltip
      >
      <md-icon-button
        id="btn-collapse-all-descendants"
        @click="${this._handleCollapseAllDescendants}"
      >
        <grampsjs-icon .path="${mdiArrowCollapseVertical}"></grampsjs-icon>
      </md-icon-button>
      <grampsjs-tooltip
        for="btn-collapse-all-descendants"
        .appState="${this.appState}"
        >${this._('Collapse all descendants')}</grampsjs-tooltip
      >
      <md-icon-button
        id="btn-expand-all-collapsed"
        @click="${this._handleExpandAllCollapsed}"
      >
        <grampsjs-icon .path="${mdiArrowExpandVertical}"></grampsjs-icon>
      </md-icon-button>
      <grampsjs-tooltip
        for="btn-expand-all-collapsed"
        .appState="${this.appState}"
        >${this._('Expand all')}</grampsjs-tooltip
      >
    `
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
      <grampsjs-collapse-sheet
        .appState="${this.appState}"
        ?open="${this._collapseMenuOpen}"
        .sheetTitle="${this._collapseMenuTitle}"
        .items="${this._collapseMenuItems}"
        @collapse-select="${this._handleCollapseSelect}"
        @collapse-sheet-close="${this._handleCollapseSheetClose}"
      ></grampsjs-collapse-sheet>
    `
  }
}

window.customElements.define(
  'grampsjs-view-relationship-chart',
  GrampsjsViewRelationshipChart
)
