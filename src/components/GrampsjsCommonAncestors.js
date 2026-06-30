/*
 * Component showing the closest common ancestor(s) between a subject person
 * and the home person, with both path chains and the relationship label.
 *
 * Fetches GET /api/people/<handle>/common-ancestors.
 * Renders nothing when:
 *   - no home person is set (handle is empty)
 *   - the response has no relationship / empty ancestors
 *   - a fetch error occurs
 */

import {css, html, LitElement} from 'lit'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'

import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {sharedStyles} from '../SharedStyles.js'
import {fireEvent} from '../util.js'
import {renderPersonAvatar} from './personListUtils.js'
import './GrampsjsImg.js'
import './GrampsjsIcon.js'

/**
 * Build the display name for a person object from the API
 * (common-ancestors endpoint returns name_given/name_surname directly on the person).
 *
 * @param {object} person
 * @returns {string}
 */
export function personName(person) {
  if (!person) return ''
  const given = person.name_given || ''
  const surname = person.name_surname || ''
  return [given, surname].filter(Boolean).join(' ')
}

/**
 * Extract a short date string (year only) from a birth/death object.
 * The person objects returned by /common-ancestors carry birth/death directly.
 *
 * @param {object|undefined} dateObj  - e.g. {date: "1900-01-01"} or {date: "1900"}
 * @returns {string}  - "1900" or ""
 */
function yearFromDateObj(dateObj) {
  if (!dateObj?.date) return ''
  const m = String(dateObj.date).match(/\d{4}/)
  return m ? m[0] : ''
}

/**
 * Format brief life years as "(1900–1975)" or "(1900–)" or "".
 *
 * @param {object} person
 * @returns {string}
 */
export function lifeYears(person) {
  if (!person) return ''
  const b = yearFromDateObj(person.birth)
  const d = yearFromDateObj(person.death)
  if (!b && !d) return ''
  if (b && d) return `(${b}–${d})`
  if (b) return `(${b}–)`
  return `(–${d})`
}

/**
 * Build the "chain" segments for rendering the path from an endpoint to a
 * common ancestor.  Returns an ordered array: [intermediate, …, ancestor].
 *
 * @param {object[]|null|undefined} intermediates  - path_a or path_b (may be empty)
 * @param {object|null}             ancestor       - the common ancestor
 * @returns {object[]}
 */
export function buildChainSegments(intermediates, ancestor) {
  const segs = []
  if (Array.isArray(intermediates)) {
    segs.push(...intermediates)
  }
  if (ancestor) {
    segs.push(ancestor)
  }
  return segs
}

