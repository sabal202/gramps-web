/*
Shared rendering for a single transaction row in a revision/change-history
list. Used both by the global Revision History page (GrampsjsViewRevisions)
and by the per-object "Changes" section (GrampsjsObjectHistory).

Exported as plain functions rather than a custom element: the caller places
the returned `<md-list-item>` / `<md-divider>` markup directly inside its own
`<md-list>`, matching the pattern already used by
`components/personListUtils.js` (`renderPersonListItem`). Wrapping the row in
its own shadow-DOM custom element instead would make it a single opaque
slotted child from `<md-list>`'s point of view, which breaks Material Web's
`queryAssignedElements`-based keyboard roving-tabindex (it only looks at
directly slotted elements, not descendants inside a nested shadow root).
*/
import {html} from 'lit'

import '@material/web/list/list-item.js'
import '@material/web/divider/divider.js'
import {
  mdiSourceCommit,
  mdiAccountPlus,
  mdiAccountMultiplePlus,
  mdiCalendarPlus,
  mdiLabel,
  mdiBookmarkPlus,
  mdiArchivePlus,
  mdiImagePlus,
  mdiMapMarkerPlus,
  mdiTextBoxPlus,
  mdiBookOpenVariant,
  mdiAccountEdit,
  mdiAccountMultiple,
  mdiCalendarEdit,
  mdiBookmark,
  mdiArchiveEdit,
  mdiImageEdit,
  mdiMapMarker,
  mdiTextBoxEdit,
  mdiAccountMinus,
  mdiAccountMultipleMinus,
  mdiCalendarMinus,
  mdiBookmarkMinus,
  mdiArchiveMinus,
  mdiImageMinus,
  mdiMapMarkerMinus,
  mdiTextBoxMinus,
  mdiTimelineQuestionOutline,
} from '@mdi/js'

import './GrampsjsIcon.js'
import './GrampsjsTimedelta.js'

// trans_type: 0 = add, 1 = edit, 2 = delete
export const changeIcons = {
  Person_0: mdiAccountPlus,
  Family_0: mdiAccountMultiplePlus,
  Event_0: mdiCalendarPlus,
  Place_0: mdiMapMarkerPlus,
  Source_0: mdiBookOpenVariant,
  Citation_0: mdiBookmarkPlus,
  Repository_0: mdiArchivePlus,
  Note_0: mdiTextBoxPlus,
  Tag_0: mdiLabel,
  Media_0: mdiImagePlus,
  Person_1: mdiAccountEdit,
  Family_1: mdiAccountMultiple,
  Event_1: mdiCalendarEdit,
  Place_1: mdiMapMarker,
  Source_1: mdiBookOpenVariant,
  Citation_1: mdiBookmark,
  Repository_1: mdiArchiveEdit,
  Note_1: mdiTextBoxEdit,
  Tag_1: mdiLabel,
  Media_1: mdiImageEdit,
  Person_2: mdiAccountMinus,
  Family_2: mdiAccountMultipleMinus,
  Event_2: mdiCalendarMinus,
  Place_2: mdiMapMarkerMinus,
  Source_2: mdiBookOpenVariant,
  Citation_2: mdiBookmarkMinus,
  Repository_2: mdiArchiveMinus,
  Note_2: mdiTextBoxMinus,
  Tag_2: mdiLabel,
  Media_2: mdiImageMinus,
}

/**
 * Group a transaction's changes the same way the global Revision History
 * page does (by "<obj_class>_<trans_type>", one icon per group), and flag
 * whether each group contains a change touching one of `highlightHandles`
 * (the per-object "Changes" section uses this to emphasize the icons
 * relevant to the object/page being viewed).
 *
 * Pure function (no DOM/appState access) so it can be unit-tested directly.
 *
 * @param {object} transaction - transaction as returned by the API, with
 *   `changes: [{obj_class, trans_type, obj_handle}]`
 * @param {string[]} [highlightHandles] - handles to emphasize; when
 *   omitted/empty no group is flagged as highlighted
 * @returns {Array<{key: string, count: number, highlighted: boolean}>}
 */
export function groupTransactionChanges(transaction, highlightHandles) {
  const handleSet = new Set(
    Array.isArray(highlightHandles) ? highlightHandles : []
  )
  const groups = {}
  ;(transaction?.changes || []).forEach(change => {
    // eslint-disable-next-line camelcase
    const objClass = change?.obj_class
    // eslint-disable-next-line camelcase
    const transType = change?.trans_type
    const key = `${objClass}_${transType}`
    if (!groups[key]) {
      groups[key] = {key, count: 0, highlighted: false}
    }
    groups[key].count += 1
    if (handleSet.size > 0 && handleSet.has(change?.obj_handle)) {
      groups[key].highlighted = true
    }
  })
  return Object.values(groups)
}

// Minimal re-implementation of GrampsjsAppStateMixin's `_(key)` translation
// helper for use in this module's plain (non-LitElement) render functions.
function translate(appState, key, ...args) {
  if (key === undefined) {
    return ''
  }
  const strings = appState?.i18n?.strings
  let t = strings && key in strings ? strings[key] : key
  t = t.replace('_', '')
  args.forEach(arg => {
    t = t.replace('%s', arg)
  })
  return t
}

export function renderUser(user) {
  return user?.full_name || user?.name
}

/**
 * Render a single transaction as `<md-list-item>` + trailing `<md-divider>`,
 * matching the row markup previously inlined in GrampsjsViewRevisions
 * (`_renderTransaction`). The caller must place the result inside an
 * `<md-list>`.
 *
 * @param {object} opts
 * @param {object} opts.transaction
 * @param {object} opts.appState
 * @param {string[]} [opts.highlightHandles] - handles to emphasize
 *   (typically `transaction.matched_handles` from the per-object history
 *   endpoint); omit for the plain/global rendering.
 * @returns {import('lit').TemplateResult}
 */
export function renderRevisionListItem({
  transaction,
  appState,
  highlightHandles,
}) {
  const txn = transaction || {}
  const groups = groupTransactionChanges(txn, highlightHandles)
  return html`<md-list-item
      ?interactive="${!!txn.changes?.length}"
      type="${txn.changes?.length ? 'link' : 'text'}"
      href="${txn.changes?.length ? `/revision/${txn.id}` : ''}"
    >
      <div slot="headline">${translate(appState, txn.description)}</div>
      <grampsjs-icon
        slot="start"
        path="${mdiSourceCommit}"
        color="var(--grampsjs-body-font-color-50)"
      ></grampsjs-icon>
      ${txn.changes?.length
        ? groups.map(({key, highlighted}) =>
            changeIcons[key]
              ? html`<grampsjs-icon
                  slot="end"
                  path="${changeIcons[key]}"
                  color="${highlighted
                    ? 'var(--mdc-theme-secondary)'
                    : 'var(--grampsjs-body-font-color-45)'}"
                ></grampsjs-icon>`
              : ''
          )
        : html`<grampsjs-icon
            slot="end"
            path="${mdiTimelineQuestionOutline}"
            color="var(--grampsjs-body-font-color-45)"
          ></grampsjs-icon>`}
      <div slot="supporting-text">
        <span class="user">
          ${txn.connection?.user
            ? renderUser(txn.connection?.user)
            : translate(appState, 'Unknown')},
        </span>
        <span class="time">
          <grampsjs-timedelta
            timestamp="${txn.timestamp}"
            locale="${appState?.i18n?.lang}"
          ></grampsjs-timedelta>
        </span>
      </div>
    </md-list-item>
    <md-divider></md-divider> `
}
