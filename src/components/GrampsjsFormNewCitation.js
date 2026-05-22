/*
Form for adding a new citation, optionally creating its source inline
and attaching media to it in the same step.
*/

import {html, css} from 'lit'
import '@material/mwc-textfield'
import '@material/web/radio/radio'

import './GrampsjsFormSelectType.js'
import './GrampsjsFormSelectObjectList.js'
import './GrampsjsFormString.js'
import './GrampsjsFormUpload.js'
import {GrampsjsObjectForm} from './GrampsjsObjectForm.js'
import {GrampsjsMediaUploadMixin} from '../mixins/GrampsjsMediaUploadMixin.js'
import {fireEvent, buildMediaRefList} from '../util.js'

const confidence = {
  0: 'Very Low',
  1: 'Low',
  2: 'Normal',
  3: 'High',
  4: 'Very High',
}

class GrampsjsFormNewCitation extends GrampsjsMediaUploadMixin(
  GrampsjsObjectForm
) {
  static get styles() {
    return [
      ...super.styles,
      css`
        div.source-mode {
          display: flex;
          flex-wrap: wrap;
          gap: 1.5em;
          margin-bottom: 0.5em;
        }

        div.source-mode label {
          display: inline-flex;
          align-items: center;
          gap: 0.4em;
          cursor: pointer;
        }
      `,
    ]
  }

  static get properties() {
    return {
      ...super.properties,
      _sourceMode: {type: String},
      _saving: {type: Boolean},
      _mediaHandles: {type: Array},
      _newSource: {type: Object},
    }
  }

  constructor() {
    super()
    this.data = {_class: 'Citation', confidence: 2}
    this._sourceMode = 'existing'
    this._saving = false
    this._mediaHandles = []
    this._newSource = {}
  }

  renderForm() {
    return html`
      <h4 class="label">${this._('Source')}</h4>
      <div role="radiogroup" class="source-mode">
        <label>
          <md-radio
            name="source-mode"
            value="existing"
            ?checked="${this._sourceMode === 'existing'}"
            @change="${this._handleSourceModeChange}"
          ></md-radio>
          <span>${this._('Existing source')}</span>
        </label>
        <label>
          <md-radio
            name="source-mode"
            value="new"
            ?checked="${this._sourceMode === 'new'}"
            @change="${this._handleSourceModeChange}"
          ></md-radio>
          <span>${this._('New source')}</span>
        </label>
      </div>

      ${this._sourceMode === 'existing'
        ? html`
            <grampsjs-form-select-object-list
              fixedMenuPosition
              style="min-height: 300px;"
              id="source"
              objectType="source"
              .appState="${this.appState}"
            ></grampsjs-form-select-object-list>
          `
        : html`
            <grampsjs-form-string
              fullwidth
              required
              id="source-title"
              label="${this._('Title')}"
              .appState="${this.appState}"
            ></grampsjs-form-string>
            <grampsjs-form-string
              fullwidth
              id="source-author"
              label="${this._('Author')}"
              .appState="${this.appState}"
            ></grampsjs-form-string>
            <grampsjs-form-string
              fullwidth
              id="source-pubinfo"
              label="${this._('Publication info')}"
              .appState="${this.appState}"
            ></grampsjs-form-string>
            <grampsjs-form-string
              fullwidth
              id="source-abbrev"
              label="${this._('Abbreviation')}"
              .appState="${this.appState}"
            ></grampsjs-form-string>
          `}

      <h4 class="label">${this._('Page')}</h4>
      <p>
        <grampsjs-form-string fullwidth id="page"></grampsjs-form-string>
      </p>

      <h4 class="label">${this._('Date')}</h4>
      <p>
        <grampsjs-form-select-date id="date" .appState="${this.appState}">
        </grampsjs-form-select-date>
      </p>

      <h4 class="label">${this._('Confidence')}</h4>
      <mwc-select
        id="select-confidence"
        @change="${this.handleConfidence}"
        fixedMenuPosition
      >
        ${Object.keys(confidence).map(
          conf => html`
            <mwc-list-item
              value="${conf}"
              ?selected="${
                // eslint-disable-next-line eqeqeq
                conf == this.data.confidence
              }"
              >${this._(confidence[conf])}</mwc-list-item
            >
          `
        )}
      </mwc-select>

      <h4 class="label">${this._('Media')}</h4>
      <grampsjs-form-upload
        preview
        outlined
        id="citation-upload"
        .appState="${this.appState}"
      ></grampsjs-form-upload>
      <grampsjs-form-select-object-list
        fixedMenuPosition
        multiple
        id="citation-media"
        objectType="media"
        label="${this._('Select an existing media object')}"
        .appState="${this.appState}"
      ></grampsjs-form-select-object-list>

      <div class="spacer"></div>
      <grampsjs-form-private
        id="private"
        .appState="${this.appState}"
      ></grampsjs-form-private>
    `
  }

  handleConfidence(e) {
    this.data = {...this.data, confidence: parseInt(e.target.value, 10)}
  }

  _handleSourceModeChange(e) {
    this._sourceMode = e.target.value
    if (this._sourceMode === 'existing') {
      this._newSource = {}
    } else {
      const {source_handle: _drop, ...rest} = this.data
      this.data = rest
    }
  }

  _handleFormData(e) {
    super._handleFormData(e)
    const originalTarget = e.composedPath()[0]
    if (originalTarget.id === 'citation-media-list') {
      this._mediaHandles = e.detail.data ?? []
    }
    if (
      [
        'source-title',
        'source-author',
        'source-pubinfo',
        'source-abbrev',
      ].includes(originalTarget.id)
    ) {
      const key = originalTarget.id.replace('source-', '')
      this._newSource = {...this._newSource, [key]: e.detail.data}
    }
  }

  get isValid() {
    if (this._sourceMode === 'new') {
      if (!this._newSource.title) {
        return false
      }
    } else if (!this.data.source_handle) {
      return false
    }
    return !this._saving && this._areDateSelectValid()
  }

  _sourcePayload() {
    const payload = {_class: 'Source'}
    ;['title', 'author', 'pubinfo', 'abbrev'].forEach(key => {
      if (this._newSource[key]) {
        payload[key] = this._newSource[key]
      }
    })
    return payload
  }

  async _handleDialogSave() {
    if (this._saving) {
      return
    }
    this._saving = true
    try {
      const handles = [...this._mediaHandles]
      const uploadEl = this.renderRoot.getElementById('citation-upload')
      if (uploadEl?.file?.name) {
        const res = await this.uploadMediaFile(uploadEl.file, {
          desc: uploadEl.file.name.replace(/\.[^/.]+$/, ''),
        })
        if (res.error) {
          fireEvent(this, 'grampsjs:error', {message: res.error})
          return
        }
        handles.unshift(res.data.handle)
      }
      const mediaList = buildMediaRefList(handles)

      let sourceHandle = this.data.source_handle
      if (this._sourceMode === 'new') {
        const res = await this.appState.apiPost(
          '/api/sources/',
          this._sourcePayload(),
          {dbChanged: false}
        )
        if ('error' in res) {
          fireEvent(this, 'grampsjs:error', {message: res.error})
          return
        }
        sourceHandle = res.data.filter(obj => obj.new._class === 'Source')[0]
          .new.handle
      }

      const citation = {
        _class: 'Citation',
        confidence: this.data.confidence ?? 2,
        source_handle: sourceHandle,
      }
      if (this.data.page) {
        citation.page = this.data.page
      }
      if (this.data.date) {
        citation.date = this.data.date
      }
      if (this.data.private) {
        citation.private = this.data.private
      }
      if (mediaList.length) {
        citation.media_list = mediaList
      }

      fireEvent(this, 'object:save', {data: citation})
      this._resetForm()
    } finally {
      this._saving = false
    }
  }

  _resetForm() {
    this._reset()
    this._sourceMode = 'existing'
    this._mediaHandles = []
    this._newSource = {}
    this.data = {_class: 'Citation', confidence: 2}
  }
}

window.customElements.define(
  'grampsjs-form-new-citation',
  GrampsjsFormNewCitation
)
