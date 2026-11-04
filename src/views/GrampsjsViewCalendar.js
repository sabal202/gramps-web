import {css, html} from 'lit'

import '@material/web/checkbox/checkbox'
import '@material/web/radio/radio'
import '@material/web/slider/slider.js'
import '@material/web/button/filled-button'
import '@material/web/button/outlined-button'
import '@material/web/textfield/outlined-text-field'
import '@material/web/iconbutton/icon-button.js'

import {
  mdiCalendarPlus,
  mdiCheck,
  mdiClose,
  mdiContentCopy,
  mdiGoogle,
  mdiApple,
} from '@mdi/js'

import {GrampsjsView} from './GrampsjsView.js'
import '../components/GrampsjsIcon.js'
import '../components/GrampsjsCollapsibleSection.js'
import '../components/GrampsjsFormSelectObject.js'
import {fireEvent} from '../util.js'
import {__APIHOST__} from '../api.js'
import {buildIcsUrl, buildGoogleCalendarUrl} from '../calendarUrl.js'
import {renderQrSvg} from '../qr.js'

const EVENT_TYPES_PRIMARY = ['Birth', 'Marriage', 'Death']
const EVENT_TYPES_MORE = ['Baptism', 'Burial', 'Engagement']

const EVENT_TYPE_HINTS = {
  Birth: 'Every year on the birthday',
  Marriage: "A couple's marriage anniversary",
  Death: 'Anniversary of passing',
}

export class GrampsjsViewCalendar extends GrampsjsView {
  static get styles() {
    return [
      super.styles,
      css`
        .card {
          max-width: 640px;
          margin: 0 0 24px;
        }

        .card:last-child {
          margin-bottom: 0;
        }

        h3 {
          margin: 0 0 4px;
        }

        p.sub {
          color: var(--grampsjs-body-font-color-60);
          font-size: 0.9em;
          margin: 0 0 16px;
        }

        p.hint {
          color: var(--grampsjs-body-font-color-60);
          font-size: 0.85em;
          margin: 4px 0 0;
        }

        .opt {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          cursor: pointer;
        }

        .opt .lab {
          display: block;
          font-weight: 500;
        }

        .opt .hint {
          display: block;
          color: var(--grampsjs-body-font-color-60);
          font-size: 0.85em;
        }

        .radio-row {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          cursor: pointer;
        }

        .radio-row .lab {
          display: block;
          font-weight: 500;
        }

        .radio-row .hint {
          display: block;
          color: var(--grampsjs-body-font-color-60);
          font-size: 0.85em;
        }

        .anchor-box {
          margin: 8px 0 0 32px;
        }

        .anchor-chosen {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .depth-row {
          margin-top: 12px;
          font-size: 0.9em;
          font-weight: 500;
        }

        md-slider {
          width: 100%;
          max-width: 320px;
        }

        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 12px 0;
        }

        .link-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 12px 0;
        }

        .link-row md-outlined-text-field {
          flex: 1;
          --md-outlined-text-field-container-shape: 8px;
        }

        .qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin: 16px 0;
        }

        .qr-box div {
          width: 180px;
          height: 180px;
        }

        .qr-box svg {
          width: 180px;
          height: 180px;
          background: #fff;
          padding: 10px;
          border-radius: 12px;
          box-sizing: border-box;
        }

        p.error {
          color: var(--md-sys-color-error);
          font-size: 0.9em;
        }

        p.notice {
          color: var(--grampsjs-body-font-color-60);
          font-size: 0.85em;
        }

        p.foot {
          color: var(--grampsjs-body-font-color-60);
          font-size: 0.8em;
        }
      `,
    ]
  }

  static get properties() {
    return {
      _eventTypes: {type: Array},
      _scope: {type: String},
      _anchor: {type: Object},
      _depth: {type: Number},
      _feedToken: {type: String},
      _tokenExists: {type: Boolean},
      _loading: {type: Boolean},
      _error: {type: String},
      _linkCopied: {type: Boolean},
    }
  }

  constructor() {
    super()
    this._eventTypes = ['Birth', 'Marriage']
    this._scope = 'all'
    this._anchor = null
    this._depth = 4
    this._feedToken = null
    this._tokenExists = false
    this._loading = false
    this._error = ''
    this._linkCopied = false
  }

