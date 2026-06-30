/*
 * Component showing the closest common ancestor(s) between a subject person
 * and the home person, as a horizontal breadcrumb path.
 *
 * Fetches GET /api/people/<handle>/common-ancestors.
 * Renders nothing when:
 *   - no home person is set (handle is empty)
 *   - the response has no relationship / empty ancestors
 *   - a fetch error occurs
 */

import {css, html, LitElement} from 'lit'
import {mdiAccount} from '@mdi/js'

import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {sharedStyles} from '../SharedStyles.js'
import {fireEvent} from '../util.js'
import {genderBorderColor} from './personListUtils.js'
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
 * Build an ordered list of node descriptors for a breadcrumb path chain.
 *
 * Reads: subject → up pathA → apex(common ancestors) → down reverse(pathB) → home.
 *
 * Each node descriptor:
 *   { role: 'subject'|'path'|'apex'|'home', persons: [person, ...] }
 *
 * - role 'subject': the page person (single person).
 * - role 'path': an intermediate person on one side of the chain (single person).
 * - role 'apex': the shared common ancestor(s); two persons for sibling/paired-apex case.
 * - role 'home': the home/base person (single person); omitted when home is null.
 *
 * @param {object|null}   subject    - the page person
 * @param {object[]}      pathA      - intermediates subject→ancestor (excludes endpoints)
 * @param {object[]}      ancestors  - common ancestors (1 or 2 persons)
 * @param {object[]}      pathB      - intermediates home→ancestor (excludes endpoints)
 * @param {object|null}   home       - home person; omit (null) to skip the home node
 * @returns {{ role: string, persons: object[] }[]}
 */
