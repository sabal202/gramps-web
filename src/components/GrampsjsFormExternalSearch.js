/* eslint-disable class-methods-use-this */
/*
Form to get parameters for find more details about a person from other websites
*/

import {css, html} from 'lit'
import '@material/mwc-icon'
import '@material/mwc-list'
import '@material/mwc-list/mwc-list-item'
import '@material/web/textfield/outlined-text-field'
import '@material/web/button/text-button'
import '@material/web/button/filled-button'
import '@material/web/iconbutton/icon-button.js'
import '@material/web/icon/icon.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import {
  mdiOpenInNew,
  mdiEarth,
  mdiShieldAccount,
  mdiLock,
  mdiCog,
  mdiEye,
  mdiEyeOff,
  mdiCogOff,
  mdiPlus,
  mdiDelete,
} from '@mdi/js'
import {renderIcon} from '../icons.js'
import {updateSettings, getSettings} from '../api.js'
import {
  resolveSiteData,
  getPersonNames,
  getNameParts,
  buildExternalSearchDataForName,
} from '../externalSearch.js'
import {clickKeyHandler, makeHandle} from '../util.js'
import './GrampsjsFormSelectType.js'
import './GrampsjsIcon.js'
import {GrampsjsObjectForm} from './GrampsjsObjectForm.js'

const EXTERNAL_SEARCH_WEBSITES = [
  {
    key: 'compgen',
    value: 'CompGen',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    baseUrl: 'https://meta.genealogy.net/search',
    params: '?lastname={{name_surname}}&place={{place_name}}',
  },
  {
    key: 'familySearch',
    value: 'FamilySearch',
    websiteCriteria: {
      reqRegistration: true,
      reqSubscription: false,
    },
    baseUrl: 'https://familysearch.org/search/record/results',
    params:
      '?q.birthLikeDate.from={{birth_year}}&q.birthLikeDate.to={{birth_year}}&q.deathLikeDate.from={{death_year}}&q.deathLikeDate.to={{death_year}}&q.givenName={{name_given}}&q.surname={{name_surname}}',
  },
  {
    key: 'ancestry',
    value: 'Ancestry',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: true,
    },
    baseUrl: 'https://www.ancestry.com/search',
    params:
      '?name={{name_given}}_{{name_surname}}&birth={{birth_year}}_{{place_name}}&death={{death_year}}&searchMode=advanced',
  },
  {
    key: 'myheritage',
    value: 'MyHeritage',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: true,
    },
    baseUrl: 'https://www.myheritage.com/research',
    params:
      '?formId=master&formMode=1&action=query&qname=Name+fn.{{name_given}}+ln.{{name_surname}}&qevents-event1=Event+et.birth+ey.{{birth_year}}+ep.{{place_name}}&qevents-any/1event_2=Event+et.death+ey.{{death_year}}&qevents=List',
  },
  {
    key: 'geneanet',
    value: 'Geneanet',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: true,
    },
    baseUrl: 'https://en.geneanet.org/fonds/individus/',
    params: '?size=10&nom={{name_surname}}&prenom={{name_given}}',
  },
  {
    key: 'wikitree',
    value: 'WikiTree',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    baseUrl:
      'https://plus.wikitree.com/function/WTWebProfileSearch/Profiles.htm',
    params:
      '?Query={{name_given}}+{{name_surname}}&MaxProfiles=500&SortOrder=Default&PageSize=10',
  },
  {
    key: 'findagrave',
    value: 'Find A Grave',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    baseUrl: 'https://www.findagrave.com/memorial/search',
    params:
      '?firstname={{name_given}}&middlename={{name_middle}}&lastname={{name_surname}}&birthyear={{birth_year}}&birthyearfilter=&deathyear={{death_year}}&deathyearfilter=',
  },
  // --- CIS / Eastern-European sources -------------------------------------
  // Cyrillic sources use the primary (as-entered) name incl. patronymic.
  // `script: 'latin'` sources use a Latin-script alternate name if recorded.
  {
    key: 'yandexArchive',
    value: 'Яндекс Архив',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    script: 'cyrillic',
    baseUrl: 'https://yandex.ru/archive/search',
    params:
      '?text={{name_family_surname}}+{{name_given}}+{{name_patronymic}}&dateFrom={{birth_year}}&dateTo={{death_year}}&searchZone=name%3Bsheet&rankMode=by_relevance&index=archive',
  },
  {
    key: 'familio',
    value: 'Familio',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    script: 'cyrillic',
    baseUrl: 'https://familio.org/persons',
    params:
      '?f_lastName={{name_family_surname}}&f_firstAndMiddleName={{name_given}}+{{name_patronymic}}&page-persons=1',
  },
  {
    key: 'geni',
    value: 'Geni',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    script: 'cyrillic',
    baseUrl: 'https://www.geni.com/search',
    params: '?search_type=people&names={{name_given}}+{{name_family_surname}}',
  },
  {
    key: 'pamyatNaroda',
    value: 'Память народа',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    script: 'cyrillic',
    baseUrl: 'https://pamyat-naroda.ru/heroes/',
    params:
      '?adv_search=y&last_name={{name_family_surname}}&first_name={{name_given}}&middle_name={{name_patronymic}}',
  },
  {
    key: 'permArchive',
    value: 'Поколения Пермского края',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    script: 'cyrillic',
    baseUrl: 'https://pokolenia.permkrai.ru/records/search/',
    params: '?lastname={{name_family_surname}}',
  },
  {
    key: 'geneteka',
    value: 'Geneteka',
    websiteCriteria: {
      reqRegistration: false,
      reqSubscription: false,
    },
    script: 'latin',
    baseUrl: 'https://geneteka.genealodzy.pl/index.php',
    params:
      '?op=gt&lang=eng&bdm=B&w=&rid=B&search_lastname={{name_family_surname}}&search_name={{name_given}}',
  },
]

