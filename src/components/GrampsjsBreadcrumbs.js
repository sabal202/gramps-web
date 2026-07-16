import {LitElement, html, css} from 'lit'

import '@material/mwc-icon-button'
import {mdiLockOpenVariantOutline, mdiLockOutline} from '@mdi/js'

import {sharedStyles} from '../SharedStyles.js'
import {fireEvent, clickKeyHandler} from '../util.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import './GrampsjsTooltip.js'
import './GrampsjsShareUrl.js'
import './GrampsjsBookmarkButton.js'

export class GrampsjsBreadcrumbs extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        .breadcrumb {
          font-size: 14px;
          font-weight: 450;
          color: var(--grampsjs-body-font-color-45);
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .breadcrumb a:link,
        a:visited {
          color: var(--grampsjs-body-font-color-45);
          text-decoration: none;
          border-radius: 3px;
        }

        .breadcrumb a:hover {
          color: var(--grampsjs-body-font-color-45);
          text-decoration: none;
          background-color: var(--grampsjs-body-font-color-5);
        }

        .breadcrumb .dark {
        }

        .breadcrumb mwc-icon {
          font-size: 18px;
          position: relative;
          color: var(--grampsjs-body-font-color-40);
        }

        .breadcrumb .action-buttons {
          margin-left: 10px;
          gap: 7px;
          flex-shrink: 0;
        }

        /* The label link truncates rather than pushing the (larger on touch)
           action buttons off the row on narrow screens with long labels. */
        .breadcrumb a {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .breadcrumb span {
          display: inline-flex;
        }

        .breadcrumb .action-buttons md-icon-button {
          --md-icon-button-icon-size: 16px;
          --md-icon-button-disabled-icon-opacity: 1;
          opacity: 1;
          height: 28px;
          width: 28px;
        }

        .breadcrumb .action-buttons grampsjs-share-url,
        .breadcrumb .action-buttons grampsjs-bookmark-button {
          --mdc-icon-size: 16px;
          --mdc-icon-button-size: 28px;
          position: relative;
        }

        /* These sit next to each other and toggle privacy/bookmark/share, so
           on touch bump them to a comfortable 44px tap target (they're 28px,
           fine for a mouse, too small for a fingertip). */
        @media (pointer: coarse) {
          .breadcrumb .action-buttons md-icon-button {
            height: 44px;
            width: 44px;
          }
          /* share-url bumps itself at its own source (parent overrides can't
             reach its internal rule); bookmark-button honours this one. */
          .breadcrumb .action-buttons grampsjs-bookmark-button {
            --mdc-icon-button-size: 44px;
          }
        }

        .breadcrumb .action-buttons grampsjs-bookmark-button {
          --mdc-icon-size: 17px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      data: {type: Object},
      edit: {type: Boolean},
      objectsName: {type: String},
      objectEndpoint: {type: String},
      objectIcon: {type: String},
      hideBookmark: {type: Boolean},
      hideLock: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.data = {}
    this.edit = false
    this.objectsName = ''
    this.objectEndpoint = ''
    this.objectIcon = ''
    this.hideBookmark = false
    this.hideLock = false
  }

  render() {
    return html`
      <div class="breadcrumb">
        <mwc-icon>${this.objectIcon}</mwc-icon>
        <a href="/${this._getObjectsLink()}">${this._(this.objectsName)}</a>
        <mwc-icon>chevron_right</mwc-icon>
        <span class="dark">${this.data.gramps_id}</span>
        <span class="action-buttons">
          ${this.hideLock
            ? ''
            : html`
                <span id="wrap-btn-private">
                  <md-icon-button
                    ?disabled="${!this.edit}"
                    @click="${this._handlePrivacyClick}"
                    @keydown="${clickKeyHandler}"
                    touch-target="none"
                    id="btn-private"
                  >
                    <grampsjs-icon
                      .path="${this.data.private
                        ? mdiLockOutline
                        : mdiLockOpenVariantOutline}"
                      color="${this.edit
                        ? 'var(--mdc-theme-secondary)'
                        : 'var(--grampsjs-body-font-color-40)'}"
                    ></grampsjs-icon>
                  </md-icon-button>
                  <grampsjs-tooltip
                    for="wrap-btn-private"
                    content="${this.data.private
                      ? this._('Record is private')
                      : this._('Record is public')}"
                  ></grampsjs-tooltip>
                </span>
              `}
          ${this.hideBookmark
            ? ''
            : html`
                <grampsjs-bookmark-button
                  .appState="${this.appState}"
                  handle="${this.data.handle}"
                  endpoint="${this.objectEndpoint}"
                ></grampsjs-bookmark-button>
              `}
          <grampsjs-share-url
            href="${document.URL}"
            .appState="${this.appState}"
          ></grampsjs-share-url>
        </span>
      </div>
    `
  }

  _getObjectsLink() {
    // Media Objects -> /medialist
    if (this.objectsName === 'Media Objects') {
      return 'medialist'
    }
    // People -> /people etc.
    return this.objectsName.toLowerCase()
  }

  _handlePrivacyClick() {
    fireEvent(this, 'edit:action', {
      action: 'updateProp',
      data: {private: !this.data.private},
    })
  }
}

window.customElements.define('grampsjs-breadcrumbs', GrampsjsBreadcrumbs)
