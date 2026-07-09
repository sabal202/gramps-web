/*
"Immich Import" view — brings Immich's face recognition into Gramps Web.

Two flows (see docs/superpowers/specs/2026-07-09-immich-gramps-import-design.md):
  - Flow B ("New photos"): browse archive-account albums, pick a Gramps
    target object, review proposed face regions, commit.
  - Flow A ("Existing tree photos"): back-fill missing face regions on media
    already in the tree, review, commit.

Downstream (regional integration), gated on Editor+ (canEdit) like the rest
of our tree-mutating features. Degrades gracefully if the Immich backend is
unreachable (404/500) — every fetch surfaces a message instead of throwing.
*/
import {html, css} from 'lit'

import '@material/web/tabs/tabs.js'
import '@material/web/tabs/primary-tab.js'
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/list/list.js'
import '@material/web/list/list-item.js'
import '@material/web/progress/circular-progress.js'

import {GrampsjsView} from './GrampsjsView.js'
import {objectDescription, clickKeyHandler} from '../util.js'
import '../components/GrampsjsFormSelectObject.js'
import '../components/GrampsjsImmichRegionReview.js'
import '../components/GrampsjsImmichPeopleMapper.js'
import {
  buildAlbumReviewState,
  buildExistingReviewState,
  updatePersonRect,
  setPersonRemoved,
  setItemAttach,
  applyPersonMapping,
  getUnmappedPersons,
  buildAlbumCommitPayload,
  buildExistingCommitPayload,
} from '../util/immichImport.js'

const FLOWS = ['album', 'existing']

export class GrampsjsViewImmichImport extends GrampsjsView {
  static get styles() {
    return [
      super.styles,
      css`
        .section {
          margin: 20px 0;
        }

        .album-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 4px;
          border-bottom: 1px solid var(--grampsjs-body-font-color-10, #ddd);
          cursor: pointer;
        }

        .album-row:hover {
          background-color: var(--grampsjs-color-shade-240, #f4f4f4);
        }

        .target-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0;
        }

        .error-message {
          color: var(--md-sys-color-error, #b3261e);
        }

        .commit-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0;
        }

        .result-message {
          padding: 12px 16px;
          border-radius: 8px;
          background: var(--grampsjs-color-shade-230, #eee);
        }
      `,
    ]
  }

  static get properties() {
    return {
      _flow: {type: String},

      // Flow B (album import)
      _albums: {type: Array},
      _albumsLoading: {type: Boolean},
      _albumsError: {type: Boolean},
      _selectedAlbum: {type: Object},
      _target: {type: Object},
      _albumReview: {type: Array},
      _albumPreviewLoading: {type: Boolean},
      _albumPreviewError: {type: Boolean},
      _albumCommitting: {type: Boolean},
      _albumCommitResult: {type: Object},
      _albumCommitError: {type: Boolean},

      // Flow A (existing tree photos)
      _existingReview: {type: Array},
      _existingLoading: {type: Boolean},
      _existingError: {type: Boolean},
      _existingFetched: {type: Boolean},
      _existingCommitting: {type: Boolean},
      _existingCommitResult: {type: Object},
      _existingCommitError: {type: Boolean},
    }
  }

  constructor() {
    super()
    this._flow = 'album'

    this._albums = []
    this._albumsLoading = false
    this._albumsError = false
    this._selectedAlbum = null
    this._target = null
    this._albumReview = []
    this._albumPreviewLoading = false
    this._albumPreviewError = false
    this._albumCommitting = false
    this._albumCommitResult = null
    this._albumCommitError = false

    this._existingReview = []
    this._existingLoading = false
    this._existingError = false
    this._existingFetched = false
    this._existingCommitting = false
    this._existingCommitResult = null
    this._existingCommitError = false
  }