  renderContent() {
    return html`
      <h2>${this._('Calendar subscription')}</h2>
      <p class="sub">
        ${this._(
          'Build a personal calendar of family birthdays and anniversaries, and subscribe with one tap.'
        )}
      </p>
      ${this._renderEventTypesCard()} ${this._renderScopeCard()}
      ${this._renderSubscriptionCard()} ${this._renderFaqCard()}
    `
  }

  _renderEventTypesCard() {
    return html`
      <div class="card">
        <h3>${this._('What to show')}</h3>
        <p class="sub">${this._('Pick the date types for your calendar')}</p>
        ${EVENT_TYPES_PRIMARY.map(type => this._renderEventTypeOption(type))}
        <grampsjs-collapsible-section title="${this._('More event types')}">
          ${EVENT_TYPES_MORE.map(type => this._renderEventTypeOption(type))}
        </grampsjs-collapsible-section>
      </div>
    `
  }

  _renderEventTypeOption(type) {
    const hint = EVENT_TYPE_HINTS[type]
    return html`
      <label class="opt">
        <md-checkbox
          ?checked="${this._eventTypes.includes(type)}"
          @change="${e => this._handleEventTypeChange(type, e.target.checked)}"
        ></md-checkbox>
        <span>
          <span class="lab">${this._(type)}</span>
          ${hint ? html`<span class="hint">${this._(hint)}</span>` : ''}
        </span>
      </label>
    `
  }

  _handleEventTypeChange(type, checked) {
    if (checked) {
      if (!this._eventTypes.includes(type)) {
        this._eventTypes = [...this._eventTypes, type]
      }
    } else {
      this._eventTypes = this._eventTypes.filter(t => t !== type)
    }
  }

  _renderScopeCard() {
    return html`
      <div class="card">
        <h3>${this._('Who to include')}</h3>
        <p class="sub">
          ${this._('Everyone, or only relatives close to one person')}
        </p>
        <div role="radiogroup">
          <label class="radio-row">
            <md-radio
              name="calendar-scope"
              ?checked="${this._scope === 'all'}"
              @change="${() => this._handleScopeChange('all')}"
            ></md-radio>
            <span>
              <span class="lab">${this._('Whole tree')}</span>
              <span class="hint"
                >${this._('Everyone in the family archive')}</span
              >
            </span>
          </label>
          <label class="radio-row">
            <md-radio
              name="calendar-scope"
              ?checked="${this._scope === 'close'}"
              @change="${() => this._handleScopeChange('close')}"
            ></md-radio>
            <span>
              <span class="lab">${this._('Close relatives only')}</span>
              <span class="hint"
                >${this._(
                  'Ancestors and descendants around a chosen person'
                )}</span
              >
            </span>
          </label>
        </div>
        ${this._scope === 'close' ? this._renderAnchorPicker() : ''}
      </div>
    `
  }

  _handleScopeChange(scope) {
    this._scope = scope
  }

  _renderAnchorPicker() {
    return html`
      <div class="anchor-box">
        ${this._anchor
          ? html`
              <div class="anchor-chosen">
                <span
                  ><strong>${this._anchor.name}</strong> (${this._anchor
                    .gramps_id})</span
                >
                <md-icon-button
                  @click="${this._handleClearAnchor}"
                  title="${this._('Clear')}"
                  aria-label="${this._('Clear')}"
                >
                  <grampsjs-icon path="${mdiClose}"></grampsjs-icon>
                </md-icon-button>
              </div>
            `
          : ''}
        <grampsjs-form-select-object
          objectType="person"
          .appState="${this.appState}"
          @select-object:changed="${this._handleAnchorSelected}"
        ></grampsjs-form-select-object>
        <div class="depth-row">
          ${this._('Generation depth')}: ${this._depth}
        </div>
        <md-slider
          labeled
          min="1"
          max="9"
          value="${this._depth}"
          @input="${this._handleDepthInput}"
        ></md-slider>
        <p class="hint">
          ${this._(
            'How many generations up and down from the chosen person to include'
          )}
        </p>
      </div>
    `
  }

