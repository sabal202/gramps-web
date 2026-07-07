import {html} from 'lit'

import {GrampsjsObjectForm} from './GrampsjsObjectForm.js'
import {GrampsjsNewMediaMixin} from '../mixins/GrampsjsNewMediaMixin.js'
import {GrampsjsMediaUploadMixin} from '../mixins/GrampsjsMediaUploadMixin.js'

import './GrampsjsFormUpload.js'

import {fireEvent, emptyDate} from '../util.js'

export class GrampsjsFormNewMedia extends GrampsjsMediaUploadMixin(
  GrampsjsNewMediaMixin(GrampsjsObjectForm)
) {
  constructor() {
    super()
    this.data = {_class: 'Media'}
  }

  renderForm() {
    return html`
      <h4 class="label">${this._('File')}</h4>
      <p>
        <grampsjs-form-upload
          preview
          id="upload"
          .appState="${this.appState}"
        ></grampsjs-form-upload>
      </p>

      ${super.renderForm()}
    `
  }

  checkFormValidity() {
    const upload = this.shadowRoot.getElementById('upload')
    this.isFormValid = !!upload.file?.name
  }

  _handleFormData(e) {
    super._handleFormData(e)
    const originalTarget = e.composedPath()[0]
    if (originalTarget.id === 'date') {
      this.data = {...this.data, date: e.detail.data ?? emptyDate}
    }
    if (originalTarget.id === 'upload') {
      this.data = {
        ...this.data,
        desc: e.detail.data.name.replace(/\.[^/.]+$/, ''),
      }
    }
    this.checkFormValidity()
  }

  async upload(submittedData) {
    const uploadElement = this.shadowRoot.getElementById('upload')
    const result = await this.uploadMediaFile(uploadElement.file, submittedData)
    if (result.error) {
      fireEvent(this, 'grampsjs:error', {message: result.error})
    }
    return result
  }
}

window.customElements.define('grampsjs-form-new-media', GrampsjsFormNewMedia)
