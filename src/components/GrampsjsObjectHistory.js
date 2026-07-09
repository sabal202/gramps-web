/*
Per-object "Changes" section: a collapsible list of the transactions that
touched a given object (and, optionally, the other objects rendered inline
on its page - e.g. a Person's own events and families). Shares its row
rendering with the global Revision History page via
`renderRevisionListItem` (GrampsjsRevisionListItem.js).

Fetches lazily: nothing is requested from the API until the section is
first expanded. See GrampsjsObject.js for how this is wired into the 9
object views (Person/Family/Event/Place/Source/Citation/Repository/Note/
Media) as one more tab, using each type's `_objectEndpoint` as the API
namespace.

Note: the surrounding tab already renders an `<h3>` "Changes" heading (the
same wrapper all other tabs - Events, Notes, Gallery, ... - get from
GrampsjsObject.renderSections), so this component does not render its own
top-level heading. It renders a "Show changes" / "Hide changes" toggle row
instead, which both discloses the section and is the fetch-on-first-expand
trigger.
*/
import {html, css} from 'lit'
import {mdiChevronDown, mdiChevronUp} from '@mdi/js'

import '@material/web/list/list.js'
import '@material/web/divider/divider.js'
import '@material/web/chips/filter-chip.js'
import '@material/web/progress/circular-progress.js'

import {GrampsjsConnectedComponent} from './GrampsjsConnectedComponent.js'
import {renderRevisionListItem} from './GrampsjsRevisionListItem.js'
import './GrampsjsIcon.js'
import './GrampsjsPagination.js'
import {clickKeyHandler} from '../util.js'

export class GrampsjsObjectHistory extends GrampsjsConnectedComponent {
  static get styles() {
    return [
      super.styles,
      css`
        .history-toggle {
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          user-select: none;
          color: var(--grampsjs-body-font-color-60);
          font-size: 14px;
          padding: 4px 0;
        }

        .history-toggle grampsjs-icon {
          flex: 0 0 auto;
        }

        .history-scope {
          display: flex;
          gap: 6px;
          margin: 4px 0 12px;
        }

        .history-loading {
          display: flex;
          justify-content: center;
          padding: 24px 0;
        }

        md-divider {
          --md-divider-thickness: 1px;
          --md-divider-color: var(--grampsjs-body-font-color-10);
        }

        p.history-empty {
          color: var(--grampsjs-body-font-color-50);
        }
      `,
    ]
  }

  static get properties() {
    return {
      ...super.properties,
      namespace: {type: String},
      handle: {type: String},
      _scope: {type: String},
      _page: {type: Number},
      _pages: {type: Number},
      _pageSize: {type: Number},
      _totalCount: {type: Number},
      _expanded: {type: Boolean},
      _fetchError: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.namespace = ''
    this.handle = ''
    this._data = []
    this._scope = 'page'
    this._page = 1
    this._pages = -1
    this._pageSize = 10
    this._totalCount = 0
    this._expanded = false
    this._fetched = false
    // Deliberately not reusing the inherited `error`/`_errorMessage`
    // properties: GrampsjsConnectedComponent.updated() fires a global
    // 'grampsjs:error' event (a visible toast) whenever `error` becomes
    // true. A missing /history/ endpoint on an older backend, or any other
    // fetch failure here, should degrade silently (see _renderList) rather
    // than surface a toast for this optional section.
    this._fetchError = false
  }

  // The base class's getUrl()-driven auto-fetch (GrampsjsConnectedComponent
  // ._updateData) discards the `total_count` field we need for pagination,
  // and would fetch eagerly as soon as namespace/handle are set. This
  // section needs both lazy (fetch-on-first-expand) and total_count-aware
  // fetching, so it fetches explicitly via _fetchData() instead; getUrl()
  // is left returning '' so the inherited auto-fetch path stays inert.
  // eslint-disable-next-line class-methods-use-this
  getUrl() {
    return ''
  }

  render() {
    if (!this.appState?.permissions?.canEdit) {
      return html``
    }
    if (!this.namespace || !this.handle) {
      return html``
    }
    return html`
      <div
        class="history-toggle"
        tabindex="0"
        role="button"
        @click="${this._toggleExpanded}"
        @keydown="${clickKeyHandler}"
      >
        <grampsjs-icon
          path="${this._expanded ? mdiChevronUp : mdiChevronDown}"
          color="var(--grampsjs-body-font-color-40)"
          height="18"
          width="18"
        ></grampsjs-icon>
        <span
          >${this._expanded
            ? this._('Hide changes')
            : this._('Show changes')}</span
        >
      </div>
      ${this._expanded ? this._renderBody() : ''}
    `
  }

  _renderBody() {
    return html`
      <div class="history-scope">
        <md-filter-chip
          label="${this._('This object')}"
          ?selected="${this._scope === 'object'}"
          @click="${() => this._setScope('object')}"
        ></md-filter-chip>
        <md-filter-chip
          label="${this._('Whole page')}"
          ?selected="${this._scope === 'page'}"
          @click="${() => this._setScope('page')}"
        ></md-filter-chip>
      </div>
      ${this.loading
        ? html`<div class="history-loading">
            <md-circular-progress indeterminate></md-circular-progress>
          </div>`
        : this._renderList()}
    `
  }

  _renderList() {
    if (this._fetchError) {
      // Graceful degradation: an older backend without the /history/
      // endpoint (404) or any other fetch error simply shows no list,
      // rather than crashing the object page.
      return html``
    }
    if (!this._data?.length) {
      return html`<p class="history-empty">${this._('No changes found')}</p>`
    }
    return html`
      <md-list>
        <md-divider></md-divider>
        ${this._data.map(txn =>
          renderRevisionListItem({
            transaction: txn,
            appState: this.appState,
            highlightHandles: txn?.matched_handles,
          })
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

  _toggleExpanded() {
    this._expanded = !this._expanded
    if (this._expanded && !this._fetched) {
      this._fetched = true
      this._fetchData()
    }
  }

  _setScope(scope) {
    if (scope === this._scope) {
      return
    }
    this._scope = scope
    this._page = 1
    if (this._expanded) {
      this._fetchData()
    }
  }

  _handlePageChanged(event) {
    this._page = event.detail.page
    this._fetchData()
  }

  async _fetchData() {
    if (!this.namespace || !this.handle) {
      return
    }
    this.loading = true
    const url = `/api/${this.namespace}/${this.handle}/history/?scope=${this._scope}&sort=-id&page=${this._page}&pagesize=${this._pageSize}`
    const data = await this.appState.apiGet(url)
    this.loading = false
    if ('data' in data) {
      this._fetchError = false
      this._data = data.data
      this._totalCount = data.total_count
      this._pages = Math.ceil(this._totalCount / this._pageSize)
    } else if ('error' in data) {
      this._fetchError = true
    }
  }

  handleUpdateStaleData() {
    // Only refetch once the user has actually opened the section - while
    // collapsed there is nothing on screen to go stale, and the next
    // expand will fetch fresh data anyway.
    if (this._expanded) {
      this._fetchData()
    }
  }
}

window.customElements.define('grampsjs-object-history', GrampsjsObjectHistory)
