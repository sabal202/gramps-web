/*
Panel for resolving Immich person -> Gramps person mappings.

Two entry points, both persisted the same way (POST /api/immich/mapping/):
  1. A quick list of persons that are unmapped in the photos currently loaded
     for review (passed in via the `persons` property).
  2. A free-text search against the Immich people directory
     (GET /api/immich/people/?query=), for linking ahead of time or finding a
     person that isn't part of the current preview.

Degrades gracefully: if the Immich backend is unavailable, the search simply
reports an error instead of crashing.
*/
import {html, css, LitElement} from 'lit'

import '@material/web/textfield/filled-text-field.js'
import '@material/web/button/text-button.js'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'

import {mdiMagnify, mdiLinkPlus, mdiCheck} from '@mdi/js'

import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent, debounce} from '../util.js'
import './GrampsjsIcon.js'
import './GrampsjsFormSelectObject.js'

export class GrampsjsImmichPeopleMapper extends GrampsjsAppStateMixin(
  LitElement
) {
  static get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
          margin-bottom: 20px;
        }

        .section {
          margin-bottom: 16px;
        }

        .row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        md-filled-text-field {
          width: 100%;
          max-width: 360px;
        }

        .error {
          color: var(--md-sys-color-error, #b3261e);
        }

        grampsjs-form-select-object {
          display: none;
        }
      `,
    ]
  }

  static get properties() {
    return {
      persons: {type: Array},
      _query: {type: String},
      _searchResults: {type: Array},
      _searching: {type: Boolean},
      _searchError: {type: Boolean},
      _linkTarget: {type: Object},
    }
  }

  constructor() {
    super()
    this.persons = []
    this._query = ''
    this._searchResults = []
    this._searching = false
    this._searchError = false
    this._linkTarget = null
  }

  render() {
    return html`
      ${this.persons.length > 0
        ? html`
            <div class="section">
              <h4>${this._('People needing linking')}</h4>
              <md-list>
                ${this.persons.map(p => this._renderPersonItem(p))}
              </md-list>
            </div>
          `
        : ''}

      <div class="section">
        <div class="row">
          <md-filled-text-field
            label="${this._('Search Immich people')}"
            @input="${debounce(e => this._handleSearchInput(e), 400)}"
          >
            <grampsjs-icon
              slot="leading-icon"
              path="${mdiMagnify}"
            ></grampsjs-icon>
          </md-filled-text-field>
        </div>
        ${this._searchError
          ? html`<p class="error">
              ${this._('Could not reach Immich. Please try again later.')}
            </p>`
          : ''}
        ${this._searchResults.length > 0
          ? html`
              <md-list>
                ${this._searchResults.map(p => this._renderPersonItem(p))}
              </md-list>
            `
          : ''}
      </div>

      <grampsjs-form-select-object
        objectType="person"
        hideButton
        .appState="${this.appState}"
        @select-object:changed="${this._handlePersonSelected}"
      ></grampsjs-form-select-object>
    `
  }

  _renderPersonItem(p) {
    const mapped = !!p.grampsHandle
    return html`
      <md-list-item>
        <span slot="headline">${p.name || this._('Unknown')}</span>
        ${mapped
          ? html`<grampsjs-icon slot="end" path="${mdiCheck}"></grampsjs-icon>`
          : html`
              <md-text-button slot="end" @click="${() => this._startLink(p)}">
                <grampsjs-icon
                  slot="icon"
                  path="${mdiLinkPlus}"
                ></grampsjs-icon>
                ${this._('Link')}
              </md-text-button>
            `}
      </md-list-item>
    `
  }

  async _handleSearchInput(e) {
    const query = e.target.value ?? ''
    this._query = query
    if (!query) {
      this._searchResults = []
      this._searchError = false
      return
    }
    this._searching = true
    this._searchError = false
    const result = await this.appState.apiGet(
      `/api/immich/people/?query=${encodeURIComponent(query)}`
    )
    this._searching = false
    if ('data' in result) {
      this._searchResults = Array.isArray(result.data) ? result.data : []
      this._searchError = false
    } else {
      this._searchResults = []
      this._searchError = true
    }
  }

  _startLink(p) {
    this._linkTarget = p
    const picker = this.renderRoot.querySelector('grampsjs-form-select-object')
    picker?.open(p.name || '')
  }

  async _handlePersonSelected(e) {
    if (!this._linkTarget) {
      return
    }
    const [obj] = e.detail.objects
    const grampsHandle = obj.handle ?? obj.object?.handle
    if (!grampsHandle) {
      return
    }
    const {immichPersonId} = this._linkTarget
    const result = await this.appState.apiPost('/api/immich/mapping/', {
      immichPersonId,
      grampsHandle,
    })
    if (!('error' in result)) {
      fireEvent(this, 'immich-mapping:applied', {
        immichPersonId,
        grampsHandle,
      })
      this._searchResults = this._searchResults.map(p =>
        p.immichPersonId === immichPersonId ? {...p, grampsHandle} : p
      )
    }
    this._linkTarget = null
  }
}

window.customElements.define(
  'grampsjs-immich-people-mapper',
  GrampsjsImmichPeopleMapper
)
