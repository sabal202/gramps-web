import {css, html} from 'lit'
import {map} from 'lit/directives/map.js'

import '@material/mwc-textfield'
import '@material/web/dialog/dialog.js'
import '@material/web/button/text-button.js'
import '@material/web/fab/fab.js'
import '@material/web/switch/switch.js'
import '@material/web/iconbutton/icon-button.js'

import {
  mdiAccountDetails,
  mdiHomeAccount,
  mdiHumanFemale,
  mdiPencil,
} from '@mdi/js'
import '../components/GrampsjsIcon.js'
import {GrampsjsView} from './GrampsjsView.js'
import {GrampsjsStaleDataMixin} from '../mixins/GrampsjsStaleDataMixin.js'
import '../components/GrampsjsTooltip.js'

import {chartNameDisplayFormat, fireEvent} from '../util.js'
import {renderIcon} from '../icons.js'

export class GrampsjsViewTreeChartBase extends GrampsjsStaleDataMixin(
  GrampsjsView
) {
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          margin: 0;
          margin-top: -4px;
          margin-bottom: -25px;
        }

        #controls {
          position: absolute;
          background-color: var(--md-sys-color-surface-container-low);
          border-radius: 16px;
          z-index: 1;
          padding: 0 10px;
        }

        #chart {
          height: calc(100dvh - 165px);
          margin-left: -40px;
          margin-right: -40px;
          margin-bottom: -25px;
        }

        #controls mwc-icon-button {
          color: var(--grampsjs-body-font-color-35);
          --mdc-icon-size: 26px;
          --mdc-theme-text-disabled-on-light: var(
            --grampsjs-body-font-color-10
          );
        }

        /* Always-visible top-right corner bar: the maiden-name toggle
           (all chart views) followed by any collapse/expand preset buttons
           (relationship chart only, see renderCollapsePresetButtons). Mirrors
           the top-left #controls bar's look, moved to the opposite corner so
           it doesn't collide with the home/back/person/settings buttons. */
        .corner-controls {
          position: absolute;
          top: 0;
          right: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          background-color: var(--md-sys-color-surface-container-low);
          border-radius: 16px;
          padding: 0 4px;
        }

        #menu-controls mwc-textfield {
          width: 6em;
        }

        md-fab {
          position: fixed;
          bottom: calc(32px + env(safe-area-inset-bottom));
          right: calc(32px + env(safe-area-inset-right));
        }
      `,
    ]
  }

  static get properties() {
    return {
      grampsId: {type: String},
      disableBack: {type: Boolean},
      disableHome: {type: Boolean},
      nAnc: {type: Number},
      nDesc: {type: Number},
      nMaxImages: {type: Number},
      nameDisplayFormat: {type: String},
      showUnionDates: {type: Boolean},
      showAllParents: {type: Boolean},
      showNonBirthChildren: {type: Boolean},
      showMaidenName: {type: Boolean},
      _data: {type: Array},
      _setAnc: {type: Boolean},
      _setDesc: {type: Boolean},
      _setMaxImages: {type: Boolean},
      _setShowUnionDates: {type: Boolean},
      _setShowAllParents: {type: Boolean},
      _setShowNonBirthChildren: {type: Boolean},
      // Gates the collapse/expand preset buttons below — only the
      // relationship chart (which supports collapse/expand) sets this true.
      _setCollapsePresets: {type: Boolean},
      _editMode: {type: Boolean},
    }
  }

  defaults = {
    nAnc: 10,
    nDesc: 10,
    nMaxImages: 400,
    nameDisplayFormat: chartNameDisplayFormat.surnameThenGivenPatronymic,
    showNonBirthChildren: false,
    showMaidenName: false,
  }

  constructor() {
    super()
    this.grampsId = ''
    this.disableBack = false
    this.disableHome = false
    this._data = []
    this._setAnc = false
    this._setDesc = false
    this._setSep = false
    this._setMaxImages = false
    this._setShowUnionDates = false
    this._setShowAllParents = false
    this._setShowNonBirthChildren = false
    this._setCollapsePresets = false
    this._editMode = false
    this._boundToggleEditMode = this._toggleEditMode.bind(this)
    this._boundDisableEditMode = this._disableEditMode.bind(this)
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('edit-mode:toggle', this._boundToggleEditMode)
    window.addEventListener('edit-mode:off', this._boundDisableEditMode)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('edit-mode:toggle', this._boundToggleEditMode)
    window.removeEventListener('edit-mode:off', this._boundDisableEditMode)
  }

  get nAnc() {
    return this.defaults.nAnc
  }

  get nDesc() {
    return this.defaults.nDesc
  }

  get nMaxImages() {
    return this.defaults.nMaxImages
  }

  get nameDisplayFormat() {
    return this.defaults.nameDisplayFormat
  }

  get showUnionDates() {
    return false
  }

  // Neutral stub; GrampsjsViewRelationshipChart provides the real getter/setter
  // and the ON default via defaults. A subclass that shows this toggle
  // (_setShowAllParents = true) must also define `set showAllParents(value)`,
  // otherwise _handleChangeShowAllParents below silently swallows the input.
  get showAllParents() {
    return false
  }

  // Shared across all descendant-showing tree charts (descendant + hourglass):
  // one coherent "show non-birth children" preference rather than per-chart toggles.
  get showNonBirthChildren() {
    return (
      this.appState?.settings?.treeChartShowNonBirthChildren ??
      this.defaults.showNonBirthChildren
    )
  }

  set showNonBirthChildren(value) {
    this.appState.updateSettings({treeChartShowNonBirthChildren: value}, false)
  }

  // Shared across all chart types (relationship/tree/hourglass/fan): whether
  // to show a woman's maiden name in parentheses after her current surname.
  get showMaidenName() {
    return (
      this.appState?.settings?.chartShowMaidenName ??
      this.defaults.showMaidenName
    )
  }

  set showMaidenName(value) {
    this.appState.updateSettings({chartShowMaidenName: value}, false)
  }

  // Person-profile fetch level. The default avoids requesting family profiles;
  // subclasses that render family data (e.g. the relationship chart's union
  // status) override this to 'self,families'.
  get _profileParam() {
    return 'self'
  }

  // Extend list for the people API call. Subclasses may add extra keys.
  get _extendParam() {
    return 'event_ref_list,primary_parent_family,family_list'
  }

  renderContent() {
    return html`<div style="position: relative;">
        <div id="controls">${this.renderControls()}</div>
        ${this.renderCornerControls()}
        <div id="chart">${this.renderChart()}</div>
      </div>
      ${this.appState.permissions.canEdit && !this._editMode
        ? this.renderFab()
        : ''}`
  }

  // Always-visible top-right corner bar. Leftmost is the maiden-name toggle,
  // shared by ALL chart views (it drives the same showMaidenName flag as the
  // settings-dialog switch above); anything after it is chart-specific preset
  // buttons, see renderCollapsePresetButtons (a no-op here, overridden only by
  // GrampsjsViewRelationshipChart). Rendered as a sibling of #controls/#chart
  // (inside the shared position:relative wrapper) so its own absolute
  // positioning is relative to the whole chart area, not just the top-left
  // #controls button row.
  renderCornerControls() {
    return html`
      <div class="corner-controls">
        <md-icon-button
          toggle
          id="btn-maiden-name"
          ?selected=${this.showMaidenName}
          @input=${this._handleChangeShowMaidenName}
        >
          <grampsjs-icon .path="${mdiHumanFemale}"></grampsjs-icon>
        </md-icon-button>
        <grampsjs-tooltip for="btn-maiden-name" .appState="${this.appState}"
          >${this._('Show maiden name')}</grampsjs-tooltip
        >
        ${this.renderCollapsePresetButtons()}
      </div>
    `
  }

  // Neutral no-op; only GrampsjsViewRelationshipChart (the one subclass with
  // _setCollapsePresets = true) overrides this with the collapse/expand
  // preset buttons, rendered after the maiden-name toggle inside the shared
  // .corner-controls bar built by renderCornerControls above.
  // eslint-disable-next-line class-methods-use-this
  renderCollapsePresetButtons() {
    return ''
  }

  renderFab() {
    return html`
      <md-fab variant="secondary" @click="${this._enableEditMode}">
        <grampsjs-icon
          slot="icon"
          .path="${mdiPencil}"
          color="var(--mdc-theme-on-secondary)"
        ></grampsjs-icon>
      </md-fab>
    `
  }

  _enableEditMode() {
    this._editMode = true
    fireEvent(this, 'edit-mode:on', {
      title: this._('Edit'),
      hideDeleteButton: true,
    })
  }

  _disableEditMode() {
    this._editMode = false
  }

  _handleAddPersonRelation(e) {
    const personData = this._data.find(p => p.handle === e.detail.handle)
    if (!personData) {
      return
    }
    const addPersonEl = this.renderRoot.querySelector(
      'grampsjs-tree-chart-add-person'
    )
    if (addPersonEl) {
      addPersonEl.open(personData)
    }
  }

  _toggleEditMode() {
    if (!this.active || !this.appState.permissions.canEdit) {
      return
    }
    if (this._editMode) {
      this._disableEditMode()
      fireEvent(this, 'edit-mode:off', {})
    } else {
      this._enableEditMode()
    }
  }

  renderControls() {
    return html`
        <mwc-icon-button
          @click=${this._backToHomePerson}
          style="margin-bottom:-10px;"
          ?disabled=${this.disableHome}
          id="button-home"
        >${renderIcon(
          mdiHomeAccount,
          this.disableHome ? 'var(--mdc-theme-text-disabled-on-light)' : ''
        )}</mwc-icon-button>
        <grampsjs-tooltip
          for="button-home"
          .appState="${this.appState}"
        >${this._('Home Person')}</grampsjs-tooltip>
        <mwc-icon-button
          icon="arrow_back"
          @click=${this._handleBack}
          ?disabled=${this.disableBack}
          style="margin-bottom:-10px;"
          id="btn-back"
        ></mwc-icon-button>
        <grampsjs-tooltip
          for="btn-back"
          .appState="${this.appState}"
        >${this._('_Back')}</grampsjs-tooltip>
        <mwc-icon-button
          @click=${this._goToPerson}
          id="btn-person"
        >${renderIcon(mdiAccountDetails)}</mwc-icon-button>
        <grampsjs-tooltip
          for="btn-person"
          .appState="${this.appState}"
        >${this._('Person Details')}</grampsjs-tooltip>
        <mwc-icon-button
          icon="settings"
          id="btn-controls"
          @click=${this._openMenuControls}
        ></mwc-icon-button>
        <grampsjs-tooltip
          for="btn-controls"
          .appState="${this.appState}"
        >${this._('Preferences')}</grampsjs-tooltip>
    <md-dialog id="menu-controls">
          <div slot="content">
            <table>
            ${
              this._setAnc
                ? html` <tr>
                    <td>${this._('Max Ancestor Generations')}</td>
                    <td>
                      <mwc-textfield
                        value=${this.nAnc}
                        type="number"
                        min="1"
                        @change=${this._handleChangeAnc}
                      ></mwc-textfield>
                    </td>
                  </tr>`
                : ''
            }${
      this._setDesc
        ? html`
            <tr>
              <td>${this._('Max Descendant Generations')}</td>
              <td>
                <mwc-textfield
                  value=${this.nDesc}
                  type="number"
                  min="0"
                  @change=${this._handleChangeDesc}
                ></mwc-textfield>
              </td>
            </tr>
          `
        : ''
    }${
      this._setSep
        ? html`
            <tr>
              <td>${this._('Max Degree of Separation')}</td>
              <td>
                <mwc-textfield
                  value=${this.nAnc}
                  type="number"
                  min="0"
                  @change=${this._handleChangeAnc}
                ></mwc-textfield>
              </td>
            </tr>
          `
        : ''
    }${
      this._setMaxImages
        ? html`
            <tr>
              <td>${this._('Max Number of Images displayed')}</td>
              <td>
                <mwc-textfield
                  value=${this.nMaxImages}
                  type="number"
                  min="0"
                  size="5"
                  @change=${this._handleChangeMaxImages}
                ></mwc-textfield>
              </td>
            </tr>
          `
        : ''
    }
              <tr>
                <td>${this._('Name Display Format')}</td>
                <td>
                    <mwc-select
                      fixedMenuPosition
                      id="name-display-format"
                      @change=${this._handleChangeNameDisplayFormat}
                    >
                      ${map(
                        Object.values(chartNameDisplayFormat),
                        i => html` <mwc-list-item
                          value="${i}"
                          ?selected="${i === this.nameDisplayFormat}"
                          >${this._(i)}</mwc-list-item
                        >`
                      )}
                    </mwc-select>
                </td>
              </tr>
              <tr>
                <td>${this._('Show maiden name')}</td>
                <td>
                  <md-switch
                    aria-label=${this._('Show maiden name')}
                    ?selected=${this.showMaidenName}
                    @change=${this._handleChangeShowMaidenName}
                  ></md-switch>
                </td>
              </tr>
              ${
                this._setShowUnionDates
                  ? html`
                      <tr>
                        <td>${this._('Show union dates')}</td>
                        <td>
                          <md-switch
                            aria-label=${this._('Show union dates')}
                            ?selected=${this.showUnionDates}
                            @change=${this._handleChangeShowUnionDates}
                          ></md-switch>
                        </td>
                      </tr>
                    `
                  : ''
              }
              ${
                this._setShowAllParents
                  ? html`
                      <tr>
                        <td>${this._('Show all parent families')}</td>
                        <td>
                          <md-switch
                            aria-label=${this._('Show all parent families')}
                            ?selected=${this.showAllParents}
                            @change=${this._handleChangeShowAllParents}
                          ></md-switch>
                        </td>
                      </tr>
                    `
                  : ''
              }
              ${
                this._setShowNonBirthChildren
                  ? html`
                      <tr>
                        <td>${this._('Show non-birth children')}</td>
                        <td>
                          <md-switch
                            aria-label=${this._('Show non-birth children')}
                            ?selected=${this.showNonBirthChildren}
                            @change=${this._handleChangeShowNonBirthChildren}
                          ></md-switch>
                        </td>
                      </tr>
                    `
                  : ''
              }
              ${
                this._setCollapsePresets
                  ? html`
                      <tr>
                        <td>${this._('Collapse/expand branches')}</td>
                        <td>
                          <md-text-button
                            @click="${this._handleCollapseAllDescendants}"
                            >${this._(
                              'Collapse all descendants'
                            )}</md-text-button
                          >
                          <md-text-button @click="${this._handleDirectLineOnly}"
                            >${this._('Show only direct line')}</md-text-button
                          >
                          <md-text-button
                            @click="${this._handleExpandAllCollapsed}"
                            >${this._('Expand all')}</md-text-button
                          >
                        </td>
                      </tr>
                    `
                  : ''
              }
            </table>
          </div>
          <div slot="actions">
            <md-text-button @click="${this._resetLevels}"
              >${this._('Reset')}</md-text-button
            >
            <md-text-button @click="${this._closeMenuControls}"
              >${this._('Close')}</md-text-button
            >
          </div>
        </md-dialog>
      </div>

    `
  }

  // The three methods below are no-ops in the base class; only
  // GrampsjsViewRelationshipChart (the one subclass with
  // _setCollapsePresets = true) overrides them, so the buttons above never
  // render for the other tree-chart views in the first place.
  // eslint-disable-next-line class-methods-use-this
  _handleCollapseAllDescendants() {}

  // eslint-disable-next-line class-methods-use-this
  _handleDirectLineOnly() {}

  // eslint-disable-next-line class-methods-use-this
  _handleExpandAllCollapsed() {}

  // eslint-disable-next-line class-methods-use-this
  renderChart() {
    return ''
  }

  _backToHomePerson() {
    fireEvent(this, 'tree:home')
  }

  _prevPerson() {
    fireEvent(this, 'tree:back')
  }

  update(changed) {
    super.update(changed)
    if (changed.has('grampsId') || changed.has('settings')) {
      this._fetchData(this.grampsId)
    }
  }

  handleUpdateStaleData() {
    this._fetchData(this.grampsId)
  }

  // eslint-disable-next-line class-methods-use-this
  _resetLevels() {}

  _getPersonRules(grampsId) {
    return {
      function: 'or',
      rules: [
        {
          name: 'IsLessThanNthGenerationAncestorOf',
          values: [grampsId, this.nAnc + 1],
        },
        {
          name: 'IsLessThanNthGenerationDescendantOf',
          values: [grampsId, this.nDesc + 1],
        },
      ],
    }
  }

  async _fetchData(grampsId) {
    this.loading = true
    const rules = this._getPersonRules(grampsId)
    const data = await this.appState.apiGet(
      `/api/people/?rules=${encodeURIComponent(JSON.stringify(rules))}&locale=${
        this.appState.i18n.lang || 'en'
      }&profile=${this._profileParam}&extend=${this._extendParam}`
    )
    this.loading = false
    if ('data' in data) {
      this.error = false
      this._data = data.data
    } else if ('error' in data) {
      this.error = true
      this._errorMessage = data.error
    }
  }

  _goToPerson() {
    fireEvent(this, 'tree:person')
  }

  _handleBack() {
    fireEvent(this, 'tree:back')
  }

  _handleChangeAnc(e) {
    this.nAnc = parseInt(e.target.value, 10)
  }

  _handleChangeDesc(e) {
    this.nDesc = parseInt(e.target.value, 10)
  }

  _handleChangeMaxImages(e) {
    this.nMaxImages = parseInt(e.target.value, 10)
  }

  _handleChangeNameDisplayFormat(e) {
    this.nameDisplayFormat = e.target.value
  }

  _handleChangeShowUnionDates(e) {
    this.showUnionDates = e.target.selected
  }

  _handleChangeShowAllParents(e) {
    this.showAllParents = e.target.selected
  }

  _handleChangeShowNonBirthChildren(e) {
    this.showNonBirthChildren = e.target.selected
  }

  _handleChangeShowMaidenName(e) {
    this.showMaidenName = e.target.selected
  }

  _openMenuControls() {
    this.shadowRoot.getElementById('menu-controls').show()
  }

  _closeMenuControls() {
    this.shadowRoot.getElementById('menu-controls').close()
  }
}