class GrampsjsFormExternalSearch extends GrampsjsObjectForm {
  static get properties() {
    return {
      editMode: {type: Boolean},
      hiddenWebsites: {type: Object},
      showAddForm: {type: Boolean},
      customEngines: {type: Array},
      person: {type: Object},
      selectedNameIndex: {type: Number},
    }
  }

  constructor() {
    super()
    this.editMode = false
    this.hiddenWebsites = this._loadHiddenWebsites()
    this.showAddForm = false
    this.customEngines = this._loadCustomEngines()
    this.person = null
    this.selectedNameIndex = 0
  }

  // The person's names (primary first); empty when no person was passed.
  _getNames() {
    return getPersonNames(this.person)
  }

  // Substitution data for the currently selected name. Falls back to the
  // pre-built `this.data` when no person object is available.
  _getSearchData() {
    const names = this._getNames()
    if (!names.length) {
      return this.data
    }
    const name = names[this.selectedNameIndex] || names[0]
    return buildExternalSearchDataForName(name, this.person)
  }

  _handleNameSelect(e) {
    this.selectedNameIndex = Number(e.target.value) || 0
  }

  _loadCustomEngines() {
    const settings = getSettings()
    return settings?.externalSearchCustom || []
  }

  _saveCustomEngines() {
    updateSettings({externalSearchCustom: this.customEngines})
  }

  _loadHiddenWebsites() {
    const settings = getSettings()
    return settings?.externalSearchHidden || {}
  }

  _saveHiddenWebsites() {
    updateSettings({externalSearchHidden: this.hiddenWebsites})
  }

  _toggleEditMode() {
    this.editMode = !this.editMode
  }

  _toggleWebsiteVisibility(key) {
    this.hiddenWebsites = {
      ...this.hiddenWebsites,
      [key]: !this.hiddenWebsites[key],
    }
    this._saveHiddenWebsites()
  }

  _toggleAddForm() {
    this.showAddForm = !this.showAddForm
  }

  _handleAddCustomEngine(e) {
    e.preventDefault()
    const nameField = this.renderRoot.querySelector('#custom-name')
    const urlField = this.renderRoot.querySelector('#custom-url')

    const name = nameField?.value?.trim()
    const url = urlField?.value?.trim()

    if (!name || !url) {
      return
    }

    const key = `custom_${makeHandle()}`
    this.customEngines = [...this.customEngines, {key, name, url}]
    this._saveCustomEngines()

    nameField.value = ''
    urlField.value = ''
    this.showAddForm = false
  }

  _deleteCustomEngine(key) {
    this.customEngines = this.customEngines.filter(engine => engine.key !== key)
    this._saveCustomEngines()
  }