  _handleAnchorSelected(e) {
    const obj = e.detail.objects[0]
    const object = obj?.object ?? {}
    const grampsId = object.gramps_id || obj?.handle || ''
    const given = object.profile?.name_given || ''
    const surname = object.profile?.name_surname || ''
    const name = `${given} ${surname}`.trim() || grampsId
    this._anchor = {gramps_id: grampsId, name}
    e.preventDefault()
    e.stopPropagation()
  }

  _handleClearAnchor() {
    this._anchor = null
    // The picker keeps its own selected-objects list (used to exclude already
    // chosen people from search results). Reset it too, otherwise the same
    // person can't be picked again after clearing.
    this.renderRoot?.querySelector('grampsjs-form-select-object')?.reset()
  }

  _handleDepthInput(e) {
    this._depth = Number(e.target.value)
  }

  _renderSubscriptionCard() {
    return html`
      <div class="card">
        <h3>${this._('Your subscription')}</h3>
        <p class="sub">
          ${this._('Create a link and add the calendar in one tap')}
        </p>
        ${this._tokenExists && !this._feedToken
          ? html`
              <p class="notice">
                ${this._(
                  'It looks like a link was already created before (maybe on another device). Create a new one — old links will stop working.'
                )}
              </p>
            `
          : ''}
        ${this._feedToken
          ? this._renderTokenReady()
          : this._renderTokenCreate()}
      </div>
    `
  }

  _renderTokenCreate() {
    return html`
      <div class="action-row">
        <md-filled-button
          @click="${this._handleCreateLink}"
          ?disabled="${this._loading}"
        >
          <grampsjs-icon slot="icon" path="${mdiCalendarPlus}"></grampsjs-icon>
          ${this._('Create link')}
        </md-filled-button>
      </div>
      ${this._error ? html`<p class="error">${this._error}</p>` : ''}
    `
  }

  _renderTokenReady() {
    const link = this._buildLink('https')
    const webcalLink = this._buildLink('webcal')
    const googleUrl = buildGoogleCalendarUrl(webcalLink)
    return html`
      <div class="action-row">
        <md-filled-button href="${googleUrl}" target="_blank" rel="noopener">
          <grampsjs-icon slot="icon" path="${mdiGoogle}"></grampsjs-icon>
          ${this._('Google Calendar')}
        </md-filled-button>
        <md-outlined-button href="${webcalLink}">
          <grampsjs-icon slot="icon" path="${mdiApple}"></grampsjs-icon>
          ${this._('iPhone / iPad')}
        </md-outlined-button>
      </div>
      ${this._scope === 'close' && !this._anchor
        ? html`
            <p class="notice">
              ${this._(
                'No person chosen — the link currently covers the whole tree. Pick a person above to limit it to close relatives.'
              )}
            </p>
          `
        : ''}
      <div class="link-row">
        <md-outlined-text-field
          readonly
          value="${link}"
        ></md-outlined-text-field>
        <md-icon-button
          @click="${this._handleCopyLink}"
          title="${this._('_Copy')}"
          aria-label="${this._('_Copy')}"
        >
          <grampsjs-icon
            path="${this._linkCopied ? mdiCheck : mdiContentCopy}"
          ></grampsjs-icon>
        </md-icon-button>
      </div>
      <div class="qr-box">
        <div id="qr-container"></div>
        <p class="hint">${this._('Point your phone camera to subscribe')}</p>
      </div>
      <grampsjs-collapsible-section
        title="${this._('Create a new link (reset the old one)')}"
      >
        <p class="notice">
          ${this._(
            'All previously created links (on every device) will stop working.'
          )}
        </p>
        <md-outlined-button @click="${this._handleCreateLink}">
          ${this._('Reset and create new')}
        </md-outlined-button>
      </grampsjs-collapsible-section>
      ${this._error ? html`<p class="error">${this._error}</p>` : ''}
    `
  }

