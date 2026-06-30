import {html} from 'lit'

import {GrampsjsView} from './GrampsjsView.js'
import '../components/GrampsjsRelatives.js'

export class GrampsjsViewRelatives extends GrampsjsView {
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
    this._firstLoaded = false
  }

  renderContent() {
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
        ?loading="${this.loading}"
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
    if (
      changed.has('active') &&
      this.active &&
      !this.loading &&
      !this._firstLoaded
    ) {
      this._fetchData()
    }
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
    this._firstLoaded = true
  }
}

window.customElements.define('grampsjs-view-relatives', GrampsjsViewRelatives)
