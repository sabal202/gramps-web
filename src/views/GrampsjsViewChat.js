import {html, css} from 'lit'

import '../components/GrampsjsChat.js'
import {GrampsjsView} from './GrampsjsView.js'

export class GrampsjsViewChat extends GrampsjsView {
  static get properties() {
    return {
      ...super.properties,
      homePersonDetails: {type: Object},
    }
  }

  static get styles() {
    return [
      super.styles,
      css`
        :host {
          /* Fall back to the dynamic viewport height (shrinks with browser
             chrome and, on Android, with the on-screen keyboard). The
             --chat-available-height override, set from window.visualViewport,
             additionally handles iOS Safari where the keyboard overlays the
             viewport instead of resizing it. */
          height: var(--chat-available-height, calc(100dvh - 85px));
          margin-top: 0;
          margin-bottom: 0;
          display: flex;
          overflow: hidden;
        }
      `,
    ]
  }

  constructor() {
    super()
    this._onViewportChange = () => this._updateViewportHeight()
  }

  connectedCallback() {
    super.connectedCallback()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onViewportChange)
      window.visualViewport.addEventListener('scroll', this._onViewportChange)
    }
  }

  disconnectedCallback() {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener(
        'resize',
        this._onViewportChange
      )
      window.visualViewport.removeEventListener(
        'scroll',
        this._onViewportChange
      )
    }
    super.disconnectedCallback()
  }

  // Size the chat pane to exactly fill the visible area between the top of the
  // view and the bottom of the visual viewport, so the prompt stays reachable
  // above the on-screen keyboard.
  _updateViewportHeight() {
    const vv = window.visualViewport
    if (!vv) {
      return
    }
    const top = this.getBoundingClientRect().top - (vv.offsetTop || 0)
    const available = Math.max(120, vv.height - top)
    this.style.setProperty('--chat-available-height', `${available}px`)
  }

  update(changed) {
    super.update(changed)
    if (changed.has('active')) {
      this._focus()
    }
  }

  _focus() {
    if (this.active) {
      this._updateViewportHeight()
      this.renderRoot.querySelector('grampsjs-chat').focusInput()
    }
  }

  renderContent() {
    return html`
      <grampsjs-chat
        .appState="${this.appState}"
        .homePersonDetails="${this.homePersonDetails}"
      ></grampsjs-chat>
    `
  }

  firstUpdated() {
    this._updateViewportHeight()
    this._focus()
  }
}

window.customElements.define('grampsjs-view-chat', GrampsjsViewChat)
