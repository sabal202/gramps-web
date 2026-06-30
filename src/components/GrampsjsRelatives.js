import {css, html, LitElement} from 'lit'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'
import '@material/web/textfield/outlined-text-field.js'

import {fireEvent} from '../util.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {renderPersonListItem} from './personListUtils.js'
import {sharedStyles} from '../SharedStyles.js'

/**
 * Map from stable category_key (sent by backend) to the i18n string key used
 * for the group section header.  Keys are the English display strings from
 * lang/en.json — passed through this._() at render time.
 *
 * For keys NOT present in this map (e.g. dynamic ones like "ancestors_5" or
 * "cousins_3_removed_2") we fall back to _categoryFallback() which returns a
 * human-readable label constructed from the key segments so nothing ever
 * displays a raw machine key.
 */
export const CATEGORY_LABEL_MAP = {
  parents: 'Parents',
  children: 'Children',
  grandparents: 'Grandparents',
  grandchildren: 'Grandchildren',
  great_grandparents: 'Great-grandparents',
  great_grandchildren: 'Great-grandchildren',
  siblings: 'Siblings',
  uncle_aunt: 'Uncles and aunts',
  niece_nephew: 'Nieces and nephews',
  great_uncle_aunt_1: 'Great-uncles and great-aunts',
  great_niece_nephew_1: 'Great-nieces and great-nephews',
  cousins_1: 'First cousins',
  cousins_2: 'Second cousins',
  cousins_3: 'Third cousins',
  cousins_1_removed_1: 'First cousins once removed',
  cousins_1_removed_2: 'First cousins twice removed',
  cousins_2_removed_1: 'Second cousins once removed',
  inlaw: 'In-laws',
}

/**
 * Fallback label builder for category keys not in CATEGORY_LABEL_MAP.
 *
 * Strategy: parse the key by parts and produce a reasonable English phrase.
 * Examples:
 *   "ancestors_5"           → "5th ancestors"
 *   "descendants_4"         → "4th descendants"
 *   "great_uncle_aunt_3"    → "3× great-uncles and great-aunts"
 *   "cousins_3_removed_2"   → "3rd cousins 2× removed"
 *
 * If parsing yields nothing useful we return "Other relatives".
 *
 * @param {string} key
 * @returns {string}
 */
