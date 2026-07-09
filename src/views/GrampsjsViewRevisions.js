import {css, html} from 'lit'

import '@material/web/list/list'
import '@material/web/list/list-item'

import '../components/GrampsjsPagination.js'
import '../components/GrampsjsTimedelta.js'
import '../components/GrampsjsIcon.js'
import {renderRevisionListItem} from '../components/GrampsjsRevisionListItem.js'

import {GrampsjsView} from './GrampsjsView.js'
import {GrampsjsStaleDataMixin} from '../mixins/GrampsjsStaleDataMixin.js'

export class GrampsjsViewRevisions extends GrampsjsStaleDataMixin(
  GrampsjsView
) {
  static get styles() {
    return [
      super.styles,
      css`
        md-list-item[type='text'] {
          --md-list-item-label-text-color: var(--grampsjs-body-font-color-48);
        }

        grampsjs-icon[slot='end'] {
          height: 22px;
          width: 22px;
          opacity: 0.9;
        }

        md-divider {
          --md-divider-thickness: 1px;
          --md-divider-color: var(--grampsjs-body-font-color-10);
        }

        .counter {
          position: relative;
          color: var(--grampsjs-color-icon);
          font-size: 11px;
          min-width: 14px;
          height: 14px;
          line-height: 16px;
          left: -17px;
          top: -6px;
          font-weight: 600;
          background-color: var(--grampsjs-color-icon-background);
          border-radius: 100px;
          display: inline-block;
          text-align: center;
          vertical-align: middle;
        }
      `,
    ]
  }

  static get properties() {
    return {
      _data: {type: Array},
      _page: {type: Number},
      _pages: {type: Number},
      _pageSize: {type: Number},
    }
  }

  constructor() {
    super()
    this._data = []
    this._page = 1
    this._pages = -1
    this._pageSize = 20
  }

  render() {
    return html`
      <h2>${this._('Revision History')}</h2>

      <md-list>
        <md-divider></md-divider>
        ${this._data.map(txn =>
          renderRevisionListItem({transaction: txn, appState: this.appState})
        )}
      </md-list>

      <grampsjs-pagination
        page="${this._page}"
        pages="${this._pages}"
        @page:changed="${this._handlePageChanged}"
        .appState="${this.appState}"
      ></grampsjs-pagination>
    `
  }

  async _fetchData() {
    this.loading = true
    const url = `/api/transactions/history/?sort=-id&page=${this._page}&pagesize=${this._pageSize}`
    const data = await this.appState.apiGet(url)
    this.loading = false
    if ('data' in data) {
      this.error = false
      this._data = data.data
      this._totalCount = data.total_count
      this._pages = Math.ceil(this._totalCount / this._pageSize)
    } else if ('error' in data) {
      this.error = true
      this._errorMessage = data.error
    }
  }

  _handlePageChanged(event) {
    this._page = event.detail.page
  }

  firstUpdated() {
    this._fetchData()
  }

  handleUpdateStaleData() {
    this._fetchData()
  }

  update(changed) {
    super.update(changed)
    if (changed.has('_page') && changed._page !== this._page) {
      this._fetchData()
    }
  }
}

window.customElements.define('grampsjs-view-revisions', GrampsjsViewRevisions)
