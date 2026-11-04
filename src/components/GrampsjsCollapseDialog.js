import {LitElement, html, css} from 'lit'
import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import {enumerateCuts} from '../charts/collapseCuts.js'

// Dialog listing the collapse cuts available on the current chart graph:
// presets, spouse branches, family children and ancestor lines, each with the
// number of people it hides. Toggling a row fires 'collapse-toggle'
// {cutKey, active}; 'collapse-reset' clears all cuts. The host (tree view)
// owns the collapsed-cut set and re-prunes the chart data.
export class GrampsjsCollapseDialog extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        table {
          width: 100%;
          border-collapse: collapse;
        }
        td {
          padding: 6px 8px;
          vertical-align: middle;
        }
        tr.section td {
          font-weight: 500;
          padding-top: 16px;
          color: var(--grampsjs-color-shade-240, #555);
        }
        .count {
          color: var(--grampsjs-body-font-color-50, #888);
          font-size: 0.9em;
        }
        .note {
          margin: 0 0 12px;
        }
        .note .link {
          margin-left: 8px;
        }
      `,
    ]
  }

  static get properties() {
    return {
      people: {type: Array},
      rootHandle: {type: String},
      collapsed: {type: Object},
      open: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.people = []
    this.rootHandle = ''
    this.collapsed = new Set()
    this.open = false
  }

  _groups() {
    if (!this.people?.length || !this.rootHandle) {
      return null
    }
    return enumerateCuts(this.people, this.rootHandle, false)
  }

  _row(cut) {
    const active = this.collapsed.has(cut.cutKey)
    let label = ''
    if (cut.kind === 'line') {
      label = this._('Only the direct line')
    } else if (cut.kind === 'desc') {
      label = this._('Hide descendants')
    } else if (cut.name !== undefined && cut.surname !== undefined) {
      // ancestor line
      label = this
        ._('Ancestors of {name} via {surname}')
        .replace('{name}', cut.name || '…')
        .replace('{surname}', cut.surname || '…')
    } else if (cut.surname !== undefined) {
      // children of one family
      label = this
        ._('Children of the {surname} family')
        .replace('{surname}', cut.surname || '…')
    } else {
      // spouse branch
      label = this._('Branch of {name}').replace('{name}', cut.name || '…')
    }
    return html`
      <tr>
        <td class="switch-cell">
          <md-switch
            ?selected="${active}"
            @change=${() =>
              fireEvent(this, 'collapse-toggle', {
                cutKey: cut.cutKey,
                active: !active,
              })}
          ></md-switch>
        </td>
        <td>
          ${label}
          <span class="count"
            >— ${this._('hides {n} people').replace('{n}', cut.count)}</span
          >
        </td>
      </tr>
    `
  }

  _section(title, cuts) {
    if (!cuts.length) return ''
    return html`
      <tr class="section">
        <td colspan="2">${title}</td>
      </tr>
      ${cuts.map(cut => this._row(cut))}
    `
  }

  render() {
    const groups = this._groups()
    if (!groups) {
      return html`<md-dialog></md-dialog>`
    }
    const total = this.collapsed.size
    return html`
      <md-dialog ?open="${this.open}">
        <div slot="headline">${this._('Collapse parts of the chart')}</div>
        <div slot="content">
          ${total
            ? html`
                <p class="note">
                  ${this._('Hidden people: {n}').replace('{n}', total)}
                  <span
                    class="link"
                    @click="${() => fireEvent(this, 'collapse-reset')}"
                    >${this._('Reset')}</span
                  >
                </p>
              `
            : ''}
          <table>
            ${this._section(this._('Presets'), groups.presets)}
            ${this._section(this._('Spouse branches'), groups.spouse)}
            ${this._section(this._('Children of families'), groups.children)}
            ${this._section(this._('Ancestor lines'), groups.ancestors)}
          </table>
        </div>
        <div slot="actions">
          <md-text-button @click="${() => (this.open = false)}"
            >${this._('Close')}</md-text-button
          >
        </div>
      </md-dialog>
    `
  }
}

window.customElements.define(
  'grampsjs-collapse-dialog',
  GrampsjsCollapseDialog
)