  static get styles() {
    return [
      super.styles,
      css`
        .meta-icon {
          display: inline-flex;
          align-items: center;
        }
        .meta-icon svg {
          height: 0.8em;
          margin-bottom: 2px;
        }
        .legend {
          display: flex;
          gap: 1em;
          margin-top: 1em;
          margin-bottom: 0;
          padding-top: 1em;
          border-top: 1px solid var(--grampsjs-body-font-color-10);
          font-size: 0.9em;
          color: var(--grampsjs-body-font-color-70);
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.3em;
        }
        .legend-item svg {
          height: 0.9em;
          margin-bottom: 1px;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 0.5em;
          margin-bottom: 0.5em;
        }
        md-icon-button {
          --md-icon-button-icon-size: 18px;
          width: 32px;
          height: 32px;
        }
        .item-hidden {
          opacity: 0.4;
        }
        .eye-icon {
          cursor: pointer;
        }
        .add-button-container {
          display: flex;
          align-items: center;
          gap: 0.3em;
          margin-top: 0.5em;
        }
        .add-button-text {
          cursor: pointer;
          color: var(--md-sys-color-primary);
          font-size: 0.95em;
        }
        .add-button-text:hover {
          opacity: 0.8;
        }
        .add-form {
          margin: 1em 0;
          padding: 1em;
          border: 1px solid var(--grampsjs-body-font-color-15);
          border-radius: 4px;
        }
        .add-form md-outlined-text-field {
          width: 100%;
          margin-bottom: 0.5em;
        }
        .add-form-help {
          font-size: 0.85em;
          color: var(--grampsjs-body-font-color-60);
          margin-bottom: 0.75em;
          line-height: 1.4;
        }
        .add-form-buttons {
          display: flex;
          gap: 0.5em;
          justify-content: flex-end;
        }
        .name-select {
          width: 100%;
          margin-bottom: 0.75em;
        }
      `,
    ]
  }