export class GrampsjsCommonAncestors extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
        }

        .common-ancestors-block {
          margin-top: 8px;
        }

        .relationship-label {
          font-style: italic;
          color: var(--grampsjs-body-font-color-75, inherit);
          margin-bottom: 8px;
        }

        .entry {
          margin-bottom: 16px;
        }

        .ancestor-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }

        .ancestor-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          padding: 4px 10px 4px 4px;
          border-radius: 20px;
          background: var(
            --md-sys-color-secondary-container,
            rgba(0, 0, 0, 0.08)
          );
          color: var(--md-sys-color-on-secondary-container, inherit);
          text-decoration: none;
          font-size: 0.9rem;
          border: none;
          font-family: inherit;
        }

        .ancestor-chip:hover {
          background: var(
            --md-sys-color-secondary-container,
            rgba(0, 0, 0, 0.14)
          );
          text-decoration: underline;
        }

        .chip-name {
          font-weight: 500;
        }

        .chip-years {
          font-size: 0.8em;
          opacity: 0.75;
        }

        .path-chain {
          font-size: 0.85rem;
          color: var(--grampsjs-body-font-color-75, inherit);
          margin: 2px 0;
          line-height: 1.5;
          flex-wrap: wrap;
          display: flex;
          align-items: baseline;
          gap: 2px;
        }

        .path-arrow {
          margin: 0 2px;
          opacity: 0.5;
        }

        .path-person-link {
          cursor: pointer;
          color: var(--mdc-theme-primary, inherit);
          text-decoration: underline;
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          font-size: 0.85rem;
        }

        .path-person-link:hover {
          opacity: 0.8;
        }

        .path-endpoint {
          font-weight: 500;
          font-size: 0.85rem;
        }

        .chains {
          margin-top: 4px;
        }

        @media (max-width: 600px) {
          .ancestor-chip {
            font-size: 0.85rem;
          }

          .path-chain {
            font-size: 0.8rem;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      handle: {type: String},
      to: {type: String},
      _relationship: {type: String},
      _ancestors: {type: Array},
      _loading: {type: Boolean},
      _error: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.handle = ''
    this.to = ''
    this._relationship = null
    this._ancestors = []
    this._loading = true
    this._error = false
  }

  /**
   * Trigger fetch when handle OR appState becomes available / changes.
   *
   * handle is an attribute binding (arrives in the first update cycle);
   * appState is a property binding (may arrive one cycle later).  We must
   * react to both so neither ordering causes a permanent blank state.
   * We only set _loading=true once an actual fetch is about to start.
   */
  updated(changed) {
    super.updated(changed)
    const handleChanged = changed.has('handle')
    const toChanged = changed.has('to')
    const appStateChanged = changed.has('appState')
    // Also re-fetch when the locale changes inside appState
    const langChanged =
      appStateChanged &&
      changed.get('appState')?.i18n?.lang !== this.appState?.i18n?.lang

    if (
      (handleChanged || toChanged || appStateChanged || langChanged) &&
      this._canFetch()
    ) {
      this._fetchData()
    }
  }

  /** Returns true once both handle and appState.apiGet are present. */
  _canFetch() {
    return Boolean(this.handle && this.appState?.apiGet)
  }

  async _fetchData() {
    const handle = this.handle
    if (!handle) {
      this._relationship = null
      this._ancestors = []
      this._loading = false
      return
    }
    this._loading = true
    this._error = false
    const lang = this.appState?.i18n?.lang || 'en'
    const toParam = this.to ? `&to=${encodeURIComponent(this.to)}` : ''
    const url = `/api/people/${handle}/common-ancestors?locale=${lang}${toParam}`
    const result = await this.appState.apiGet(url)
    // Guard against stale responses if handle changed mid-flight
    if (handle !== this.handle) return
    if ('data' in result) {
      this._relationship = result.data.relationship ?? null
      this._ancestors = result.data.ancestors ?? []
    } else {
      this._error = true
      this._relationship = null
      this._ancestors = []
    }
    this._loading = false
  }

  _navTo(grampsId) {
    if (grampsId) {
      fireEvent(this, 'nav', {path: `person/${grampsId}`})
    }
  }

  _renderAncestorChip(ancestor) {
    const name = personName(ancestor)
    const years = lifeYears(ancestor)
    return html`
      <button
        type="button"
        class="ancestor-chip"
        @click="${() => this._navTo(ancestor.gramps_id)}"
        title="${name} ${years}"
      >
        ${renderPersonAvatar(ancestor, ancestor.sex)}
        <span class="chip-name">${name}</span>
        ${years ? html`<span class="chip-years">${years}</span>` : ''}
      </button>
    `
  }

  /**
   * Render a single path chain: endpointLabel ← intermediate ← … ← ancestor.
   *
   * When intermediates is empty and ancestor is null (both paths truly empty),
   * returns '' — nothing to show.  When there's at least an ancestor (even with
   * an empty intermediate path, i.e. the subject is a direct child of the
   * ancestor), we render: label ← ancestor-link.
   *
   * @param {string}          endpointLabel  - translated label for the chain start
   * @param {object[]|null}   intermediates  - path_a or path_b from the API
   * @param {object|null}     ancestor       - the common ancestor for this chain
   * @returns {import('lit').TemplateResult|string}
   */
  _buildChainHtml(endpointLabel, intermediates, ancestor) {
    const segments = buildChainSegments(intermediates, ancestor)
    if (segments.length === 0) return ''
    return html`<div class="path-chain">
      <span class="path-endpoint">${endpointLabel}</span>
      <span class="path-arrow">←</span>
      ${segments.map(
        (seg, i) =>
          html`<button
              type="button"
              class="path-person-link"
              @click="${() => this._navTo(seg.gramps_id)}"
            >
              ${personName(seg)}</button
            >${i < segments.length - 1
              ? html`<span class="path-arrow">←</span>`
              : ''}`
      )}
    </div>`
  }

  _renderEntry(entry) {
    // eslint-disable-next-line camelcase
    const {common_ancestors: ancestors, path_a: pathA, path_b: pathB} = entry
    const ancestorList = ancestors || []
    const firstAncestor = ancestorList[0] || null
    // Second ancestor only occurs in the double-cousin case (non-empty paths to
    // two distinct common ancestors).  The sibling case has two ancestors but
    // empty paths — both are shown as chips and the chains are empty.
    const secondAncestor = ancestorList[1] || null

    const subjectLabel = this._('Subject')
    const homeLabel = this._('Home person')

    const chips = html`<div class="ancestor-chips">
      ${ancestorList.map(a => this._renderAncestorChip(a))}
    </div>`

    const chainA = this._buildChainHtml(subjectLabel, pathA, firstAncestor)
    const chainB = this._buildChainHtml(homeLabel, pathB, firstAncestor)
    // These only render when there is a second ancestor AND non-empty paths,
    // which is the double-cousin case (two distinct common ancestors each with
    // their own intermediate chain).
    const chainA2 = secondAncestor
      ? this._buildChainHtml(subjectLabel, pathA, secondAncestor)
      : ''
    const chainB2 = secondAncestor
      ? this._buildChainHtml(homeLabel, pathB, secondAncestor)
      : ''

    return html`
      <div class="entry">
        ${chips}
        <div class="chains">${chainA} ${chainB} ${chainA2} ${chainB2}</div>
      </div>
    `
  }

  render() {
    // Hide while loading or on error, and when there is no meaningful data
    if (this._loading || this._error) return html``
    if (!this._relationship || !this._ancestors.length) return html``

    return html`
      <div class="common-ancestors-block">
        <p class="relationship-label">${this._relationship}</p>
        ${this._ancestors.map(entry => this._renderEntry(entry))}
      </div>
    `
  }
}

window.customElements.define(
  'grampsjs-common-ancestors',
  GrampsjsCommonAncestors
)
