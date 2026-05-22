import {html, css, LitElement} from 'lit'
import {classMap} from 'lit/directives/class-map.js'
import {live} from 'lit/directives/live.js'
import {mdiPencil, mdiPencilOff, mdiPlus, mdiDelete, mdiSend} from '@mdi/js'
import {sharedStyles} from '../SharedStyles.js'

import '@material/mwc-button'
import '@material/mwc-icon'
import '@material/mwc-select'
import '@material/mwc-list'
import '@material/mwc-list/mwc-list-item'
import '@material/web/checkbox/checkbox.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/iconbutton/icon-button.js'

import './GrampsjsEditor.js'
import './GrampsjsImg.js'
import './GrampsjsGallery.js'
import './GrampsjsTags.js'
import './GrampsjsTooltip.js'
import './GrampsjsNoteContent.js'
import './GrampsjsConnectedNote.js'
import './GrampsjsBreadcrumbs.js'
import './GrampsjsIcon.js'
import './GrampsjsFormSelectObject.js'
import './GrampsjsSearchResultList.js'
import {GrampsjsAppStateMixin} from '../mixins/GrampsjsAppStateMixin.js'
import {debounce, fireEvent, objectTypeToEndpoint} from '../util.js'
import {renderIconSvg} from '../icons.js'
import {
  ATTR,
  srcAttribute,
  getAttr,
  getRelated,
  getSubtasks,
  subtaskProgress,
  getUpdates,
  sortUpdates,
  formatSubtask,
  formatRelated,
  formatUpdate,
} from '../tasks.js'

export class GrampsjsTask extends GrampsjsAppStateMixin(LitElement) {
  static get styles() {
    return [
      sharedStyles,
      css`
        #btn-details {
          margin-top: 2em;
        }

        h2#title {
          display: block;
          border-radius: 5px;
          padding: 5px 10px;
          margin-left: -10px;
        }

        .dropdowns {
          margin-top: 48px;
          --mdc-select-outlined-disabled-border-color: var(
            --grampsjs-body-font-color-38
          );
          --mdc-select-disabled-ink-color: var(--grampsjs-body-font-color-87);
          --mdc-select-disabled-dropdown-icon-color: var(
            --grampsjs-color-shade-255
          );
        }

        .dropdowns mwc-select {
          margin-right: 12px;
          margin-bottom: 18px;
        }

        h3 {
          margin-top: 2em;
        }

        .controls {
          margin: 0.7em 0;
        }

        .muted {
          opacity: 0.4;
        }

        h3 .counter {
          font-size: 0.7em;
          font-weight: 400;
          color: var(--grampsjs-body-font-color-60);
          margin-left: 0.4em;
        }

        md-outlined-select,
        .assignee-field {
          min-width: 240px;
        }

        .subtask-item {
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 36px;
        }

        .subtask-text {
          flex: 1;
        }

        .add-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }

        .add-field {
          flex: 1;
          max-width: 480px;
        }

        .strike {
          text-decoration: line-through;
          opacity: 0.55;
        }

        .updates {
          margin-top: 12px;
        }

        .update-item {
          border-left: 2px solid var(--grampsjs-body-font-color-10);
          padding: 2px 0 10px 12px;
          margin-bottom: 8px;
        }

        .update-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85em;
          color: var(--grampsjs-body-font-color-60);
        }

        .update-author {
          font-weight: 500;
          color: var(--grampsjs-body-font-color-70);
        }

        .update-text {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          margin-top: 2px;
        }

        md-checkbox {
          --md-sys-color-primary: var(--md-sys-color-secondary);
          --md-sys-color-on-primary: var(--md-sys-color-on-secondary);
        }
      `,
    ]
  }

  static get properties() {
    return {
      source: {type: Object},
      note: {type: Object},
      dialogContent: {type: String},
      _editingNote: {type: Boolean},
      _editingGallery: {type: Boolean},
      _members: {type: Array},
      _currentUser: {type: String},
      _relatedObjects: {type: Array},
    }
  }

