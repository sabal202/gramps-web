/* eslint-disable lit-a11y/click-events-have-key-events */
import {html, css, LitElement} from 'lit'
import '@material/web/list/list'
import '@material/web/list/list-item'
import {
  mdiChevronUp,
  mdiChevronRight,
  mdiChevronDown,
  mdiHomeAccount,
  mdiUnfoldLessHorizontal,
} from '@mdi/js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {fireEvent} from '../util.js'
import './GrampsjsIcon.js'

// Mobile counterpart of the desktop hover tabs/family-ring in
// RelationshipChart.js's addCollapseAffordances (see
// docs/superpowers/specs/2026-07-09-relchart-granular-collapse-design.md
// §7): a bottom sheet listing the collapse actions available for whatever
// the user tapped (family node) or long-pressed (person card). There is no
// official Material Web bottom-sheet component (only md-dialog, which
// centers), so the sheet/scrim shell below is a plain fixed-position
// element; the rows themselves are md-list/md-list-item to stay within the
// "use md-* primitives" convention where one exists.
function iconForItem(item) {
  if (item.action === 'reroot') return mdiHomeAccount
  if (item.action === 'whole') return mdiUnfoldLessHorizontal
  if (typeof item.cutKey === 'string') {
    if (item.cutKey.startsWith('anc:')) return mdiChevronUp
    if (item.cutKey.startsWith('spouse:')) return mdiChevronRight
    if (item.cutKey.startsWith('children:')) return mdiChevronDown
  }
  return ''
}

export class GrampsjsCollapseSheet extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return css`
      :host {
        display: contents;
      }
      .scrim {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        z-index: 1000;
      }
      .sheet {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1001;
        background: var(--md-sys-color-surface-container-low, #fff);
        border-top-left-radius: 20px;
        border-top-right-radius: 20px;
        box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.2);
        padding: 8px 0 max(8px, env(safe-area-inset-bottom));
        max-height: 70vh;
        overflow-y: auto;
      }
      @media (prefers-reduced-motion: no-preference) {
        .sheet {
          animation: collapse-sheet-in 0.18s ease-out;
        }
      }
      @keyframes collapse-sheet-in {
        from {
          transform: translateY(100%);
        }
        to {
          transform: translateY(0);
        }
      }
      .grabber {
        width: 36px;
        height: 4px;
        border-radius: 2px;
        background: var(--md-sys-color-outline-variant, #ccc);
        margin: 6px auto 8px;
      }
      .sheet-title {
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: var(--md-sys-color-secondary);
        padding: 2px 16px 8px;
      }
      md-list {
        padding: 0;
      }
      .label-sub {
        font-size: 0.8rem;
        color: var(--md-sys-color-on-surface-variant);
      }
      .count {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--md-sys-color-on-tertiary-container);
        background: var(--md-sys-color-tertiary-container);
        border-radius: 999px;
        padding: 2px 9px;
      }
      hr {
        border: none;
        border-top: 1px solid var(--md-sys-color-outline-variant);
        margin: 4px 12px;
      }
    `
  }

  static get properties() {
    return {
      open: {type: Boolean},
      sheetTitle: {type: String},
      items: {type: Array},
    }
  }

  constructor() {
    super()
    this.open = false
    this.sheetTitle = ''
    this.items = []
  }

  _close() {
    fireEvent(this, 'collapse-sheet-close')
  }

  _select(item) {
    this._close()
    fireEvent(this, 'collapse-select', {
      cutKey: item.cutKey,
      action: item.action,
      family: item.family,
      spouse: item.spouse,
      grampsId: item.grampsId,
    })
  }

  _renderItem(item) {
    if (item.divider) {
      return html`<hr />`
    }
    const icon = iconForItem(item)
    return html`
      <md-list-item type="button" @click="${() => this._select(item)}">
        ${item.label}
        ${typeof item.dashed === 'boolean'
          ? html`<span slot="supporting-text" class="label-sub"
              >${item.dashed
                ? this._('non-birth family')
                : this._('birth family')}</span
            >`
          : ''}
        ${icon
          ? html`<grampsjs-icon
              slot="start"
              path="${icon}"
              color="var(--md-sys-color-secondary)"
            ></grampsjs-icon>`
          : ''}
        ${typeof item.count === 'number'
          ? html`<span slot="end" class="count">${item.count}</span>`
          : ''}
      </md-list-item>
    `
  }

  render() {
    if (!this.open) {
      return ''
    }
    return html`
      <div class="scrim" @click="${() => this._close()}"></div>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="${this.sheetTitle || this._('Collapse/expand branches')}"
      >
        <div class="grabber"></div>
        ${this.sheetTitle
          ? html`<div class="sheet-title">${this.sheetTitle}</div>`
          : ''}
        <md-list> ${this.items.map(item => this._renderItem(item))} </md-list>
      </div>
    `
  }
}

window.customElements.define('grampsjs-collapse-sheet', GrampsjsCollapseSheet)
