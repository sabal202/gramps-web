/*
View wrapper for the whole-tree graph explorer tab: fetches the graph export
from `GET /api/analysis/graph/` once when first activated and hands it to
<grampsjs-graph-explorer> (see GrampsjsGraphExplorer.js).
*/

import {css, html} from 'lit'

import {GrampsjsView} from './GrampsjsView.js'
import '../components/GrampsjsGraphExplorer.js'

export class GrampsjsViewGraphExplorer extends GrampsjsView {
  static get styles() {
    return [
      super.styles,
      css`
        :host {
          margin: 0;
        }

        #graph-container {
          height: calc(100dvh - 165px);
          position: relative;
        }
      `,
    ]
  }

  static get properties() {
    return {
      _data: {type: Object},
    }
  }

  constructor() {
    super()
    this._data = null
  }

  renderContent() {
    return html`
      <div id="graph-container">
        ${this._data
          ? html`
              <grampsjs-graph-explorer
                .appState="${this.appState}"
                .data="${this._data}"
              ></grampsjs-graph-explorer>
            `
          : ''}
      </div>
    `
  }

  update(changed) {
    super.update(changed)
    if (changed.has('active') && this.active && !this._data) {
      this._fetchData()
    }
  }

  async _fetchData() {
    this.loading = true
    const data = await this.appState.apiGet('/api/analysis/graph/')
    this.loading = false
    if ('data' in data) {
      this.error = false
      this._data = data.data
    } else if ('error' in data) {
      this.error = true
      this._errorMessage = data.error
    }
  }
}

window.customElements.define(
  'grampsjs-view-graph-explorer',
  GrampsjsViewGraphExplorer
)
