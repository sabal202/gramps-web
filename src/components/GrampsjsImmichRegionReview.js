/*
Review row for a single Immich-import candidate photo: shows the photo with
its proposed face regions drawn on top (reusing the same
grampsjs-rect-container / grampsjs-rect building blocks the manual
face-tagging UI uses), and lets the curator:
  - delete any region ("this face shouldn't get a box")
  - redraw a region by hand (draw a new rectangle to replace the proposed one)
  - request linking an unmapped Immich person to a Gramps person
  - (Flow B only) toggle "import without faces" for this photo

This component is presentation-only: it never calls the API or mutates the
review state itself. It reports intent via events; the parent view (which
owns the review-state array, see src/util/immichImport.js) applies the
change and re-renders.
*/
import {html, css, LitElement} from 'lit'

import '@material/web/switch/switch.js'
import '@material/web/iconbutton/icon-button.js'
import {mdiDelete, mdiSelectDrag, mdiAccountQuestion} from '@mdi/js'

import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import {getImmichAssetUrl} from '../api.js'
import {countActiveRegions} from '../util/immichImport.js'
import './GrampsjsRectContainer.js'
import './GrampsjsRect.js'
import './GrampsjsImg.js'
import './GrampsjsIcon.js'

export class GrampsjsImmichRegionReview extends GrampsjsAppStateMixin(
  LitElement
) {
  static get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
          border: 1px solid var(--grampsjs-body-font-color-10, #ddd);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .row {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
        }

        .photo {
          flex-shrink: 0;
        }

        .photo img {
          display: block;
          max-width: 320px;
          max-height: 320px;
          border-radius: 6px;
        }

        grampsjs-rect-container {
          display: inline-block;
        }

        .people {
          flex: 1;
          min-width: 220px;
        }

        .person-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
        }

        .person-name {
          flex: 1;
        }

        .unmapped {
          color: var(--md-sys-color-error, #b3261e);
        }

        .badge {
          display: inline-block;
          font-size: 0.75em;
          padding: 2px 8px;
          border-radius: 8px;
          background: var(--grampsjs-color-shade-230, #eee);
          margin-left: 8px;
        }

        .attach-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      item: {type: Object},
      flow: {type: String},
      _drawingPersonId: {type: String},
    }
  }

  constructor() {
    super()
    this.item = null
    this.flow = 'album'
    this._drawingPersonId = ''
  }

  render() {
    if (!this.item) {
      return ''
    }
    const activeCount = countActiveRegions(this.item)
    return html`
      <div class="row">
        <div class="photo">${this._renderPhoto()}</div>
        <div class="people">
          ${this.flow === 'album' && this.item.alreadyImported
            ? html`<span class="badge">${this._('Already imported')}</span>`
            : ''}
          ${this.item.people.length === 0
            ? html`<p>${this._('No faces detected')}</p>`
            : this.item.people.map(p => this._renderPersonRow(p))}
          ${this.flow === 'album' ? this._renderAttachToggle() : ''}
          ${activeCount === 0 && this.item.people.length > 0
            ? html`<p><em>${this._('No regions will be added')}</em></p>`
            : ''}
        </div>
      </div>
    `
  }

  _renderPhoto() {
    const drawing = !!this._drawingPersonId
    return html`
      <grampsjs-rect-container
        ?draw="${drawing}"
        @rect:draw="${this._handleRectDraw}"
      >
        <span slot="image">${this._renderImg()}</span>
        ${drawing
          ? ''
          : this.item.people
              .filter(p => !p.removed)
              .map(
                p => html`
                  <grampsjs-rect
                    .rect="${p.rect || []}"
                    label="${p.name || '?'}"
                  ></grampsjs-rect>
                `
              )}
      </grampsjs-rect-container>
    `
  }

  _renderImg() {
    if (this.item.mediaHandle) {
      return html`<grampsjs-img
        handle="${this.item.mediaHandle}"
        size="400"
        border
        .appState="${this.appState}"
      ></grampsjs-img>`
    }
    if (this.item.thumbnailUrl) {
      return html`<img
        src="${getImmichAssetUrl(this.item.thumbnailUrl)}"
        alt=""
      />`
    }
    return ''
  }

  _renderPersonRow(p) {
    const isUnmapped = !p.grampsHandle
    return html`
      <div class="person-row">
        <span class="person-name ${isUnmapped ? 'unmapped' : ''}"
          >${p.name || this._('Unknown')}
          ${p.removed
            ? html`<span class="badge">${this._('Removed')}</span>`
            : ''}
          ${!p.removed && this.flow === 'existing' && p.alreadyHasRegion
            ? html`<span class="badge">${this._('Has region')}</span>`
            : ''}
        </span>
        ${isUnmapped
          ? html`
              <md-icon-button
                aria-label="${this._('Link to Gramps person')}"
                @click="${() => this._requestLink(p)}"
              >
                <grampsjs-icon path="${mdiAccountQuestion}"></grampsjs-icon>
              </md-icon-button>
            `
          : ''}
        <md-icon-button
          aria-label="${this._('Redraw region')}"
          ?disabled="${p.removed}"
          @click="${() => this._startDraw(p)}"
        >
          <grampsjs-icon path="${mdiSelectDrag}"></grampsjs-icon>
        </md-icon-button>
        <md-icon-button
          aria-label="${p.removed
            ? this._('Restore region')
            : this._('Remove region')}"
          @click="${() => this._toggleRemoved(p)}"
        >
          <grampsjs-icon path="${mdiDelete}"></grampsjs-icon>
        </md-icon-button>
      </div>
    `
  }

  _renderAttachToggle() {
    return html`
      <div class="attach-row">
        <md-switch
          ?selected="${this.item.attach}"
          @change="${this._handleAttachToggle}"
        ></md-switch>
        <span>${this._('Import faces with this photo')}</span>
      </div>
    `
  }

  _handleAttachToggle(e) {
    fireEvent(this, 'immich-item:attach-changed', {
      key: this.item.key,
      attach: !!e.target.selected,
    })
  }

  _startDraw(p) {
    this._drawingPersonId = p.immichPersonId
  }

  _handleRectDraw(e) {
    if (!this._drawingPersonId) {
      return
    }
    fireEvent(this, 'immich-region:rect-changed', {
      key: this.item.key,
      immichPersonId: this._drawingPersonId,
      rect: e.detail.rect,
    })
    this._drawingPersonId = ''
  }

  _toggleRemoved(p) {
    fireEvent(this, 'immich-region:removed-changed', {
      key: this.item.key,
      immichPersonId: p.immichPersonId,
      removed: !p.removed,
    })
  }

  _requestLink(p) {
    fireEvent(this, 'immich-person:link-request', {
      immichPersonId: p.immichPersonId,
      name: p.name,
    })
  }
}

window.customElements.define(
  'grampsjs-immich-region-review',
  GrampsjsImmichRegionReview
)