export function buildChain(subject, pathA, ancestors, pathB, home) {
  const nodes = []

  if (subject) {
    nodes.push({role: 'subject', persons: [subject]})
  }

  const safePathA = Array.isArray(pathA) ? pathA : []
  for (const p of safePathA) {
    nodes.push({role: 'path', persons: [p]})
  }

  const safeAncestors = Array.isArray(ancestors) ? ancestors : []
  if (safeAncestors.length > 0) {
    nodes.push({role: 'apex', persons: safeAncestors})
  }

  // pathB is traversed home→ancestor, so reverse it for ancestor→home direction
  const safePathB = Array.isArray(pathB) ? pathB : []
  for (const p of [...safePathB].reverse()) {
    nodes.push({role: 'path', persons: [p]})
  }

  if (home) {
    nodes.push({role: 'home', persons: [home]})
  }

  return nodes
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

        .section-heading {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--grampsjs-body-font-color-75, inherit);
          margin: 0 0 8px 0;
        }

        .breadcrumb-entry {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 4px;
          margin-bottom: 12px;
        }

        .breadcrumb-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          text-align: center;
          min-width: 48px;
          max-width: 72px;
        }

        .breadcrumb-node:hover .node-name {
          text-decoration: underline;
        }

        .node-avatar {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 4px;
        }

        .node-avatar grampsjs-img,
        .node-avatar grampsjs-icon {
          display: block;
        }

        .apex-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: default;
          text-align: center;
          max-width: 120px;
        }

        .apex-avatars {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 4px 6px;
          border-radius: 8px;
          background: var(
            --md-sys-color-secondary-container,
            rgba(0, 0, 0, 0.08)
          );
          outline: 1.5px solid
            var(--md-sys-color-secondary, rgba(0, 0, 0, 0.18));
          margin-bottom: 4px;
        }

        .apex-avatars .node-avatar {
          margin-bottom: 0;
          cursor: pointer;
        }

        .apex-names {
          font-size: 0.75rem;
          color: var(--grampsjs-body-font-color-75, inherit);
          line-height: 1.3;
          word-break: break-word;
        }

        .node-name {
          font-size: 0.75rem;
          line-height: 1.3;
          word-break: break-word;
          color: inherit;
        }

        .node-years {
          font-size: 0.68rem;
          opacity: 0.65;
          line-height: 1.2;
        }

        .node-sublabel {
          font-size: 0.68rem;
          opacity: 0.65;
          line-height: 1.2;
          font-style: italic;
        }

        .breadcrumb-connector {
          display: flex;
          align-items: center;
          padding-top: 10px;
          opacity: 0.45;
          font-size: 0.9rem;
          flex-shrink: 0;
          align-self: flex-start;
        }

        @media (max-width: 600px) {
          .node-name,
          .apex-names {
            font-size: 0.7rem;
          }

          .node-years,
          .node-sublabel {
            font-size: 0.65rem;
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
      _subject: {type: Object},
      _home: {type: Object},
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
    this._subject = null
    this._home = null
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
      this._subject = null
      this._home = null
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
      this._subject = result.data.subject ?? null
      this._home = result.data.home ?? null
    } else {
      this._error = true
      this._relationship = null
      this._ancestors = []
      this._subject = null
      this._home = null
    }
    this._loading = false
  }

  _navTo(grampsId) {
    if (grampsId) {
      fireEvent(this, 'nav', {path: `person/${grampsId}`})
    }
  }

  /**
   * Render a single person as a small circular avatar + name + years.
   * Clickable unless noClick is true (e.g. for apex paired avatars handled separately).
   */
  _renderPersonNode(person, {sublabel = '', noClick = false} = {}) {
    const name = personName(person)
    const years = lifeYears(person)
    const sex = person?.sex || 'U'
    const ringColor = genderBorderColor[sex] ?? 'var(--color-unknown)'
    const avatarStyle = `border-radius: 50%; width: 36px; height: 36px; box-shadow: 0 0 0 2px ${ringColor};`
    const handle = person?.media_list?.[0]?.ref || ''
    const rect = person?.media_list?.[0]?.rect || []

    const avatar = handle
      ? html`<grampsjs-img
          handle="${handle}"
          circle
          square
          size="36"
          .rect="${rect}"
          mime=""
          style="${avatarStyle}"
        ></grampsjs-img>`
      : html`<grampsjs-icon
          path="${mdiAccount}"
          color="var(--grampsjs-color-icon)"
          style="${avatarStyle}"
        ></grampsjs-icon>`

    if (noClick) {
      return html` <div class="node-avatar">${avatar}</div> `
    }

    return html`
      <div
        class="breadcrumb-node"
        role="button"
        tabindex="0"
        @click="${() => this._navTo(person?.gramps_id)}"
        @keydown="${e => {
          if (e.key === 'Enter' || e.key === ' ') this._navTo(person?.gramps_id)
        }}"
        title="${name}"
      >
        <div class="node-avatar">${avatar}</div>
        <span class="node-name">${name}</span>
        ${years ? html`<span class="node-years">${years}</span>` : ''}
        ${sublabel ? html`<span class="node-sublabel">${sublabel}</span>` : ''}
      </div>
    `
  }

  /**
   * Render an apex node (1 or 2 common ancestors).
   * Single ancestor: same layout as a regular node but with apex tint.
   * Paired apex: two avatars side by side in one tinted group.
   */
  _renderApexNode(persons) {
    if (!persons || persons.length === 0) return ''

    if (persons.length === 1) {
      const p = persons[0]
      const name = personName(p)
      const years = lifeYears(p)
      const sex = p?.sex || 'U'
      const ringColor = genderBorderColor[sex] ?? 'var(--color-unknown)'
      const avatarStyle = `border-radius: 50%; width: 36px; height: 36px; box-shadow: 0 0 0 2px ${ringColor};`
      const handle = p?.media_list?.[0]?.ref || ''
      const rect = p?.media_list?.[0]?.rect || []
      const avatar = handle
        ? html`<grampsjs-img
            handle="${handle}"
            circle
            square
            size="36"
            .rect="${rect}"
            mime=""
            style="${avatarStyle}"
          ></grampsjs-img>`
        : html`<grampsjs-icon
            path="${mdiAccount}"
            color="var(--grampsjs-color-icon)"
            style="${avatarStyle}"
          ></grampsjs-icon>`

      return html`
        <div
          class="breadcrumb-node"
          role="button"
          tabindex="0"
          @click="${() => this._navTo(p?.gramps_id)}"
          @keydown="${e => {
            if (e.key === 'Enter' || e.key === ' ') this._navTo(p?.gramps_id)
          }}"
          title="${name}"
        >
          <div
            class="node-avatar"
            style="padding: 4px 6px; border-radius: 8px; background: var(--md-sys-color-secondary-container, rgba(0,0,0,0.08)); outline: 1.5px solid var(--md-sys-color-secondary, rgba(0,0,0,0.18));"
          >
            ${avatar}
          </div>
          <span class="node-name">${name}</span>
          ${years ? html`<span class="node-years">${years}</span>` : ''}
        </div>
      `
    }

    // Paired apex: two persons (sibling/full-cousin case — shared parents)
    return html`
      <div class="apex-node">
        <div class="apex-avatars">
          ${persons.map(p => {
            const sex = p?.sex || 'U'
            const ringColor = genderBorderColor[sex] ?? 'var(--color-unknown)'
            const avatarStyle = `border-radius: 50%; width: 36px; height: 36px; box-shadow: 0 0 0 2px ${ringColor};`
            const handle = p?.media_list?.[0]?.ref || ''
            const rect = p?.media_list?.[0]?.rect || []
            const avatar = handle
              ? html`<grampsjs-img
                  handle="${handle}"
                  circle
                  square
                  size="36"
                  .rect="${rect}"
                  mime=""
                  style="${avatarStyle}"
                ></grampsjs-img>`
              : html`<grampsjs-icon
                  path="${mdiAccount}"
                  color="var(--grampsjs-color-icon)"
                  style="${avatarStyle}"
                ></grampsjs-icon>`
            return html`
              <div
                class="node-avatar"
                role="button"
                tabindex="0"
                @click="${() => this._navTo(p?.gramps_id)}"
                @keydown="${e => {
                  if (e.key === 'Enter' || e.key === ' ')
                    this._navTo(p?.gramps_id)
                }}"
                title="${personName(p)}"
                style="cursor: pointer;"
              >
                ${avatar}
              </div>
            `
          })}
        </div>
        <div class="apex-names">
          ${persons.map((p, i) => {
            const name = personName(p)
            const years = lifeYears(p)
            return html`${i > 0 ? html`<br />` : ''}${name}${years
              ? html`&nbsp;<span class="node-years">${years}</span>`
              : ''}`
          })}
        </div>
      </div>
    `
  }

  _renderEntry(entry) {
    // eslint-disable-next-line camelcase
    const {common_ancestors: ancestors, path_a: pathA, path_b: pathB} = entry
    const nodes = buildChain(this._subject, pathA, ancestors, pathB, this._home)
    if (nodes.length === 0) return ''

    const homeLabel = this._('Home person')

    const parts = []
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (i > 0) {
        parts.push(
          html`<span class="breadcrumb-connector" aria-hidden="true">›</span>`
        )
      }
      if (node.role === 'apex') {
        parts.push(this._renderApexNode(node.persons))
      } else {
        const sublabel = node.role === 'home' ? homeLabel : ''
        parts.push(this._renderPersonNode(node.persons[0], {sublabel}))
      }
    }

    return html`<div class="breadcrumb-entry">${parts}</div>`
  }

  render() {
    // Hide while loading or on error, and when there is no meaningful data
    if (this._loading || this._error) return html``
    if (!this._relationship || !this._ancestors.length) return html``

    return html`
      <div class="common-ancestors-block">
        <p class="section-heading">${this._('Common ancestors')}</p>
        ${this._ancestors.map(entry => this._renderEntry(entry))}
      </div>
    `
  }
}

window.customElements.define(
  'grampsjs-common-ancestors',
  GrampsjsCommonAncestors
)