  renderContent() {
    if (!this.appState.permissions.canEdit) {
      return html`
        <h2>${this._('Immich Import')}</h2>
        <p>${this._('You need editor permissions to import photos.')}</p>
      `
    }
    return html`
      <h2>${this._('Immich Import')}</h2>
      <md-tabs
        .activeTabIndex="${FLOWS.indexOf(this._flow)}"
        @change="${this._handleTabChange}"
      >
        <md-primary-tab>${this._('New photos')}</md-primary-tab>
        <md-primary-tab>${this._('Existing tree photos')}</md-primary-tab>
      </md-tabs>
      ${this._flow === 'album'
        ? this._renderAlbumFlow()
        : this._renderExistingFlow()}
    `
  }

  _handleTabChange(e) {
    const idx = e.target.activeTabIndex
    this._flow = FLOWS[idx] ?? 'album'
    if (this._flow === 'existing' && !this._existingFetched) {
      this._fetchExistingPreview()
    }
  }

  firstUpdated() {
    super.firstUpdated()
    this._fetchAlbums()
  }

  // -------------------------------------------------------------------
  // Flow B: album import
  // -------------------------------------------------------------------

  async _fetchAlbums() {
    this._albumsLoading = true
    this._albumsError = false
    const result = await this.appState.apiGet('/api/immich/albums/')
    this._albumsLoading = false
    if ('data' in result) {
      this._albums = Array.isArray(result.data) ? result.data : []
      this._albumsError = false
    } else {
      this._albums = []
      this._albumsError = true
    }
  }

  _renderAlbumFlow() {
    if (!this._selectedAlbum) {
      return html` <div class="section">${this._renderAlbumList()}</div> `
    }
    return html`
      <div class="section">
        <md-outlined-button @click="${this._backToAlbums}">
          ${this._('Back to albums')}
        </md-outlined-button>
      </div>
      <div class="section">${this._renderTargetPicker()}</div>
      ${this._target ? this._renderAlbumReview() : ''}
    `
  }

  _renderAlbumList() {
    if (this._albumsLoading) {
      return html`<md-circular-progress indeterminate></md-circular-progress>`
    }
    if (this._albumsError) {
      return html`<p class="error-message">
        ${this._('Could not reach Immich. Please try again later.')}
      </p>`
    }
    if (this._albums.length === 0) {
      return html`<p>${this._('No albums found.')}</p>`
    }
    return html`
      ${this._albums.map(
        album => html`
          <div
            class="album-row"
            role="button"
            tabindex="0"
            @click="${() => this._selectAlbum(album)}"
            @keydown="${clickKeyHandler}"
          >
            <span>${album.name}</span>
            <span
              >${this._('%s photos', album.assetCount ?? 0)}
              ${album.mappedTargetGrampsId
                ? html`&nbsp;·&nbsp;${this._(
                    'Mapped to %s',
                    album.mappedTargetGrampsId
                  )}`
                : ''}</span
            >
          </div>
        `
      )}
    `
  }

  _selectAlbum(album) {
    this._selectedAlbum = album
    this._target = album.mappedTargetGrampsId
      ? {
          grampsId: album.mappedTargetGrampsId,
          label: album.mappedTargetGrampsId,
        }
      : null
    this._albumReview = []
    this._albumCommitResult = null
    this._albumCommitError = false
    if (this._target) {
      this._fetchAlbumPreview()
    }
  }

  _backToAlbums() {
    this._selectedAlbum = null
    this._target = null
    this._albumReview = []
    this._albumCommitResult = null
    this._albumCommitError = false
  }

  _renderTargetPicker() {
    return html`
      <div class="target-row">
        <span
          >${this._('Target')}:
          ${this._target
            ? this._target.label || this._target.grampsId
            : this._('none')}</span
        >
        <grampsjs-form-select-object
          objectType=""
          label="${this._('Select target')}"
          .appState="${this.appState}"
          @select-object:changed="${this._handleTargetSelected}"
        ></grampsjs-form-select-object>
      </div>
    `
  }

  _handleTargetSelected(e) {
    const [obj] = e.detail.objects
    const grampsId = obj.object?.gramps_id ?? obj.gramps_id
    if (!grampsId) {
      return
    }
    let label = grampsId
    try {
      label = objectDescription(
        obj.object_type,
        obj.object,
        this.appState.i18n.strings
      )
    } catch {
      // fall back to the raw id if we can't build a nice label
    }
    this._target = {grampsId, label}
    this._fetchAlbumPreview()
  }

