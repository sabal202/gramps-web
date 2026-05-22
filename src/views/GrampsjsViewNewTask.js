import {html} from 'lit'

import '@material/mwc-textfield'
import '@material/mwc-select'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/textfield/outlined-text-field.js'

import '../components/GrampsjsEditor.js'
import '../components/GrampsjsFormString.js'
import '../components/GrampsjsFormPrivate.js'
import {GrampsjsViewNewSource} from './GrampsjsViewNewSource.js'

import {makeHandle, fireEvent} from '../util.js'
import {ATTR, srcAttribute} from '../tasks.js'

const dataDefault = {
  _class: 'Source',
  attribute_list: [{_class: 'SrcAttribute', type: 'Priority', value: '5'}],
}

export class GrampsjsViewNewTask extends GrampsjsViewNewSource {
  static get properties() {
    return {
      _todoTagHandle: {type: String},
      _members: {type: Array},
    }
  }

  constructor() {
    super()
    this.data = dataDefault
    this.postUrl = '/api/objects/'
    this.itemPath = 'task'
    this.objClass = 'Source'
    this._todoTagHandle = ''
    this._members = []
  }

  renderContent() {
    const priority = this.data.attribute_list.filter(
      att => att.type === 'Priority'
    )[0]?.value
    return html`
      <h2>${this._('New Task')}</h2>

      <h4 class="label">${this._('Title')}</h4>
      <p>
        <mwc-textfield
          required
          validationMessage="${this._('This field is mandatory')}"
          style="width:100%;"
          @input="${this.handleName}"
          id="source-name"
        ></mwc-textfield>
      </p>

      <h4 class="label">${this._('Description')}</h4>
      <p>
        <grampsjs-editor
          @formdata:changed="${this.handleEditor}"
          id="task-description-editor"
          .appState="${this.appState}"
        ></grampsjs-editor>
      </p>

      <h4 class="label">${this._('Priority')}</h4>
      <p>
        <mwc-select @change="${this.handlePriority}">
          <mwc-list-item ?selected="${priority < 4}" value="1"
            >${this._('High')}</mwc-list-item
          >
          <mwc-list-item ?selected="${priority === '5'}" value="5"
            >${this._('Medium')}</mwc-list-item
          >
          <mwc-list-item ?selected="${priority > 5}" value="9"
            >${this._('Low')}</mwc-list-item
          >
        </mwc-select>
      </p>

      <h4 class="label">${this._('Assignee')}</h4>
      <p>${this._renderAssignee()}</p>

      ${this._renderTagsForm()}

      <div class="spacer"></div>
      <grampsjs-form-private
        id="private"
        .appState="${this.appState}"
      ></grampsjs-form-private>

      ${this.renderButtons()}
    `
    // <pre>${JSON.stringify(this.data, null, 2)}</pre>
  }

  _renderAssignee() {
    if (this.appState.permissions.canManageUsers && this._members.length > 0) {
      return html`
        <md-outlined-select @change="${this.handleAssignee}">
          <md-select-option value="" selected>
            <div slot="headline">${this._('Unassigned')}</div>
          </md-select-option>
          ${this._members.map(
            name => html`
              <md-select-option value="${name}">
                <div slot="headline">${name}</div>
              </md-select-option>
            `
          )}
        </md-outlined-select>
      `
    }
    return html`
      <md-outlined-text-field
        style="width:100%;"
        @input="${this.handleAssignee}"
      ></md-outlined-text-field>
    `
  }

  handleAssignee(e) {
    const value = (e.target.value || '').trim()
    this.data = {
      ...this.data,
      attribute_list: [
        ...this.data.attribute_list.filter(att => att.type !== ATTR.assignee),
        ...(value ? [srcAttribute(ATTR.assignee, value)] : []),
      ],
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

  handleName(e) {
    this.checkFormValidity()
    this.data = {...this.data, title: e.target.value.trim()}
  }

  _handleFormData(e) {
    this.checkFormValidity()
    super._handleFormData(e)
  }

  handleEditor(e) {
    if (e.detail?.data?.string && e.detail.data.string.trim()) {
      this.data = {
        ...this.data,
        note: {_class: 'Note', text: e.detail.data},
      }
    } else {
      const {note, ...data} = this.data
      this.data = data
    }
  }

  checkFormValidity() {
    const name = this.shadowRoot.getElementById('source-name')
    name.reportValidity()
    try {
      this.isFormValid = name?.validity?.valid
    } catch {
      this.isFormValid = false
    }
  }

  handlePriority(e) {
    const {value} = e.target
    this.data = {
      ...this.data,
      attribute_list: [
        ...this.data.attribute_list.filter(att => att.type !== 'Priority'),
        {_class: 'SrcAttribute', type: 'Priority', value},
      ],
    }
  }

  _reset() {
    super._reset()
    const text = this.shadowRoot.querySelector('grampsjs-editor')
    text.reset()
    this.isFormValid = false
    this.data = dataDefault
  }

  _processedData() {
    const handleSource = makeHandle()
    const handleNote = makeHandle()
    const {note, ...source} = this.data
    const hasNote = note?.text?.string
    const attrStatus = {_class: 'SrcAttribute', type: 'Status', value: 'Open'}
    const tagList = [
      ...new Set(
        [this._todoTagHandle, ...(this.data.tag_list || [])].filter(Boolean)
      ),
    ]
    if (!hasNote) {
      return [
        {
          ...source,
          attribute_list: [...source.attribute_list, attrStatus],
          tag_list: tagList,
        },
      ]
    }
    return [
      {
        ...source,
        handle: handleSource,
        note_list: [handleNote],
        attribute_list: [...source.attribute_list, attrStatus],
        tag_list: tagList,
      },
      {
        ...note,
        handle: handleNote,
        tag_list: tagList,
        type: 'To Do',
      },
    ]
  }

  async _fetchTodoTagHandle(retry = true) {
    const lang = this.appState?.i18n?.lang || 'en'
    const data = await this.appState.apiGet(
      `/api/tags/?locale=${lang}&pagesize=500`
    )
    if ('data' in data) {
      this._allTags = data.data
      const tags = data.data.filter(tag => tag.name === 'ToDo')
      if (tags.length > 0) {
        this._todoTagHandle = tags[0].handle
      } else {
        const newTag = {name: 'ToDo'}
        await this.appState.apiPost('/api/tags/', newTag)
        if (retry) {
          await this._fetchTodoTagHandle(false)
        }
      }
    }
  }

  firstUpdated() {
    this._fetchTodoTagHandle()
    this._fetchMembers()
  }

  async _submit() {
    if (!this._todoTagHandle) {
      await this._fetchTodoTagHandle()
    }
    if (!this._todoTagHandle) {
      this.error = true
      this._errorMessage = this._('Failed to fetch the ToDo tag')
      return
    }
    const processedData = this._processedData()
    this.appState.apiPost(this.postUrl, processedData).then(data => {
      if ('data' in data) {
        this.error = false
        fireEvent(this, 'nav', {path: 'tasks'})
        this._reset()
      } else if ('error' in data) {
        this.error = true
        this._errorMessage = data.error
      }
    })
  }
}

window.customElements.define('grampsjs-view-new-task', GrampsjsViewNewTask)
