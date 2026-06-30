import {html} from 'lit'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'

import {GrampsjsView} from './GrampsjsView.js'
import {GrampsjsStaleDataMixin} from '../mixins/GrampsjsStaleDataMixin.js'
import '../components/GrampsjsRelatives.js'

export class GrampsjsViewRelatives extends GrampsjsStaleDataMixin(
  GrampsjsView
) {
  static get properties() {
    return {
      pageId: {type: String},
      _data: {type: Object},
    }
  }

  constructor() {
    super()
    this.pageId = ''
    this._data = null
    this._boundSettingsChanged = this._onSettingsChanged.bind(this)
  }

  /**
   * Resolve the anchor handle/gramps_id to use for the relatives fetch.
   * Precedence: explicit pageId > settings.homePerson > none.
   *
   * @returns {string}  gramps_id or handle, or '' when none is set
   */
  _resolveAnchor() {
    return this.pageId || this.appState?.settings?.homePerson || ''
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('settings:changed', this._boundSettingsChanged)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    window.removeEventListener('settings:changed', this._boundSettingsChanged)
  }

  /**
   * Re-fetch when the home person changes and no explicit pageId is set.
   */
  _onSettingsChanged() {
    if (!this.pageId) {
      this._fetchData()
    }
  }

  renderContent() {
    if (this.loading) {
      return html`
        <h2>${this._('Relatives')}</h2>
        <md-list>
          ${Array(3).fill(
            html`
              <md-list-item type="button" noninteractive>
                <span slot="headline" class="skeleton" style="width:14em;"
                  >&nbsp;</span
                >
                <span slot="supporting-text" class="skeleton" style="width:9em;"
                  >&nbsp;</span
                >
                <span slot="start" class="skeleton avatar">&nbsp;</span>
              </md-list-item>
            `
          )}
        </md-list>
      `
    }

    // Show guidance when no anchor is resolvable (no pageId, no homePerson)
    if (!this._resolveAnchor() || (this.error && !this._data)) {
      return html`
        <h2>${this._('Relatives')}</h2>
        <p>${this._('Set a home person to see relatives')}</p>
      `
    }

    const anchor = this._data?.anchor ?? null
    const groups = this._data?.groups ?? []
    const anchorName = anchor
      ? `${anchor.name_given || ''} ${anchor.name_surname || ''}`.trim()
      : ''
    const heading = anchorName
      ? `${this._('Relatives')}: ${anchorName}`
      : this._('Relatives')

    return html`
      <h2>${heading}</h2>
      <grampsjs-relatives
        .groups="${groups}"
        .anchor="${anchor}"
        ?error="${this.error}"
        .appState="${this.appState}"
      ></grampsjs-relatives>
    `
  }

  firstUpdated() {
    super.firstUpdated()
    this._fetchData()
  }

  update(changed) {
    super.update(changed)
    // Guard: only refetch on a genuine anchor change (old value defined),
    // not on the initial update where pageId appears in changedProperties with
    // oldValue=undefined even though nothing actually changed.  The initial
    // fetch is owned by firstUpdated().
    if (
      this.active &&
      changed.has('pageId') &&
      changed.get('pageId') !== undefined
    ) {
      this._fetchData()
    }
  }

  handleUpdateStaleData() {
    this._fetchData()
  }

  async _fetchData() {
    if (!this.active) return
    const anchor = this._resolveAnchor()
    // No anchor → show guidance state without fetching (avoids backend 400)
    if (!anchor) {
      this.loading = false
      this.error = false
      this._data = null
      return
    }
    this.loading = true
    this.error = false
    const url = `/api/relatives/?handle=${encodeURIComponent(anchor)}`
    const result = await this.appState.apiGet(url)
    if ('data' in result) {
      this._data = result.data
      this.error = false
    } else if ('error' in result) {
      // On backend error (e.g. 400 / 404) show the guidance state
      this.error = true
      this._data = null
      this._errorMessage = result.error
    }
    this.loading = false
  }
}

window.customElements.define('grampsjs-view-relatives', GrampsjsViewRelatives)