  async _fetchAlbumPreview() {
    if (!this._selectedAlbum || !this._target) {
      return
    }
    this._albumPreviewLoading = true
    this._albumPreviewError = false
    this._albumCommitResult = null
    const url = `/api/immich/albums/${encodeURIComponent(
      this._selectedAlbum.id
    )}/preview?target=${encodeURIComponent(this._target.grampsId)}`
    const result = await this.appState.apiGet(url)
    this._albumPreviewLoading = false
    if ('data' in result) {
      this._albumReview = buildAlbumReviewState(result.data?.items ?? [])
      this._albumPreviewError = false
    } else {
      this._albumReview = []
      this._albumPreviewError = true
    }
  }

  _renderAlbumReview() {
    if (this._albumPreviewLoading) {
      return html`<md-circular-progress indeterminate></md-circular-progress>`
    }
    if (this._albumPreviewError) {
      return html`<p class="error-message">
        ${this._('Could not reach Immich. Please try again later.')}
      </p>`
    }
    if (this._albumReview.length === 0) {
      return html`<p>${this._('No photos found in this album.')}</p>`
    }
    return html`
      <grampsjs-immich-people-mapper
        .persons="${getUnmappedPersons(this._albumReview)}"
        .appState="${this.appState}"
        @immich-mapping:applied="${this._handleMappingApplied}"
      ></grampsjs-immich-people-mapper>

      ${this._albumReview.map(
        item => html`
          <grampsjs-immich-region-review
            .item="${item}"
            flow="album"
            .appState="${this.appState}"
            @immich-region:rect-changed="${this._handleRectChanged}"
            @immich-region:removed-changed="${this._handleRemovedChanged}"
            @immich-item:attach-changed="${this._handleAttachChanged}"
          ></grampsjs-immich-region-review>
        `
      )}

      <div class="commit-row">
        <md-filled-button
          ?disabled="${this._albumCommitting}"
          @click="${this._commitAlbum}"
        >
          ${this._albumCommitting ? this._('Importing...') : this._('Import')}
        </md-filled-button>
        ${this._albumCommitError
          ? html`<span class="error-message"
              >${this._(
                'Could not reach Immich. Please try again later.'
              )}</span
            >`
          : ''}
      </div>
      ${this._albumCommitResult ? this._renderAlbumCommitResult() : ''}
    `
  }

  _renderAlbumCommitResult() {
    const r = this._albumCommitResult
    return html`
      <p class="result-message">
        ${this._(
          'Import complete: %s created, %s updated, %s skipped',
          r.createdMedia ?? 0,
          r.updatedMedia ?? 0,
          r.skipped ?? 0
        )}
      </p>
    `
  }

  async _commitAlbum() {
    if (!this._selectedAlbum || !this._target) {
      return
    }
    this._albumCommitting = true
    this._albumCommitError = false
    this._albumCommitResult = null
    const payload = buildAlbumCommitPayload(
      this._target.grampsId,
      this._albumReview
    )
    const url = `/api/immich/albums/${encodeURIComponent(
      this._selectedAlbum.id
    )}/commit`
    const result = await this.appState.apiPost(url, payload)
    this._albumCommitting = false
    if ('data' in result) {
      this._albumCommitResult = result.data
      this._albumCommitError = false
      // refresh to reflect the new alreadyImported / mapping state server-side
      this._fetchAlbumPreview()
    } else {
      this._albumCommitError = true
    }
  }

  // -------------------------------------------------------------------
  // Flow A: existing tree photos
  // -------------------------------------------------------------------

  async _fetchExistingPreview() {
    this._existingLoading = true
    this._existingError = false
    this._existingFetched = true
    const result = await this.appState.apiGet('/api/immich/existing/preview')
    this._existingLoading = false
    if ('data' in result) {
      this._existingReview = buildExistingReviewState(result.data?.items ?? [])
      this._existingError = false
    } else {
      this._existingReview = []
      this._existingError = true
    }
  }

