import {html, css, LitElement} from 'lit'

import '@material/web/tabs/tabs'
import '@material/web/tabs/primary-tab'

import {fireEvent} from '../util.js'
import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'

const tabs = {
  people: 'People',
  families: 'Families',
  events: 'Events',
  places: 'Places',
  sources: 'Sources',
  citations: 'Citations',
  repositories: 'Repositories',
  notes: 'Notes',
  settings: {
    user: 'User settings',
    administration: 'Administration',
    users: 'Manage users',
    info: 'System Information',
  },
}

class GrampsjsTabBar extends GrampsjsAppStateMixin(LitElement) {
  static get properties() {
    return {
      _overflowing: {state: true},
    }
  }

  constructor() {
    super()
    this._overflowing = false
    this._resizeObserver = new ResizeObserver(() => this._checkOverflow())
    this._boundCheckOverflow = () => this._checkOverflow()
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('resize', this._boundCheckOverflow)
  }

  disconnectedCallback() {
    this._resizeObserver.disconnect()
    window.removeEventListener('resize', this._boundCheckOverflow)
    super.disconnectedCallback()
  }

  // The md-tabs host is clamped to max-width:100%; the actual horizontal
  // scroller is its internal `.tabs` element, so measure that. If MD3's
  // internal structure ever changes, the query returns null and the fade
  // simply never shows (graceful — no crash).
  _checkOverflow() {
    const el = this.renderRoot?.querySelector('md-tabs')
    const scroller = el?.shadowRoot?.querySelector('.tabs')
    if (!scroller) {
      return
    }
    this._overflowing = scroller.scrollWidth > scroller.clientWidth + 1
  }

  updated() {
    const el = this.renderRoot?.querySelector('md-tabs')
    if (el) {
      this._resizeObserver.disconnect()
      this._resizeObserver.observe(el)
    }
    this._checkOverflow()
  }

  static get styles() {
    return [
      sharedStyles,
      css`
        md-tabs {
          margin: 20px;
          width: max-content;
          max-width: 100%;
        }

        /* Fade the right edge as an affordance that more tabs are scrollable
           off-screen (the native scrollbar is hidden by MD3). Applied ONLY when
           the tabs actually overflow (see the ResizeObserver below) — otherwise
           the fade would wash out the last tab when everything fits. */
        md-tabs.overflowing {
          -webkit-mask-image: linear-gradient(
            to right,
            black calc(100% - 20px),
            transparent
          );
          mask-image: linear-gradient(
            to right,
            black calc(100% - 20px),
            transparent
          );
        }

        md-primary-tab {
          flex: 0 0 auto;
          width: auto;
        }
      `,
    ]
  }

  render() {
    const currentKey = this.appState.path.pageId || this.appState.path.page
    if (!(this.appState.path.page in tabs)) {
      return ''
    }
    if (
      this.appState.path.pageId &&
      this.appState.path.page in tabs &&
      !(this.appState.path.pageId in tabs[this.appState.path.page])
    ) {
      return ''
    }
    let currentTabs
    if (!this.appState.path.pageId) {
      currentTabs = Object.fromEntries(
        Object.entries(tabs).filter(([, value]) => typeof value === 'string')
      )
    } else {
      currentTabs = tabs[this.appState.path.page]
    }
    const filteredTabKeys = Object.keys(currentTabs).filter(key =>
      this._permissionToSeeTab(this.appState.path.page, key)
    )
    return html`
      <md-tabs
        class="${this._overflowing ? 'overflowing' : ''}"
        .activeTabIndex=${filteredTabKeys.indexOf(currentKey)}
      >
        ${filteredTabKeys.map(
          key =>
            html`
              <md-primary-tab @click="${() => this._goTo(key)}"
                >${this._(currentTabs[key])}</md-primary-tab
              >
            `
        )}
      </md-tabs>
    `
  }

  _permissionToSeeTab(page, key) {
    if (page !== 'settings') {
      return true
    }
    switch (key) {
      case 'administration':
        return this.appState.permissions.canManageUsers
      case 'users':
        return this.appState.permissions.canManageUsers
      case 'user':
        return true
      case 'info':
        return true
      default:
        return false
    }
  }

  _goTo(key) {
    if (this.appState.path.pageId) {
      fireEvent(this, 'nav', {path: `${this.appState.path.page}/${key}`})
    } else {
      fireEvent(this, 'nav', {path: key})
    }
  }
}

window.customElements.define('grampsjs-tab-bar', GrampsjsTabBar)
