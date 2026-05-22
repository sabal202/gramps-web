/*
The dropdown menu for adding objects in the top app bar
*/

import {html, css, LitElement} from 'lit'
import {classMap} from 'lit/directives/class-map.js'

import '@material/web/checkbox/checkbox'
import '@material/web/button/outlined-button'
import '@material/web/menu/menu'
import '@material/web/menu/menu-item'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/textfield/outlined-text-field.js'

import {
  mdiRadioboxBlank,
  mdiTimelapse,
  mdiMinusCircle,
  mdiCheckCircle,
  mdiHelp,
  mdiChevronDoubleDown,
  mdiAdjust,
  mdiChevronDoubleUp,
  mdiAccount,
  mdiLinkVariant,
  mdiFormatListChecks,
  mdiClockOutline,
} from '@mdi/js'

import './GrampsjsFilters.js'
import './GrampsjsFilterTags.js'
import './GrampsjsTagsSmall.js'
import './GrampsjsIcon.js'
import {sharedStyles} from '../SharedStyles.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {clickKeyHandler, fireEvent, prettyTimeDiffTimestamp} from '../util.js'
import {
  ATTR,
  STATUS_VALUES,
  getAttr,
  getRelated,
  subtaskProgress,
  lastUpdate,
  filterTasks,
  sortTasks,
  groupTasks,
  assigneeOptions,
} from '../tasks.js'