  _renderExistingFlow() {
    if (this._existingLoading) {
      return html`<div class="section">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>`
    }
    if (this._existingError) {
      return html`<div class="section">
        <p class="error-message">
          ${this._('Could not reach Immich. Please try again later.')}
        </p>
        <md-outlined-button @click="${this._fetchExistingPreview}">
          ${this._('Refresh')}
        </md-outlined-button>
      </div>`
    }
    if (this._existingReview.length === 0) {
      return html`<div class="section">
        <p>${this._('No suggestions found.')}</p>
      </div>`
    }
    return html`
      <div class="section">
        <grampsjs-immich-people-mapper
          .persons="${getUnmappedPersons(this._existingReview)}"
          .appState="${this.appState}"
          @immich-mapping:applied="${this._handleMappingApplied}"
        ></grampsjs-immich-people-mapper>

        ${this._existingReview.map(
          item => html`
            <grampsjs-immich-region-review
              .item="${item}"
              flow="existing"
              .appState="${this.appState}"
              @immich-region:rect-changed="${this._handleRectChanged}"
              @immich-region:removed-changed="${this._handleRemovedChanged}"
            ></grampsjs-immich-region-review>
          `
        )}

        <div class="commit-row">
          <md-filled-button
            ?disabled="${this._existingCommitting}"
            @click="${this._commitExisting}"
          >
            ${this._existingCommitting
              ? this._('Saving...')
              : this._('Save regions')}
          </md-filled-button>
          ${this._existingCommitError
            ? html`<span class="error-message"
                >${this._(
                  'Could not reach Immich. Please try again later.'
                )}</span
              >`
            : ''}
        </div>
        ${this._existingCommitResult
          ? html`
              <p class="result-message">
                ${this._(
                  'Regions saved: %s media updated',
                  this._existingCommitResult.updatedMedia ?? 0
                )}
              </p>
            `
          : ''}
      </div>
    `
  }

  async _commitExisting() {
    this._existingCommitting = true
    this._existingCommitError = false
    this._existingCommitResult = null
    const payload = buildExistingCommitPayload(this._existingReview)
    const result = await this.appState.apiPost(
      '/api/immich/existing/commit',
      payload
    )
    this._existingCommitting = false
    if ('data' in result) {
      this._existingCommitResult = result.data
      this._existingCommitError = false
      this._fetchExistingPreview()
    } else {
      this._existingCommitError = true
    }
  }

  // -------------------------------------------------------------------
  // Shared region-edit handlers (both flows read/write the review state
  // owned by this view; child components are presentation-only)
  // -------------------------------------------------------------------

  _handleRectChanged(e) {
    const {key, immichPersonId, rect} = e.detail
    this._updateReviewState(state =>
      updatePersonRect(state, key, immichPersonId, rect)
    )
  }

  _handleRemovedChanged(e) {
    const {key, immichPersonId, removed} = e.detail
    this._updateReviewState(state =>
      setPersonRemoved(state, key, immichPersonId, removed)
    )
  }

  _handleAttachChanged(e) {
    const {key, attach} = e.detail
    this._albumReview = setItemAttach(this._albumReview, key, attach)
  }

  _handleMappingApplied(e) {
    const {immichPersonId, grampsHandle} = e.detail
    this._albumReview = applyPersonMapping(
      this._albumReview,
      immichPersonId,
      grampsHandle
    )
    this._existingReview = applyPersonMapping(
      this._existingReview,
      immichPersonId,
      grampsHandle
    )
  }

  // Apply a pure review-state updater to both flows' state. Item keys never
  // collide across flows (album items are keyed by immichAssetId, existing
  // items by mediaHandle), so it's safe - and simpler than tracking which
  // flow a given event came from - to run the updater against both arrays;
  // the one that doesn't contain the key is returned unchanged.
  _updateReviewState(updater) {
    this._albumReview = updater(this._albumReview)
    this._existingReview = updater(this._existingReview)
  }
}

window.customElements.define(
  'grampsjs-view-immich-import',
  GrampsjsViewImmichImport
)
