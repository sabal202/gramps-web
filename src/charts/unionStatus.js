// Union-status marker semantics (ported from feat/union-status).
// Pure functions and constants only — no imports, no DOM side effects.
// Unit-tested via test/unit/maritalStatusToMarker.test.js and
// test/unit/formatUnionDates.test.js (which import them through
// RelationshipChart.js re-exports).

export const UNKNOWN_MARITAL_STATUS = 'unknown'

export const unionStatusLabels = {
  married: 'married',
  divorced: 'divorced',
  widowed: 'widowed',
  partners: 'partners',
  unknown: 'unknown',
}

function extractYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return ''
  const m = dateStr.match(/\d{4}/)
  return m ? m[0] : ''
}

export function formatUnionDates(status, unionDates) {
  if (!status) return ''
  const marriageYear = extractYear(unionDates?.marriage?.date)
  const divorceYear = extractYear(unionDates?.divorce?.date)
  switch (status) {
    case 'married':
    case 'widowed':
      return marriageYear
    case 'divorced': {
      if (marriageYear && divorceYear) return `${marriageYear}–${divorceYear}`
      if (divorceYear) return divorceYear
      return marriageYear
    }
    case 'partners':
      return marriageYear
    default:
      return ''
  }
}

export function maritalStatusToMarker(status) {
  switch (status) {
    case 'married':
      return {rings: 2, filled: true, dashed: false, slash: false, cross: false}
    case 'divorced':
      return {rings: 2, filled: true, dashed: false, slash: true, cross: false}
    case 'partners':
      return {rings: 1, filled: false, dashed: true, slash: false, cross: false}
    case 'widowed':
      return {rings: 1, filled: true, dashed: false, slash: false, cross: true}
    default:
      // 'unknown' and any unrecognised value: neutral, bar only, no rings
      return {
        rings: 0,
        filled: false,
        dashed: false,
        slash: false,
        cross: false,
      }
  }
}