class GrampsjsTasks extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        .tasks-list {
          font-size: 15px;
          margin-bottom: 85px;
        }

        .task-item {
          border-top: 1px solid var(--grampsjs-body-font-color-10);
          display: flex;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
          padding-left: 10px;
          gap: 8px;
        }

        .task-item:last-child {
          border-bottom: 1px solid var(--grampsjs-body-font-color-10);
        }

        h4 {
          font-family: var(--grampsjs-body-font-family);
          font-size: 14px;
          font-weight: 450;
          color: var(--grampsjs-body-font-color-70);
          text-transform: uppercase;
        }

        span.link {
          color: var(--mdc-theme-text-primary-on-background);
          padding: 0;
        }

        span.link:hover {
          text-decoration: none;
        }

        .item-content {
          padding: 14px 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
        }

        .status-icon {
          width: 32px;
          display: flex;
          align-items: center;
        }

        .title {
          white-space: normal;
          overflow-wrap: break-word;
          height: 100%;
          width: 100%;
          padding-right: 8px;
          flex: auto;
          word-wrap: break-word;
          hyphens: auto;
        }

        .tags {
          flex: auto;
          white-space: normal;
          overflow-wrap: break-word;
          word-wrap: break-word;
        }

        md-checkbox#select-all {
          margin-right: 16px;
        }

        .filters {
          margin-bottom: 32px;
        }

        .taskbar {
          padding-left: 10px;
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .status-icon grampsjs-icon {
          margin-right: 12px;
        }

        .success {
          color: var(--grampsjs-alert-success-font-color);
        }

        .done {
          color: var(--grampsjs-task-done);
        }

        .progress {
          color: var(--grampsjs-task-progress);
        }

        .open {
          color: var(--grampsjs-task-open);
        }

        .error,
        .blocked {
          color: var(--grampsjs-alert-error-font-color);
        }

        .warn {
          color: var(--grampsjs-alert-warn-font-color);
        }

        .strike {
          text-decoration: line-through !important;
        }

        .taskbar md-outlined-button {
          margin-right: 8px;
        }

        md-outlined-button {
          --md-outlined-button-outline-color: var(--md-sys-color-secondary);
          --md-outlined-button-label-text-color: var(--md-sys-color-secondary);
          --md-outlined-button-hover-outline-color: var(
            --md-sys-color-secondary
          );
          --md-outlined-button-focus-outline-color: var(
            --md-sys-color-secondary
          );
          --md-outlined-button-hover-label-text-color: var(
            --md-sys-color-secondary
          );
          --md-outlined-button-focus-label-text-color: var(
            --md-sys-color-secondary
          );
          --md-outlined-button-pressed-label-text-color: var(
            --md-sys-color-secondary
          );
        }

        md-checkbox {
          --md-sys-color-primary: var(--md-sys-color-secondary);
          --md-sys-color-on-primary: var(--md-sys-color-on-secondary);
        }

        .prio-icon grampsjs-icon {
          padding-left: 8px;
          position: relative;
          top: 2px;
        }

        grampsjs-tags-small {
          margin-left: 1em;
        }

        .task-meta {
          padding-right: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .meta-chip {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 13px;
          color: var(--grampsjs-body-font-color-60);
          white-space: nowrap;
        }

        .controlbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .controlbar md-outlined-text-field.search {
          flex: 1 1 220px;
          min-width: 180px;
        }

        .controlbar md-outlined-select {
          min-width: 140px;
        }

        h4.group-header {
          margin: 22px 0 4px 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        h4.group-header .group-count {
          font-size: 12px;
          font-weight: 400;
          color: var(--grampsjs-body-font-color-50);
          text-transform: none;
        }
      `,
    ]
  }

  static get properties() {
    return {
      data: {type: Array},
      _selected: {type: Array},
      _search: {type: String},
      _statusFilter: {type: String},
      _priorityFilter: {type: String},
      _assigneeFilter: {type: String},
      _sortKey: {type: String},
      _groupBy: {type: String},
    }
  }

  constructor() {
    super()
    this.data = []
    this._selected = []
    this._search = ''
    this._statusFilter = ''
    this._priorityFilter = ''
    this._assigneeFilter = ''
    this._sortKey = 'status'
    this._groupBy = 'none'
    this._visibleHandles = []
  }

  render() {
    const filtered = filterTasks(this.data, {
      search: this._search,
      status: this._statusFilter,
      priority: this._priorityFilter,
      assignee: this._assigneeFilter,
    })
    const sorted = sortTasks(filtered, this._sortKey)
    const groups = groupTasks(sorted, this._groupBy)
    this._visibleHandles = sorted.map(obj => obj.handle)
    return html`
      ${this._renderFilters()} ${this._renderControlBar()}
      ${this.appState.permissions.canEdit ? this._renderTaskBar() : ''}
      ${this._renderGroups(groups)}
    `
  }

  _renderControlBar() {
    const assignees = assigneeOptions(this.data)
    const sortOptions = [
      ['status', 'Status'],
      ['priority', 'Priority'],
      ['title', 'Title'],
      ['updated', 'Last updated'],
    ]
    const groupOptions = [
      ['none', 'None'],
      ['status', 'Status'],
      ['priority', 'Priority'],
      ['assignee', 'Assignee'],
    ]
    return html`
      <div class="controlbar">
        <md-outlined-text-field
          class="search"
          label="${this._('Search')}"
          .value="${this._search}"
          @input="${this._handleSearch}"
        ></md-outlined-text-field>
        <md-outlined-select
          label="${this._('Status')}"
          @change="${this._handleStatusFilter}"
        >
          <md-select-option value="" ?selected="${!this._statusFilter}">
            <div slot="headline">${this._('All')}</div>
          </md-select-option>
          ${STATUS_VALUES.map(
            status => html`
              <md-select-option
                value="${status}"
                ?selected="${this._statusFilter === status}"
              >
                <div slot="headline">${this._(status)}</div>
              </md-select-option>
            `
          )}
        </md-outlined-select>
        <md-outlined-select
          label="${this._('Priority')}"
          @change="${this._handlePriorityFilter}"
        >
          <md-select-option value="" ?selected="${!this._priorityFilter}">
            <div slot="headline">${this._('All')}</div>
          </md-select-option>
          <md-select-option
            value="1"
            ?selected="${this._priorityFilter === '1'}"
          >
            <div slot="headline">${this._('High')}</div>
          </md-select-option>
          <md-select-option
            value="5"
            ?selected="${this._priorityFilter === '5'}"
          >
            <div slot="headline">${this._('Medium')}</div>
          </md-select-option>
          <md-select-option
            value="9"
            ?selected="${this._priorityFilter === '9'}"
          >
            <div slot="headline">${this._('Low')}</div>
          </md-select-option>
        </md-outlined-select>
        ${assignees.length > 0
          ? html`
              <md-outlined-select
                label="${this._('Assignee')}"
                @change="${this._handleAssigneeFilter}"
              >
                <md-select-option value="" ?selected="${!this._assigneeFilter}">
                  <div slot="headline">${this._('All')}</div>
                </md-select-option>
                ${assignees.map(
                  name => html`
                    <md-select-option
                      value="${name}"
                      ?selected="${this._assigneeFilter === name}"
                    >
                      <div slot="headline">${name}</div>
                    </md-select-option>
                  `
                )}
              </md-outlined-select>
            `
          : ''}
        <md-outlined-select
          label="${this._('Sort by')}"
          @change="${this._handleSort}"
        >
          ${sortOptions.map(
            ([value, label]) => html`
              <md-select-option
                value="${value}"
                ?selected="${this._sortKey === value}"
              >
                <div slot="headline">${this._(label)}</div>
              </md-select-option>
            `
          )}
        </md-outlined-select>
        <md-outlined-select
          label="${this._('Group by')}"
          @change="${this._handleGroup}"
        >
          ${groupOptions.map(
            ([value, label]) => html`
              <md-select-option
                value="${value}"
                ?selected="${this._groupBy === value}"
              >
                <div slot="headline">${this._(label)}</div>
              </md-select-option>
            `
          )}
        </md-outlined-select>
      </div>
    `
  }

  _handleSearch(e) {
    this._search = e.target.value
  }

  _handleStatusFilter(e) {
    this._statusFilter = e.target.value
  }

  _handlePriorityFilter(e) {
    this._priorityFilter = e.target.value
  }

  _handleAssigneeFilter(e) {
    this._assigneeFilter = e.target.value
  }

  _handleSort(e) {
    this._sortKey = e.target.value
  }

  _handleGroup(e) {
    this._groupBy = e.target.value
  }

  _renderFilters() {
    return html`
      <div class="filters">
        <grampsjs-filters .appState="${this.appState}" objectType="sources">
          <grampsjs-filter-tags
            .appState="${this.appState}"
          ></grampsjs-filter-tags>
        </grampsjs-filters>
      </div>
    `
  }

  _renderTaskBar() {
    return html`
      <div class="taskbar">
        <md-checkbox
          id="select-all"
          @change="${this._handleSelectAll}"
          ?checked=${this._selected.length > 0}
        ></md-checkbox>
        <div style="position: relative; display: inline-block;">
          <md-outlined-button
            id="prio-btn"
            class="edit"
            ?disabled="${this._selected.length === 0}"
            @click="${this._handleSetPrioClick}"
            >${this._('Set Priority')}</md-outlined-button
          >
          <md-menu id="prio-menu" anchor="prio-btn">
            <md-menu-item @click="${() => this._handlePrioSet('1')}">
              <div slot="headline">${this._('High')}</div>
            </md-menu-item>
            <md-menu-item @click="${() => this._handlePrioSet('5')}">
              <div slot="headline">${this._('Medium')}</div>
            </md-menu-item>
            <md-menu-item @click="${() => this._handlePrioSet('9')}">
              <div slot="headline">${this._('Low')}</div>
            </md-menu-item>
          </md-menu>
        </div>
        <div style="position: relative; display: inline-block;">
          <md-outlined-button
            id="status-btn"
            class="edit"
            ?disabled="${this._selected.length === 0}"
            @click="${this._handleSetStatusClick}"
            >${this._('Set Status')}</md-outlined-button
          >
          <md-menu id="status-menu" anchor="status-btn">
            <md-menu-item @click="${() => this._handleStatusSet('Open')}">
              <div slot="headline">${this._('Open')}</div>
            </md-menu-item>
            <md-menu-item
              @click="${() => this._handleStatusSet('In Progress')}"
            >
              <div slot="headline">${this._('In Progress')}</div>
            </md-menu-item>
            <md-menu-item @click="${() => this._handleStatusSet('Blocked')}">
              <div slot="headline">${this._('Blocked')}</div>
            </md-menu-item>
            <md-menu-item @click="${() => this._handleStatusSet('Done')}">
              <div slot="headline">${this._('Done')}</div>
            </md-menu-item>
          </md-menu>
        </div>
      </div>
    `
  }

  _handlePrioSet(value) {
    if (value) {
      this._updateAttributes(this._selected, 'Priority', value)
    }
    this._selected = []
  }

  _handleSetPrioClick() {
    const menu = this.renderRoot.getElementById('prio-menu')
    menu.open = true
  }

  _handleStatusSet(value) {
    if (value) {
      this._updateAttributes(this._selected, 'Status', value)
    }
    this._selected = []
  }

  _handleSetStatusClick() {
    const menu = this.renderRoot.getElementById('status-menu')
    menu.open = true
  }

  _renderGroups(groups) {
    return html`
      <div class="tasks-list" id="all-tasks">
        ${groups.map(
          group => html`
            ${group.key !== null
              ? html`<h4 class="group-header">
                  ${this._groupLabel(group.key)}
                  <span class="group-count">${group.items.length}</span>
                </h4>`
              : ''}
            ${group.items.map(obj => this._renderTask(obj))}
          `
        )}
      </div>
    `
  }

  _groupLabel(key) {
    if (this._groupBy === 'priority') {
      return (
        {1: this._('High'), 5: this._('Medium'), 9: this._('Low')}[key] ||
        this._('None')
      )
    }
    if (this._groupBy === 'assignee') {
      return key === '' ? this._('Unassigned') : key
    }
    if (key === 'other') {
      return this._('Unknown')
    }
    return this._(key)
  }

  _handleItemCheck(e, handle) {
    if (e.target.checked) {
      if (!this._selected.includes(handle)) {
        this._selected = [...this._selected, handle]
      }
    } else {
      this._selected = this._selected.filter(h => h !== handle)
    }
  }

  _handleSelectAll() {
    if (this._selected.length === 0) {
      this._selected = [...this._visibleHandles]
    } else {
      this._selected = []
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _statusIcon(status, handle) {
    const id = `status-icon-${handle}`
    const icons = {
      Open: html`<grampsjs-icon
        path="${mdiRadioboxBlank}"
        color="var(--grampsjs-task-open)"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
      'In Progress': html`<grampsjs-icon
        path="${mdiTimelapse}"
        color="var(--grampsjs-task-progress)"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
      Blocked: html`<grampsjs-icon
        path="${mdiMinusCircle}"
        color="var(--grampsjs-alert-error-font-color)"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
      Done: html`<grampsjs-icon
        path="${mdiCheckCircle}"
        color="var(--grampsjs-task-done)"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
      unknown: html`<grampsjs-icon
        path="${mdiHelp}"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
    }
    const icon = icons[status] || icons.unknown
    return html`
      ${icon}
      <grampsjs-tooltip for="${id}" .appState="${this.appState}"
        >${this._(status)}</grampsjs-tooltip
      >
    `
  }

  // eslint-disable-next-line class-methods-use-this
  _priorityIcon(priority, handle) {
    const id = `priority-icon-${handle}`
    let label = ''
    if (priority > 5) {
      label = 'Low'
    } else if (priority === '5') {
      label = 'Medium'
    } else if (priority < 5) {
      label = 'High'
    } else {
      return ''
    }
    const icons = {
      Low: html`<grampsjs-icon
        path="${mdiChevronDoubleDown}"
        color="var(--grampsjs-alert-success-font-color)"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
      Medium: html`<grampsjs-icon
        path="${mdiAdjust}"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
      High: html`<grampsjs-icon
        path="${mdiChevronDoubleUp}"
        color="var(--grampsjs-alert-error-font-color)"
        id="${id}"
        height="20"
        width="20"
      ></grampsjs-icon>`,
    }
    const icon = icons[label]
    return html`
      <span class="priority-label">
        ${icon}
        <grampsjs-tooltip for="${id}" .appState="${this.appState}"
          >${this._('Priority')}: ${this._(label)}</grampsjs-tooltip
        >
      </span>
    `
  }

  // eslint-disable-next-line class-methods-use-this
  _getAttribute(obj, key) {
    return obj.attribute_list.filter(att => att.type === key)[0]?.value
  }

  _renderTask(obj) {
    const status = this._getAttribute(obj, 'Status')
    const priority = this._getAttribute(obj, 'Priority')
    return html`
      <div
        class="task-item"
        @keydown="${e => this._handleListKeyDown(e, obj.gramps_id)}"
      >
        <md-checkbox
          ?checked="${this._selected.includes(obj.handle)}"
          @change="${e => this._handleItemCheck(e, obj.handle)}"
        ></md-checkbox>
        <div class="item-content">
          <div class="status-icon">${this._statusIcon(status, obj.handle)}</div>
          <div class="title">
            <span
              class="${classMap({
                link: true,
                strike: status === 'Done',
              })}"
              @click="${e => this._handleTitleClick(e, obj.gramps_id)}"
              @keydown="${clickKeyHandler}"
              >${obj.title}</span
            >
            <grampsjs-tags-small
              .data="${obj.extended.tags.filter(tag => tag.name !== 'ToDo')}"
            ></grampsjs-tags-small>
          </div>
        </div>
        <div class="task-meta">
          ${this._renderRowMeta(obj)}
          <span class="prio-icon"
            >${this._priorityIcon(priority, obj.handle)}</span
          >
        </div>
      </div>
    `
  }

  _renderRowMeta(obj) {
    const assignee = getAttr(obj, ATTR.assignee)
    const {done, total} = subtaskProgress(obj)
    const relatedCount = getRelated(obj).length
    const updated = lastUpdate(obj)
    return html`
      ${assignee
        ? html`<span class="meta-chip" title="${this._('Assignee')}">
            <grampsjs-icon
              path="${mdiAccount}"
              height="16"
              width="16"
            ></grampsjs-icon
            >${assignee}</span
          >`
        : ''}
      ${total > 0
        ? html`<span class="meta-chip" title="${this._('Subtasks')}">
            <grampsjs-icon
              path="${mdiFormatListChecks}"
              height="16"
              width="16"
            ></grampsjs-icon
            >${done}/${total}</span
          >`
        : ''}
      ${relatedCount > 0
        ? html`<span class="meta-chip" title="${this._('Related records')}">
            <grampsjs-icon
              path="${mdiLinkVariant}"
              height="16"
              width="16"
            ></grampsjs-icon
            >${relatedCount}</span
          >`
        : ''}
      ${updated
        ? html`<span class="meta-chip" title="${this._('Last updated')}">
            <grampsjs-icon
              path="${mdiClockOutline}"
              height="16"
              width="16"
            ></grampsjs-icon
            >${this._relativeTime(updated)}</span
          >`
        : ''}
    `
  }

  _relativeTime(isoDate) {
    const timestamp = Date.parse(isoDate)
    if (Number.isNaN(timestamp)) {
      return ''
    }
    return prettyTimeDiffTimestamp(
      Math.floor(timestamp / 1000),
      this.appState.i18n.lang || 'en'
    )
  }

  _handleTitleClick(e, grampsId) {
    fireEvent(this, 'nav', {path: `task/${grampsId}`})
    e.stopPropagation()
  }

  _handleListKeyDown(e, grampsId) {
    if (e.key === 'ArrowRight') {
      fireEvent(this, 'nav', {path: `task/${grampsId}`})
    }
  }

  async _updateAttributes(handles, key, value) {
    const objects = this.data.filter(obj => handles.includes(obj.handle))
    fireEvent(this, 'tasks:update-attribute', {objects, key, value})
  }
}

window.customElements.define('grampsjs-tasks', GrampsjsTasks)