  constructor() {
    super()
    this.source = {}
    this.note = {}
    this.dialogContent = ''
    this._editingNote = false
    this._editingGallery = false
    this._members = []
    this._currentUser = ''
    this._relatedObjects = []
  }

  get canEdit() {
    return this.appState.permissions.canEdit
  }

  render() {
    if (Object.keys(this.source).length === 0) {
      return html``
    }
    return html`
      <grampsjs-breadcrumbs
        .data="${this.source}"
        .appState="${this.appState}"
        objectsName="Tasks"
        objectIcon="checklist"
        hideBookmark
        hideLock
      ></grampsjs-breadcrumbs>
      <h2
        id="title"
        class="${classMap({editable: this.canEdit})}"
        contenteditable="${this.canEdit}"
        @input="${debounce(() => this._handleEditTitle(), 500)}"
        .innerText="${live(this.source.title)}"
      >
        &nbsp;
      </h2>

      <p class="dropdowns">
        <mwc-select
          outlined
          ?disabled="${!this.canEdit}"
          label="${this._('Status')}"
          id="select-status"
          @change="${this._handleStatusChange}"
        >
          ${['Open', 'In Progress', 'Blocked', 'Done'].map(
            status => html`
              <mwc-list-item
                value="${status}"
                ?selected="${this._status === status}"
                >${this._(status)}</mwc-list-item
              >
            `
          )}
        </mwc-select>
        <mwc-select
          outlined
          ?disabled="${!this.canEdit}"
          label="${this._('Priority')}"
          id="select-priority"
          @change="${this._handlePrioChange}"
        >
          <mwc-list-item value="1" ?selected="${this._priority < 5}"
            >${this._('High')}</mwc-list-item
          >
          <mwc-list-item value="5" ?selected="${this._priority === '5'}"
            >${this._('Medium')}</mwc-list-item
          >
          <mwc-list-item value="9" ?selected="${this._priority > 5}"
            >${this._('Low')}</mwc-list-item
          >
        </mwc-select>
      </p>

      <h3>${this._('Description')}</h3>
      <p>
        ${this.source?.note_list?.length > 0
          ? html` ${this._editingNote
              ? html`
                  <grampsjs-editor
                    id="task-note-editor"
                    .initialData=${this.source.extended.notes[0].text}
                    .appState="${this.appState}"
                  ></grampsjs-editor>
                `
              : html`
                  <grampsjs-connected-note
                    handle="${this.source.note_list[0]}"
                    .appState="${this.appState}"
                  ></grampsjs-connected-note>
                `}`
          : html`${this._editingNote
              ? html`<grampsjs-editor
                  id="task-note-editor"
                  .appState="${this.appState}"
                ></grampsjs-editor>`
              : html`<span class="muted">${this._('None')}</span>`}`}
        ${this.canEdit
          ? html`
              <div class="controls">
                ${this._editingNote
                  ? html`
                      <mwc-icon-button
                        class="edit"
                        id="btn-save-note"
                        icon="save"
                        @click="${this._handleSaveNote}"
                      ></mwc-icon-button>
                      <grampsjs-tooltip for="btn-save-note"
                        >${this._('_Save')}</grampsjs-tooltip
                      >
                      <mwc-icon-button
                        class="edit"
                        id="btn-cancel-note"
                        icon="clear"
                        @click="${this._handleCancelNote}"
                      ></mwc-icon-button>
                      <grampsjs-tooltip for="btn-cancel-note"
                        >${this._('Cancel')}</grampsjs-tooltip
                      >
                    `
                  : html`
                      <mwc-icon-button
                        id="btn-edit-note"
                        class="edit"
                        icon="edit"
                        @click="${this._handleEditNote}"
                      ></mwc-icon-button>
                      <grampsjs-tooltip for="btn-edit-note"
                        >${this._('Edit Note')}</grampsjs-tooltip
                      >
                    `}
              </div>
            `
          : ''}
      </p>
      <h3>${this._('Attachments')}</h3>
      ${this.source?.media_list?.length === 0 && !this._editingGallery
        ? html`<p><span class="muted">${this._('None')}</span></p>`
        : html`
            <grampsjs-gallery
              ?edit="${this._editingGallery}"
              .appState="${this.appState}"
              .media=${this.source?.extended?.media}
              .mediaRef=${this.source?.media_list}
            ></grampsjs-gallery>
          `}
      ${this.canEdit
        ? html`
            <div class="controls">
              <mwc-icon-button
                id="btn-edit-gallery"
                class="edit"
                @click="${this._handleEditGallery}"
              >
                ${this._editingGallery
                  ? renderIconSvg(mdiPencilOff, 'var(--mdc-theme-secondary)')
                  : renderIconSvg(mdiPencil, 'var(--mdc-theme-secondary)')}
              </mwc-icon-button>
              <grampsjs-tooltip for="btn-edit-gallery"
                >${this._('Edit')}</grampsjs-tooltip
              >
            </div>
          `
        : ''}

      <h3>${this._('Tags')}</h3>
      <grampsjs-tags
        .data="${this.source?.extended?.tags}"
        .hideTags="${['ToDo']}"
        ?edit="${this.canEdit}"
        .appState="${this.appState}"
        @tag:new="${this._handleNewTag}"
      ></grampsjs-tags>

      ${this._renderAssignee()} ${this._renderRelated()}
      ${this._renderSubtasks()} ${this._renderUpdates()} ${this.dialogContent}
    `
  }

