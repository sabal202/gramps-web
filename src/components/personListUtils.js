import {html} from 'lit'
import {mdiAccount} from '@mdi/js'

import {objectIconPath} from '../util.js'
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
 * Decide what to show for a person's age, from the backend-computed
 * `profile.current_age` field. Returns null when there's nothing to show
 * (no birth date, or an undated person too old to plausibly still be alive —
 * see gramps-web-api's get_person_profile_for_object).
 *
 * @param {object} profile - Person profile object
 * @returns {{age: string, isDeceased: boolean}|null}
 */
export function getCurrentAgeInfo(profile) {
  const age = profile?.current_age
  if (!age) {
    return null
  }
  const isDeceased = Boolean(
    profile?.death && Object.keys(profile.death).length > 0
  )
  return {age, isDeceased}
}