export function categoryFallbackLabel(key) {
  if (!key) return 'Other relatives'

  // ancestors_N / descendants_N
  const ancestorMatch = key.match(/^(ancestors|descendants)_(\d+)$/)
  if (ancestorMatch) {
    const n = parseInt(ancestorMatch[2], 10)
    const base = ancestorMatch[1] === 'ancestors' ? 'ancestors' : 'descendants'
    return `${ordinal(n)} ${base}`
  }

  // great_uncle_aunt_N  /  great_niece_nephew_N
  const greatUncleMatch = key.match(/^great_(uncle_aunt|niece_nephew)_(\d+)$/)
  if (greatUncleMatch) {
    const n = parseInt(greatUncleMatch[2], 10)
    const base =
      greatUncleMatch[1] === 'uncle_aunt'
        ? 'great-uncles and great-aunts'
        : 'great-nieces and great-nephews'
    return `${n}× ${base}`
  }

  // cousins_N_removed_M
  const cousinRemovedMatch = key.match(/^cousins_(\d+)_removed_(\d+)$/)
  if (cousinRemovedMatch) {
    const c = parseInt(cousinRemovedMatch[1], 10)
    const r = parseInt(cousinRemovedMatch[2], 10)
    return `${ordinal(c)} cousins ${r}× removed`
  }

  // cousins_N
  const cousinMatch = key.match(/^cousins_(\d+)$/)
  if (cousinMatch) {
    const n = parseInt(cousinMatch[1], 10)
    return `${ordinal(n)} cousins`
  }

  return 'Other relatives'
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/**
 * Client-side filter predicate: returns true if the person matches the query.
 * Matches are case-insensitive against the full name (given + surname) and
 * the localized relationship term.
 *
 * @param {object} person  - person object from the API response
 * @param {string} query   - the current filter string
 * @returns {boolean}
 */
export function personMatchesFilter(person, query) {
  if (!query) return true
  const q = query.toLowerCase()
  const name = `${person.name_given || ''} ${
    person.name_surname || ''
  }`.toLowerCase()
  const rel = (person.relationship || '').toLowerCase()
  return name.includes(q) || rel.includes(q)
}

export class GrampsjsRelatives extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
        }

        .filter-row {
          margin-bottom: 16px;
        }

        md-outlined-text-field {
          width: 100%;
          max-width: 420px;
        }

        h3 {
          margin: 24px 0 4px 0;
          font-family: var(--grampsjs-heading-font-family);
          font-weight: 500;
          font-size: 1rem;
          color: var(--grampsjs-body-font-color-75, inherit);
        }

        .group-count {
          font-size: 0.8em;
          font-weight: 400;
          opacity: 0.6;
          margin-left: 6px;
        }

        .inlaw-section h3 {
          border-top: 1px solid
            var(--md-sys-color-outline-variant, rgba(0, 0, 0, 0.12));
          padding-top: 12px;
          margin-top: 28px;
        }

        .empty-message,
        .error-message {
          margin: 32px 0;
          opacity: 0.6;
          font-style: italic;
        }

        md-list {
          padding: 0;
        }

        md-list-item {
          cursor: pointer;
        }

        @media (max-width: 600px) {
          md-outlined-text-field {
            max-width: 100%;
          }

          h3 {
            font-size: 0.95rem;
          }
        }
      `,
    ]
  }

  static get properties() {
    return {
      groups: {type: Array},
      anchor: {type: Object},
      error: {type: Boolean},
      _filter: {type: String},
    }
  }

  constructor() {
    super()
    this.groups = []
    this.anchor = null
    this.error = false
    this._filter = ''
  }

  _categoryLabel(key) {
    const mapKey = CATEGORY_LABEL_MAP[key]
    if (mapKey) return this._(mapKey)
    return categoryFallbackLabel(key)
  }

  _handleClick(grampsId) {
    if (grampsId) {
      fireEvent(this, 'nav', {path: `person/${grampsId}`})
    }
  }

  _handleFilterInput(e) {
    this._filter = e.target.value
  }

  render() {
    if (this.error) {
      return html`<p class="error-message">
        ${this._('Error loading relatives.')}
      </p>`
    }

    const query = this._filter.trim()
    const visibleGroups = this.groups
      .map(group => ({
        ...group,
        filteredPeople: query
          ? group.people.filter(p => personMatchesFilter(p, query))
          : group.people,
      }))
      .filter(group => group.filteredPeople.length > 0)

    const bloodGroups = visibleGroups.filter(g => g.kind !== 'inlaw')
    const inlawGroups = visibleGroups.filter(g => g.kind === 'inlaw')

    const hasAny = this.groups.some(g => g.people.length > 0)

    return html`
      <div class="filter-row">
        <md-outlined-text-field
          label="${this._('Filter by name or relationship')}"
          .value="${this._filter}"
          @input="${this._handleFilterInput}"
          type="search"
        ></md-outlined-text-field>
      </div>

      ${!hasAny
        ? html`<p class="empty-message">${this._('No relatives found.')}</p>`
        : ''}
      ${query && visibleGroups.length === 0 && hasAny
        ? html`<p class="empty-message">
            ${this._('No relatives match the filter.')}
          </p>`
        : ''}
      ${bloodGroups.map(group => this._renderGroup(group))}
      ${inlawGroups.map(
        group =>
          html`<div class="inlaw-section">${this._renderGroup(group)}</div>`
      )}
    `
  }

  _renderGroup(group) {
    return html`
      <h3>
        ${this._categoryLabel(group.category_key)}
        <span class="group-count">(${group.filteredPeople.length})</span>
      </h3>
      <md-list>
        ${group.filteredPeople.map(
          person => html`
            <md-list-item
              type="button"
              @click="${() => this._handleClick(person.gramps_id)}"
            >
              ${renderPersonListItem({
                profile: person,
                extPerson: person,
                supportingText: person.relationship
                  ? html`<span slot="supporting-text"
                      >${person.relationship}</span
                    >`
                  : '',
              })}
            </md-list-item>
          `
        )}
      </md-list>
    `
  }
}

window.customElements.define('grampsjs-relatives', GrampsjsRelatives)