  _renderAssignee() {
    const value = getAttr(this.source, ATTR.assignee) || ''
    if (!this.canEdit) {
      return html`<h3>${this._('Assignee')}</h3>
        <p>
          ${value || html`<span class="muted">${this._('Unassigned')}</span>`}
        </p>`
    }
    if (this._members.length > 0) {
      const known = this._members.includes(value)
      return html`
        <h3>${this._('Assignee')}</h3>
        <md-outlined-select @change="${this._handleAssigneeChange}">
          <md-select-option value="" ?selected="${!value}">
            <div slot="headline">${this._('Unassigned')}</div>
          </md-select-option>
          ${this._members.map(
            name => html`
              <md-select-option value="${name}" ?selected="${name === value}">
                <div slot="headline">${name}</div>
              </md-select-option>
            `
          )}
          ${value && !known
            ? html`<md-select-option value="${value}" selected>
                <div slot="headline">${value}</div>
              </md-select-option>`
            : ''}
        </md-outlined-select>
      `
    }
    return html`
      <h3>${this._('Assignee')}</h3>
      <md-outlined-text-field
        class="assignee-field"
        .value="${live(value)}"
        @change="${this._handleAssigneeInput}"
      ></md-outlined-text-field>
    `
  }

  _renderRelated() {
    const related = getRelated(this.source)
    return html`
      <h3>${this._('Related records')}</h3>
      ${this._relatedObjects.length > 0
        ? html`<grampsjs-search-result-list
            linked
            noSep
            .appState="${this.appState}"
            .data="${this._relatedObjects}"
            metaIcon="${this.canEdit ? mdiDelete : ''}"
            @search-result:metaClicked="${this._handleDeleteRelated}"
          ></grampsjs-search-result-list>`
        : html`${related.length === 0
            ? html`<p><span class="muted">${this._('None')}</span></p>`
            : ''}`}
      ${this.canEdit
        ? html`<div class="controls">
            <grampsjs-form-select-object
              objectType=""
              .appState="${this.appState}"
              label="${this._('Add related record')}"
              .iconPath="${mdiPlus}"
              @select-object:changed="${this._handleAddRelated}"
            ></grampsjs-form-select-object>
          </div>`
        : ''}
    `
  }

