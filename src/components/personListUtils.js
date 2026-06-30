import {html} from 'lit'
import {mdiAccount} from '@mdi/js'

import {objectIconPath, personProfileDisplayName} from '../util.js'
import './GrampsjsImg.js'
import './GrampsjsIcon.js'

export const genderBorderColor = {
  F: 'var(--color-girl)',
  M: 'var(--color-boy)',
  X: 'var(--color-other)',
  U: 'var(--color-unknown)',
}

export function renderPersonAvatar(extPerson, sex) {
  const handle = extPerson?.media_list?.[0]?.ref || ''
  const rect = extPerson?.media_list?.[0]?.rect || []
  // box-shadow sits flush against the circular edge; works on both grampsjs-img and grampsjs-icon
  const ringColor = genderBorderColor[sex] ?? 'var(--color-unknown)'
  const style = `box-shadow: 0 0 0 2px ${ringColor};`
  if (handle) {
    return html`<grampsjs-img
      handle="${handle}"
      slot="start"
      circle
      square
      size="40"
      .rect="${rect}"
      mime=""
      fallbackIcon="${objectIconPath.person}"
      style="${style}"
    ></grampsjs-img>`
  }
  return html`<grampsjs-icon
    slot="start"
    path="${mdiAccount}"
    color="var(--grampsjs-color-icon)"
    style="${style}"
  ></grampsjs-icon>`
}

export function renderPersonDates(profile, {showAge = true} = {}) {
  const birthStr = profile?.birth?.date || ''
  const deathStr = profile?.death?.date || ''
  const ageStr =
    showAge && profile?.death?.date && profile?.death?.age
      ? `(${profile.death.age})`
      : ''
  if (!birthStr && !deathStr && !ageStr) return ''
  return html`<span slot="supporting-text"
    ><span class="date-col">${birthStr ? `∗ ${birthStr}` : ''}</span
    ><span class="date-col"
      >${deathStr ? `† ${deathStr}` : ''}${ageStr ? ` ${ageStr}` : ''}</span
    ></span
  >`
}

/**
 * Render the inner content of a person list row: gender-ringed avatar, display
 * name, dates, and an optional extra supporting-text line.
 *
 * The caller owns the `<md-list-item>` wrapper (with its classes, event
 * handlers, etc.).  This helper renders only the child nodes that go inside it,
 * so any list component can reuse it while keeping its own interaction logic.
 *
 * @param {object} opts
 * @param {object} opts.profile   - Person profile object (name_given/name_surname/sex/birth/death)
 * @param {object|null} opts.extPerson  - Extended person object for the avatar (media_list)
 * @param {import('lit').TemplateResult|string} [opts.supportingText] - Optional extra node that
 *   projects into `slot="supporting-text"`.  Note that `renderPersonDates` also emits a
 *   `slot="supporting-text"` span, so `md-list-item` will stack both lines when both are
 *   present — this is intentional and matches the original GrampsjsChildren behaviour.
 *   Pass `null`/`undefined` (or omit the key) to render no extra line.
 * @returns {import('lit').TemplateResult}
 */
export function renderPersonListItem({profile, extPerson, supportingText}) {
  const p = profile || {}
  return html`
    ${personProfileDisplayName(p)} ${renderPersonDates(p)}
    ${supportingText != null ? supportingText : ''}
    ${renderPersonAvatar(extPerson, p.sex)}
  `
}