  _renderFaqCard() {
    return html`
      <div class="card">
        <h3>${this._('How to subscribe')}</h3>
        <p class="sub">
          ${this._("If the buttons above didn't work — step by step")}
        </p>
        <grampsjs-collapsible-section title="${this._('iPhone / iPad')}">
          <p>
            ${this._(
              'Tap iPhone / iPad above (or scan the QR code with your camera). iOS will offer to subscribe to the calendar — confirm. Done: events will appear in the Calendar app and update automatically.'
            )}
          </p>
        </grampsjs-collapsible-section>
        <grampsjs-collapsible-section title="${this._('Android')}">
          <p>
            ${this._(
              "On a phone this is done via Google Calendar in a browser (the app can't add a calendar by URL). Tap Google Calendar above — the add page opens, confirm. The calendar will also appear in the phone app."
            )}
          </p>
        </grampsjs-collapsible-section>
        <grampsjs-collapsible-section
          title="${this._('Google Calendar (desktop)')}"
        >
          <p>
            ${this._(
              'Copy the link (the copy button). In Google Calendar, on the left: Other calendars → + → From URL. Paste the link and click Add calendar.'
            )}
          </p>
        </grampsjs-collapsible-section>
        <grampsjs-collapsible-section title="${this._('Outlook')}">
          <p>
            ${this._(
              'Copy the link. In Outlook: Add calendar → Subscribe from web. Paste the link and confirm.'
            )}
          </p>
        </grampsjs-collapsible-section>
        <p class="foot">
          ${this._(
            "This link is personal — don't share it: it reveals exactly what you have access to in the family archive. Lost the link? Just create a new one here."
          )}
        </p>
      </div>
    `
  }

  // Origin/host the ICS feed lives on. __APIHOST__ is '' for same-origin
  // deployments (use the frontend's own location) or an absolute API origin
  // when the backend is served from a different host.
  // eslint-disable-next-line class-methods-use-this
  _apiLocation() {
    if (__APIHOST__) {
      try {
        return new URL(__APIHOST__, window.location.href)
      } catch {
        // fall through to same-origin
      }
    }
    return window.location
  }

  _buildLink(scheme) {
    if (!this._feedToken) {
      return ''
    }
    const loc = this._apiLocation()
    return buildIcsUrl({
      origin: loc.origin,
      host: loc.host,
      scheme,
      token: this._feedToken,
      eventTypes: this._eventTypes,
      scope: this._scope,
      anchorGrampsId: this._anchor?.gramps_id || '',
      depth: this._depth,
    })
  }

  async _handleCreateLink() {
    this._error = ''
    if (this._eventTypes.length === 0) {
      this._error = this._('Select at least one event type to continue.')
      return
    }
    if (this._scope === 'close' && !this._anchor) {
      this._error = this._('Choose a person for "close relatives" scope.')
      return
    }
    this._loading = true
    const data = await this.appState.apiPost(
      '/api/users/-/access-tokens/anniversaries_ics/',
      {}
    )
    this._loading = false
    if ('error' in data) {
      this._error = this._(
        'Could not create the calendar link. Please try again.'
      )
      return
    }
    this._feedToken = data.data?.token || null
    this._tokenExists = true
  }

  async _handleCopyLink() {
    const link = this._buildLink('https')
    if (!link) {
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      this._linkCopied = true
      setTimeout(() => {
        this._linkCopied = false
      }, 2000)
    } catch {
      fireEvent(this, 'grampsjs:error', {
        message: this._('Failed to copy to clipboard'),
      })
    }
  }

  async _fetchTokenStatus() {
    this._loading = true
    const data = await this.appState.apiGet(
      '/api/users/-/access-tokens/anniversaries_ics/'
    )
    this._loading = false
    if ('data' in data) {
      this._tokenExists = !!data.data?.active
    }
  }

  updated(changed) {
    super.updated(changed)
    if (changed.has('active') && this.active) {
      this._fetchTokenStatus()
    }
    this._updateQrCode()
  }

  _updateQrCode() {
    const container = this.renderRoot?.querySelector('#qr-container')
    if (!container) {
      return
    }
    if (!this._feedToken) {
      container.innerHTML = ''
      return
    }
    container.innerHTML = renderQrSvg(this._buildLink('webcal'))
  }
}

window.customElements.define('grampsjs-view-calendar', GrampsjsViewCalendar)