  _renderSubtasks() {
    const subtasks = getSubtasks(this.source)
    const {done, total} = subtaskProgress(this.source)
    return html`
      <h3>
        ${this._('Subtasks')}
        ${total > 0 ? html`<span class="counter">${done}/${total}</span>` : ''}
      </h3>
      ${subtasks.length === 0 && !this.canEdit
        ? html`<p><span class="muted">${this._('None')}</span></p>`
        : ''}
      <div class="subtasks">
        ${subtasks.map(subtask => this._renderSubtask(subtask))}
      </div>
      ${this.canEdit
        ? html`<div class="add-row">
            <md-outlined-text-field
              id="subtask-input"
              class="add-field"
              label="${this._('Add subtask')}"
              @keydown="${this._handleSubtaskKeydown}"
            ></md-outlined-text-field>
            <md-icon-button @click="${this._handleAddSubtask}">
              <grampsjs-icon
                path="${mdiPlus}"
                color="var(--mdc-theme-secondary)"
              ></grampsjs-icon>
            </md-icon-button>
          </div>`
        : ''}
    `
  }

  _renderSubtask(subtask) {
    return html`
      <div class="subtask-item">
        <md-checkbox
          ?checked="${subtask.done}"
          ?disabled="${!this.canEdit}"
          @change="${() => this._handleToggleSubtask(subtask)}"
        ></md-checkbox>
        <span class="${classMap({'subtask-text': true, strike: subtask.done})}"
          >${subtask.text}</span
        >
        ${this.canEdit
          ? html`<md-icon-button
              @click="${() => this._handleDeleteSubtask(subtask.attrIndex)}"
            >
              <grampsjs-icon
                path="${mdiDelete}"
                color="var(--mdc-theme-secondary)"
              ></grampsjs-icon>
            </md-icon-button>`
          : ''}
      </div>
    `
  }

  _renderUpdates() {
    const updates = sortUpdates(getUpdates(this.source))
    return html`
      <h3>${this._('Updates')}</h3>
      ${this.canEdit
        ? html`<div class="add-row">
            <md-outlined-text-field
              id="update-input"
              class="add-field"
              type="textarea"
              rows="2"
              label="${this._('Add update')}"
              @keydown="${this._handleUpdateKeydown}"
            ></md-outlined-text-field>
            <md-icon-button @click="${this._handleAddUpdate}">
              <grampsjs-icon
                path="${mdiSend}"
                color="var(--mdc-theme-secondary)"
              ></grampsjs-icon>
            </md-icon-button>
          </div>`
        : ''}
      ${updates.length === 0
        ? html`<p><span class="muted">${this._('No updates yet')}</span></p>`
        : html`<div class="updates">
            ${updates.map(update => this._renderUpdate(update))}
          </div>`}
    `
  }

  _renderUpdate(update) {
    return html`
      <div class="update-item">
        <div class="update-meta">
          ${update.author
            ? html`<span class="update-author">${update.author}</span>`
            : ''}
          <span class="update-date">${this._formatDate(update.date)}</span>
          ${this.canEdit
            ? html`<md-icon-button
                @click="${() => this._handleDeleteUpdate(update.attrIndex)}"
              >
                <grampsjs-icon
                  path="${mdiDelete}"
                  color="var(--mdc-theme-secondary)"
                ></grampsjs-icon>
              </md-icon-button>`
            : ''}
        </div>
        <div class="update-text">${update.text}</div>
      </div>
    `
  }

  _formatDate(isoDate) {
    if (!isoDate) {
      return ''
    }
    const date = new Date(isoDate)
    if (Number.isNaN(date.getTime())) {
      return isoDate
    }
    const locale = (this.appState?.i18n?.lang || 'en').replace('_', '-')
    try {
      return date.toLocaleString(locale)
    } catch {
      return date.toLocaleString()
    }
  }

