import {html, css, LitElement} from 'lit'
import '@material/web/textfield/outlined-text-field'
import '@material/web/iconbutton/filled-icon-button'
import '@material/web/icon/icon.js'

import {mdiSend} from '@mdi/js'
import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import {renderIconSvg} from '../icons.js'

class GrampsjsChatPrompt extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        .container {
          display: flex;
          align-items: end;
          justify-content: center;
        }

        md-outlined-text-field {
          flex: 1;
          --md-outlined-text-field-container-shape: 28px;
          --md-outlined-text-field-input-text-placeholder-color: var(
            --grampsjs-color-shade-120
          );
          resize: none;
        }

        md-filled-icon-button.send {
          --md-filled-icon-button-container-color: var(--md-sys-color-primary);
          position: relative;
          margin-left: 16px;
          margin-top: 9px;
          margin-bottom: 9px;
          margin-right: 0;
          --md-filled-icon-button-icon-size: 22px;
          --md-filled-icon-button-state-layer-height: 66px;
          --md-filled-icon-button-state-layer-width: 66px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      value: {type: String},
      maxRows: {type: Number},
      nRows: {type: Number},
      loading: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.value = ''
    this.maxRows = 5
    this.nRows = 1
    this.loading = false
  }

  // On touch devices the virtual keyboard's return key never carries a
  // shiftKey modifier, so intercepting plain Enter to submit would make it
  // impossible to type a newline. There, Enter inserts a newline and the send
  // button submits; on desktop, Enter submits and Shift+Enter inserts a newline.
  get _isCoarsePointer() {
    return window.matchMedia('(pointer: coarse)').matches
  }

  render() {
    return html`
      <div class="container">
        <md-outlined-text-field
          type="textarea"
          rows="${this.nRows}"
          enterkeyhint="${this._isCoarsePointer ? 'enter' : 'send'}"
          placeholder="${this._('Ask something about your ancestors')}"
          value="${this.value}"
          @input="${this._handleInput}"
          @keydown="${this._handleKey}"
        >
        </md-outlined-text-field>
        <md-filled-icon-button
          @click="${this._handleBtnClick}"
          class="send"
          ?disabled="${this.loading}"
        >
          <md-icon
            >${renderIconSvg(
              mdiSend,
              'var(--grampsjs-color-shade-255)'
            )}</md-icon
          >
        </md-filled-icon-button>
      </div>
    `
  }

  _handleBtnClick() {
    this._submit()
  }

  _handleKey(event) {
    if (event.code === 'Enter' && !event.shiftKey && !this._isCoarsePointer) {
      event.preventDefault()
      event.stopPropagation()
      this._submit()
    } else if (event.code === 'Escape') {
      this._clear()
    }
  }

  _handleInput() {
    this.value = this.renderRoot.querySelector('md-outlined-text-field').value
    this._updateNRows()
  }

  _clear() {
    const input = this.renderRoot.querySelector('md-outlined-text-field')
    if (input !== null) {
      input.value = ''
      this.value = ''
    }
    this._updateNRows()
  }

  _submit() {
    if (this.value.trim() && !this.loading) {
      fireEvent(this, 'chat:prompt', {message: this.value.trim()})
      this._clear()
    }
  }

  _updateNRows() {
    if (!this.value) {
      this.nRows = 1
    }
    this.nRows = Math.min(this.maxRows, this.value.split('\n').length)
  }

  focusInput() {
    const textField = this.renderRoot.querySelector('md-outlined-text-field')
    if (textField !== null) {
      textField.focus()
    }
  }
}

window.customElements.define('grampsjs-chat-prompt', GrampsjsChatPrompt)
