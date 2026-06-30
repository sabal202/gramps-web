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
    if (this.active && changed.has('pageId')) {
      this._fetchData()
    }
  }

  handleUpdateStaleData() {
    this._fetchData()
  }

  async _fetchData() {
    if (!this.active) return
    this.loading = true
    this.error = false
    const url = this.pageId
      ? `/api/relatives/?handle=${encodeURIComponent(this.pageId)}`
      : '/api/relatives/'
    const result = await this.appState.apiGet(url)
    if ('data' in result) {
      this._data = result.data
      this.error = false
    } else if ('error' in result) {
      this.error = true
      this._errorMessage = result.error
    }
    this.loading = false
  }
}

window.customElements.define('grampsjs-view-relatives', GrampsjsViewRelatives)