  get _status() {
    return this.source.attribute_list.filter(att => att.type === 'Status')[0]
      ?.value
  }

  get _priority() {
    return this.source.attribute_list.filter(att => att.type === 'Priority')[0]
      ?.value
  }

  firstUpdated() {
    this._fetchCurrentUser()
    this._fetchMembers()
  }

  updated(changed) {
    super.updated(changed)
    if (changed.has('source')) {
      this._fetchRelated()
    }
  }

  async _fetchCurrentUser() {
    const result = await this.appState.apiGet('/api/users/-/')
    if (result && !('error' in result)) {
      this._currentUser = result.data?.full_name || result.data?.name || ''
    }
  }

  async _fetchMembers() {
    if (!this.appState.permissions.canManageUsers) {
      return
    }
    const result = await this.appState.apiGet('/api/users/')
    if ('data' in result && Array.isArray(result.data)) {
      this._members = result.data
        .map(user => user.full_name || user.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    }
  }

  async _fetchRelated() {
    const related = getRelated(this.source)
    if (related.length === 0) {
      this._relatedObjects = []
      return
    }
    const lang = this.appState?.i18n?.lang || 'en'
    const results = await Promise.all(
      related.map(async ({attrIndex, objectType, grampsId}) => {
        const endpoint = objectTypeToEndpoint[objectType]
        if (!endpoint || !grampsId) {
          return null
        }
        const result = await this.appState.apiGet(
          `/api/${endpoint}/?gramps_id=${encodeURIComponent(
            grampsId
          )}&locale=${lang}&profile=all&extend=all`
        )
        const object = result?.data?.[0]
        return {
          object_type: objectType,
          object: object || {gramps_id: grampsId},
          _attrIndex: attrIndex,
        }
      })
    )
    this._relatedObjects = results.filter(Boolean)
  }

  _setSingleAttr(type, value) {
    const index = this.source.attribute_list.findIndex(att => att.type === type)
    if (!value) {
      if (index !== -1) {
        fireEvent(this, 'edit:action', {action: 'delAttr', index})
      }
      return
    }
    const data = srcAttribute(type, value)
    if (index === -1) {
      fireEvent(this, 'edit:action', {action: 'addAttribute', data})
    } else {
      fireEvent(this, 'edit:action', {action: 'updateAttribute', data, index})
    }
  }

  _handleAssigneeChange(e) {
    this._setSingleAttr(ATTR.assignee, e.target.value)
  }

  _handleAssigneeInput(e) {
    this._setSingleAttr(ATTR.assignee, e.target.value.trim())
  }

  _handleAddRelated(e) {
    const obj = e.detail.objects?.[0]
    if (!obj?.object?.gramps_id || !obj?.object_type) {
      return
    }
    const value = formatRelated({
      objectType: obj.object_type,
      grampsId: obj.object.gramps_id,
    })
    fireEvent(this, 'edit:action', {
      action: 'addAttribute',
      data: srcAttribute(ATTR.related, value),
    })
    this.renderRoot.querySelector('grampsjs-form-select-object')?.reset()
  }

  _handleDeleteRelated(e) {
    const index = e.detail?._attrIndex
    if (index !== undefined) {
      fireEvent(this, 'edit:action', {action: 'delAttr', index})
    }
  }

  _handleAddSubtask() {
    const field = this.renderRoot.getElementById('subtask-input')
    const text = (field?.value || '').trim()
    if (!text) {
      return
    }
    fireEvent(this, 'edit:action', {
      action: 'addAttribute',
      data: srcAttribute(ATTR.subtask, formatSubtask({done: false, text})),
    })
    field.value = ''
  }

  _handleSubtaskKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      this._handleAddSubtask()
    }
  }

  _handleToggleSubtask(subtask) {
    fireEvent(this, 'edit:action', {
      action: 'updateAttribute',
      index: subtask.attrIndex,
      data: srcAttribute(
        ATTR.subtask,
        formatSubtask({done: !subtask.done, text: subtask.text})
      ),
    })
  }

  _handleDeleteSubtask(index) {
    fireEvent(this, 'edit:action', {action: 'delAttr', index})
  }

  _handleAddUpdate() {
    const field = this.renderRoot.getElementById('update-input')
    const text = (field?.value || '').trim()
    if (!text) {
      return
    }
    const value = formatUpdate({
      date: new Date().toISOString(),
      author: this._currentUser,
      text,
    })
    fireEvent(this, 'edit:action', {
      action: 'addAttribute',
      data: srcAttribute(ATTR.update, value),
    })
    field.value = ''
  }

  _handleUpdateKeydown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      this._handleAddUpdate()
    }
  }

  _handleDeleteUpdate(index) {
    fireEvent(this, 'edit:action', {action: 'delAttr', index})
  }

  _handleEditGallery() {
    this._editingGallery = !this._editingGallery
  }

  _handleEditNote() {
    this._editingNote = true
  }

  _handleSaveNote() {
    const editor = this.renderRoot.querySelector('grampsjs-editor')
    const text = editor.data
    const type = 'To Do'
    if (this.source.note_list.length > 0) {
      const note = this.source.extended.notes[0]
      const data = {...note, text, type}
      fireEvent(this, 'task:update-note-text', data)
    } else {
      const data = {text, type}
      if (text.string.trim() !== '') {
        fireEvent(this, 'task:add-note-text', data)
      }
    }
    this._editingNote = false
  }

  _handleCancelNote() {
    this._editingNote = false
  }

  _handleStatusChange(e) {
    const status = `${e.target.value}`
    if (status === this._status) {
      return
    }
    const data = {
      type: 'Status',
      value: `${e.target.value}`,
    }
    if (this._status === undefined) {
      fireEvent(this, 'edit:action', {action: 'addAttribute', data})
    } else {
      const index = this.source.attribute_list.findIndex(
        att => att.type === 'Status'
      )
      fireEvent(this, 'edit:action', {action: 'updateAttribute', data, index})
    }
  }

  _handlePrioChange(e) {
    const prio = `${e.target.value}`
    if (prio === this._priority) {
      return
    }
    const data = {
      type: 'Priority',
      value: `${e.target.value}`,
    }
    if (this._priority === undefined) {
      fireEvent(this, 'edit:action', {action: 'addAttribute', data})
    } else {
      const index = this.source.attribute_list.findIndex(
        att => att.type === 'Priority'
      )
      fireEvent(this, 'edit:action', {action: 'updateAttribute', data, index})
    }
  }

  _handleEditTitle() {
    const element = this.renderRoot.getElementById('title')
    const title = element.textContent
      .replace(/(\r\n|\n|\r)/gm, '') // remove line breaks
      .trim()
    element.blur()
    fireEvent(this, 'edit:action', {action: 'updateProp', data: {title}})
  }

  _clickDetails(grampsId) {
    fireEvent(this, 'nav', {path: `source/${grampsId}`})
  }

  _handleCancelDialog() {
    this.dialogContent = ''
  }

  _handleNewTag() {
    this.dialogContent = html`
      <grampsjs-form-new-tag
        .appState="${this.appState}"
        .data="${this.source.tag_list}"
        dialogTitle="${this._('Add Tag')}"
        @object:save="${this._handleSaveTag}"
        @object:cancel="${this._handleCancelDialog}"
      >
      </grampsjs-form-new-tag>
    `
  }

  _handleSaveTag(e) {
    fireEvent(this, 'edit:action', {
      action: 'updateProp',
      data: {tag_list: e.detail.data},
    })
    e.preventDefault()
    e.stopPropagation()
    this.dialogContent = ''
  }
}

window.customElements.define('grampsjs-task', GrampsjsTask)