  interpolateTemplate(template, data) {
    // Only the substituted values are URL-encoded; the static template text
    // (which already contains valid separators like & = + %3B) is left as-is.
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
      encodeURIComponent(data[key] || '')
    )
  }

  getExternalSearchWebsitesData() {
    const searchData = this._getSearchData()
    const builtIn = EXTERNAL_SEARCH_WEBSITES.map(website => {
      const siteData = resolveSiteData(searchData, website.script)
      return {
        ...website,
        baseUrl: this.interpolateTemplate(website.baseUrl, siteData),
        params: this.interpolateTemplate(website.params, siteData),
      }
    })

    const custom = this.customEngines.map(engine => ({
      key: engine.key,
      value: engine.name,
      websiteCriteria: {
        reqRegistration: false,
        reqSubscription: false,
      },
      baseUrl: this.interpolateTemplate(engine.url, searchData),
      params: '',
      isCustom: true,
    }))

    return [...builtIn, ...custom]
  }

  getWebCriteriaIcon(websiteCriteria, isCustom) {
    if (isCustom) return null
    if (websiteCriteria.reqSubscription) return mdiLock
    if (websiteCriteria.reqRegistration) return mdiShieldAccount
    return mdiEarth
  }

  _getListItemIcon(web) {
    if (!this.editMode) {
      return renderIcon(mdiOpenInNew, 'var(--grampsjs-body-font-color-100)')
    }
    if (web.isCustom) {
      return renderIcon(mdiDelete, 'var(--grampsjs-body-font-color-100)')
    }
    const icon = this.hiddenWebsites[web.key] ? mdiEyeOff : mdiEye
    return renderIcon(icon, 'var(--grampsjs-body-font-color-100)')
  }

  _handleWebsiteClick(e, web) {
    if (!this.editMode) return
    e.preventDefault()
    if (web.isCustom) {
      this._deleteCustomEngine(web.key)
    } else {
      this._toggleWebsiteVisibility(web.key)
    }
  }

  _renderHeader() {
    return html`
      <div class="header">
        <span>
          ${this._('Search external services for matching records.')}
        </span>
        <md-icon-button @click="${this._toggleEditMode}">
          <grampsjs-icon
            .path="${this.editMode ? mdiCogOff : mdiCog}"
            color="var(--grampsjs-body-font-color-40)"
          ></grampsjs-icon>
        </md-icon-button>
      </div>
    `
  }

  _renderWebsiteItem(web) {
    const metaIcon = this.getWebCriteriaIcon(web.websiteCriteria, web.isCustom)
    return html`
      <div class="${this.hiddenWebsites[web.key] ? 'item-hidden' : ''}">
        <md-list-item
          type="button"
          href="${this.editMode ? '' : `${web.baseUrl}${web.params}`}"
          target="${this.editMode ? '' : '_blank'}"
          @click="${e => this._handleWebsiteClick(e, web)}"
        >
          <span class="icon ${this.editMode ? 'eye-icon' : ''}">
            ${this._getListItemIcon(web)}
          </span>
          <span> ${web.value} </span>
          ${metaIcon
            ? html`<span class="meta-icon">
                ${renderIcon(metaIcon, 'var(--grampsjs-body-font-color-60)')}
              </span>`
            : ''}
        </md-list-item>
      </div>
    `
  }

  _renderWebsiteList(visibleWebUrls) {
    return html`
      <md-list>
        ${visibleWebUrls.map(web => this._renderWebsiteItem(web))}
      </md-list>
    `
  }

  _renderAddCustomEngineForm() {
    if (!this.showAddForm) return ''
    return html`
      <div class="add-form">
        <div class="add-form-help">
          ${this._(
            'Enter a search URL with template variables for person data. Available variables:'
          )}
          <strong
            >{{name_given}}, {{name_surname}}, {{name_family_surname}},
            {{name_patronymic}}, {{place_name}}, {{birth_year}},
            {{death_year}}</strong
          >
        </div>
        <md-outlined-text-field
          id="custom-name"
          label="${this._('Name')}"
          placeholder="${this._('e.g., MyGenealogy')}"
        >
        </md-outlined-text-field>
        <md-outlined-text-field
          id="custom-url"
          label="${this._('Search URL')}"
          placeholder="https://example.com/search?name={{name_given}}_{{name_surname}}"
        >
        </md-outlined-text-field>
        <div class="add-form-buttons">
          <md-text-button @click="${this._toggleAddForm}">
            ${this._('Cancel')}
          </md-text-button>
          <md-filled-button @click="${this._handleAddCustomEngine}">
            ${this._('Add')}
          </md-filled-button>
        </div>
      </div>
    `
  }

  _renderAddCustomEngine() {
    if (!this.editMode) return ''
    return html`
      <div class="add-button-container">
        <md-icon-button @click="${this._toggleAddForm}">
          <grampsjs-icon
            .path="${mdiPlus}"
            color="var(--md-sys-color-primary)"
          ></grampsjs-icon>
        </md-icon-button>
        <span
          class="add-button-text"
          @click="${this._toggleAddForm}"
          @keydown="${clickKeyHandler}"
          tabindex="0"
        >
          ${this._('Add custom search engine')}
        </span>
      </div>
      ${this._renderAddCustomEngineForm()}
    `
  }

  _renderLegend() {
    return html`
      <div class="legend">
        <span class="legend-item">
          ${renderIcon(mdiEarth, 'var(--grampsjs-body-font-color-60)')}
          <span>${this._('Open access')}</span>
        </span>
        <span class="legend-item">
          ${renderIcon(mdiShieldAccount, 'var(--grampsjs-body-font-color-60)')}
          <span>${this._('Registration required')}</span>
        </span>
        <span class="legend-item">
          ${renderIcon(mdiLock, 'var(--grampsjs-body-font-color-60)')}
          <span>${this._('Records require additional access')}</span>
        </span>
      </div>
    `
  }

  _nameOptionLabel(name) {
    const {given, familySurname} = getNameParts(name)
    const text =
      [given, familySurname].filter(Boolean).join(' ') || this._('Name')
    const type = name?.type ? ` (${this._(name.type)})` : ''
    return `${text}${type}`
  }

  // Let the user pick which of the person's names to search by (e.g. maiden vs
  // married name). Only shown when the person has more than one name.
  _renderNameSelector() {
    const names = this._getNames()
    if (names.length < 2) {
      return ''
    }
    return html`
      <md-outlined-select
        class="name-select"
        label="${this._('Name')}"
        .value="${String(this.selectedNameIndex)}"
        @change="${this._handleNameSelect}"
      >
        ${names.map(
          (name, i) => html`
            <md-select-option
              value="${i}"
              ?selected="${i === this.selectedNameIndex}"
            >
              <div slot="headline">${this._nameOptionLabel(name)}</div>
            </md-select-option>
          `
        )}
      </md-outlined-select>
    `
  }

  renderForm() {
    const searchWebUrls = this.getExternalSearchWebsitesData()
    const visibleWebUrls = this.editMode
      ? searchWebUrls
      : searchWebUrls.filter(web => !this.hiddenWebsites[web.key])

    return html`
      <div>
        ${this._renderHeader()} ${this._renderNameSelector()}
        ${this._renderWebsiteList(visibleWebUrls)}
        ${this._renderAddCustomEngine()} ${this._renderLegend()}
      </div>
    `
  }
}

window.customElements.define(
  'grampsjs-form-external-search',
  GrampsjsFormExternalSearch
)
