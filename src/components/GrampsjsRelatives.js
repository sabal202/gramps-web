import {css, html, LitElement} from 'lit'
import {classMap} from 'lit/directives/class-map.js'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'

import {fireEvent} from '../util.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {renderPersonListItem} from './personListUtils.js'
import {sharedStyles} from '../SharedStyles.js'
import {buildDistantLabel} from './relativesLabels.js'

/**
 * Map from stable category_key (sent by backend) to the i18n string key used
 * for the group section header.  Keys are the English display strings from
 * lang/en.json — passed through this._() at render time.
 *
 * For keys NOT present in this map the component falls back to the translatable
 * "Distant relatives" label via categoryLabelKey().
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
}

/**
 * Return the i18n key string for a category_key.
 *
 * Known categories return their mapped English key (from CATEGORY_LABEL_MAP).
 * All unmapped categories — distant cousins, ancestors_N, etc. — return the
 * single translatable key 'Distant relatives' so no English is ever constructed
 * in JS.
 *
 * @param {string} key
 * @returns {string}
 */
export function categoryLabelKey(key) {
  return CATEGORY_LABEL_MAP[key] || 'Distant relatives'
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

/**
 * Build a table-of-contents entry list from the already-filtered visible
 * groups.  Pure function with no side effects — safe to unit-test directly.
 *
 * Each entry contains:
 *   key   {string}  — stable category_key, used as the scroll-target anchor id
 *   label {string}  — localised display label (English fallback when no
 *                     translation function is provided)
 *   count {number}  — number of people after client-side filtering
 *
 * @param {Array<{category_key: string, filteredPeople: Array}>} visibleGroups
 *   The same visibleGroups array that render() passes to _renderGroup().
 * @param {(key: string) => string} [labelFn]
 *   Optional label resolver.  When omitted the English i18n key string from
 *   categoryLabelKey() is returned as-is.
 * @returns {Array<{key: string, label: string, count: number}>}
 */
export function buildToc(visibleGroups, labelFn) {
  if (!Array.isArray(visibleGroups) || visibleGroups.length === 0) return []
  const resolve = labelFn || categoryLabelKey
  return visibleGroups.map(g => ({
    key: g.category_key,
    label: resolve(g.category_key),
    count: Array.isArray(g.filteredPeople) ? g.filteredPeople.length : 0,
  }))
}

/**
 * Estimated height per md-list-item row in pixels.
 * md-list-item one-line height = 56 px, supporting-text (two-line) = 72 px.
 * We use 72 px because relatives items show a relationship term below the name.
 *
 * Used as the intrinsic-size hint in `contain-intrinsic-size: auto <N>px`.
 * The `auto` keyword lets the browser cache the last-rendered size and fall
 * back to the estimate only for groups that have not yet been painted, so the
 * scrollbar stays accurate after filter changes.
 */
const ROW_HEIGHT_PX = 72

export class GrampsjsRelatives extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        :host {
          display: block;
          container-type: inline-size;
        }

        .filter-row {
          margin-bottom: 16px;
        }

        md-outlined-text-field {
          width: 100%;
          max-width: 420px;
        }

        /* ------------------------------------------------------------------ */
        /* Two-column layout: list (left) + TOC sidebar (right)                */
        /* ------------------------------------------------------------------ */

        .relatives-layout {
          display: flex;
          align-items: flex-start;
          gap: 0;
        }

        .relatives-content {
          flex: 1 1 0;
          min-width: 0;
        }

        /* TOC sidebar — hidden on narrow screens, shown via @container below */
        .toc-sidebar {
          display: none;
          width: 200px;
          flex-shrink: 0;
          margin-left: 32px;
          position: sticky;
          top: 100px;
          height: fit-content;
          overflow-x: hidden;
        }

        .toc-sidebar h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
          font-weight: 450;
          opacity: 0.55;
          font-family: var(--grampsjs-heading-font-family);
        }

        .toc-sidebar ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .toc-sidebar li {
          margin: 0;
          padding: 0;
        }

        .toc-sidebar button {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          cursor: pointer;
          padding: 5px 8px;
          font-size: 13px;
          font-family: inherit;
          color: var(--md-sys-color-on-surface-variant);
          border-radius: 4px;
          line-height: 1.3;
          transition: background 0.1s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .toc-sidebar button:hover {
          background: var(--md-sys-color-surface-container-high);
          color: var(--md-sys-color-on-surface);
        }

        .toc-count {
          font-size: 0.85em;
          opacity: 0.6;
          margin-left: 4px;
        }

        /* Narrow-screen TOC: compact sticky jump-to selector */
        .toc-select-row {
          display: none;
          position: sticky;
          /* 64px = app-bar height; match top offset of the linear-progress bar */
          top: 64px;
          z-index: 1;
          background: var(--md-sys-color-surface);
          padding-bottom: 8px;
          margin-bottom: 4px;
        }

        .toc-select-row md-outlined-select {
          width: 100%;
          max-width: 420px;
        }

        /* ------------------------------------------------------------------ */
        /* Group headers                                                        */
        /* ------------------------------------------------------------------ */

        h3 {
          margin: 24px 0 4px 0;
          font-family: var(--grampsjs-heading-font-family);
          font-weight: 500;
          font-size: 1rem;
          color: var(--grampsjs-body-font-color-75, inherit);
          /* leave room so sticky app-bar doesn't cover the heading */
          scroll-margin-top: 100px;
        }

        .group-count {
          font-size: 0.8em;
          font-weight: 400;
          opacity: 0.6;
          margin-left: 6px;
        }

        /* Relationship text for in-law people: muted + italic.           */
        /* Applied to the <span slot="supporting-text"> inside the row.  */
        .inlaw-rel {
          opacity: 0.6;
          font-style: italic;
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

        /* ------------------------------------------------------------------ */
        /* Responsive breakpoints via @container                               */
        /* ------------------------------------------------------------------ */

        /* Wide layout: show sidebar TOC, hide select */
        @container (min-width: 750px) {
          .toc-sidebar {
            display: block;
          }

          .toc-select-row {
            display: none;
          }
        }

        /* Narrow layout: hide sidebar TOC, show select */
        @container (max-width: 749px) {
          .toc-sidebar {
            display: none;
          }

          .toc-select-row {
            display: block;
          }

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
    const lang = this.appState?.i18n?.lang || ''
    return buildDistantLabel(key, lang) ?? this._(categoryLabelKey(key))
  }

  _handleClick(grampsId) {
    if (grampsId) {
      fireEvent(this, 'nav', {path: `person/${grampsId}`})
    }
  }

  _handleFilterInput(e) {
    this._filter = e.target.value
  }

  /** Scroll to the group header identified by category_key. */
  _scrollToGroup(key) {
    const target = this.shadowRoot?.getElementById(`group-${key}`)
    if (target) {
      target.scrollIntoView({behavior: 'smooth', block: 'start'})
    }
  }

  /** Handle sidebar TOC button click. */
  _handleTocClick(key) {
    this._scrollToGroup(key)
  }

  /** Handle narrow-screen select change. */
  _handleTocSelectChange(e) {
    const key = e.target.value
    if (key) this._scrollToGroup(key)
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

    const hasAny = this.groups.some(g => g.people.length > 0)

    const tocEntries = buildToc(visibleGroups, k => this._categoryLabel(k))

    return html`
      <div class="filter-row">
        <md-outlined-text-field
          label="${this._('Filter by name or relationship')}"
          .value="${this._filter}"
          @input="${this._handleFilterInput}"
          type="search"
        ></md-outlined-text-field>
      </div>

      ${tocEntries.length > 1
        ? html`
            <div class="toc-select-row">
              <md-outlined-select
                label="${this._('Table Of Contents')}"
                @change="${this._handleTocSelectChange}"
              >
                ${tocEntries.map(
                  entry => html`
                    <md-select-option value="${entry.key}">
                      <div slot="headline">
                        ${entry.label}
                        <span class="toc-count">(${entry.count})</span>
                      </div>
                    </md-select-option>
                  `
                )}
              </md-outlined-select>
            </div>
          `
        : ''}
      ${!hasAny
        ? html`<p class="empty-message">${this._('No relatives found.')}</p>`
        : ''}
      ${query && visibleGroups.length === 0 && hasAny
        ? html`<p class="empty-message">
            ${this._('No relatives match the filter.')}
          </p>`
        : ''}

      <div class="relatives-layout">
        <div class="relatives-content">
          ${visibleGroups.map(group => this._renderGroup(group))}
        </div>

        ${tocEntries.length > 1
          ? html`
              <nav
                class="toc-sidebar"
                aria-label="${this._('Table Of Contents')}"
              >
                <h3>${this._('Table Of Contents')}</h3>
                <ul>
                  ${tocEntries.map(
                    entry => html`
                      <li>
                        <button
                          @click="${() => this._handleTocClick(entry.key)}"
                        >
                          ${entry.label}
                          <span class="toc-count">(${entry.count})</span>
                        </button>
                      </li>
                    `
                  )}
                </ul>
              </nav>
            `
          : ''}
      </div>
    `
  }

  _renderGroup(group) {
    // Estimated height for content-visibility contain-intrinsic-size.
    // Gives the browser an accurate off-screen placeholder so the scrollbar
    // does not jump when groups enter the viewport.
    const estimatedHeightPx = group.filteredPeople.length * ROW_HEIGHT_PX

    return html`
      <h3 id="group-${group.category_key}">
        ${this._categoryLabel(group.category_key)}
        <span class="group-count">(${group.filteredPeople.length})</span>
      </h3>
      <md-list
        style="content-visibility: auto; contain-intrinsic-size: auto ${estimatedHeightPx}px;"
      >
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
                  ? html`<span
                      slot="supporting-text"
                      class=${classMap({'inlaw-rel': person.kind === 'inlaw'})}
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
