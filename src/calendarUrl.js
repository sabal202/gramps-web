/*
Pure, DOM-free helpers for building the family calendar (ICS feed)
subscription URL and the Google Calendar "add by URL" link.

Kept separate from GrampsjsViewCalendar.js so they can be unit-tested
with vitest without touching any DOM/lit machinery.
*/

// Build the URL of the ICS feed (`/api/anniversaries.ics`) for the given
// subscription settings.
//
//   origin          window.location.origin, e.g. "https://gramps.example.com"
//   host            window.location.host, e.g. "gramps.example.com"
//   scheme          'https' or 'webcal'
//   token           the persistent access token (required)
//   eventTypes      array of Gramps event type names, e.g. ['Birth', 'Marriage']
//   scope           'all' or 'close'
//   anchorGrampsId  Gramps ID of the anchor person (only used when scope is 'close')
//   depth           generation depth (only used when scope is 'close' and an anchor is set)
export function buildIcsUrl({
  origin,
  host,
  scheme,
  token,
  eventTypes = [],
  scope = 'all',
  anchorGrampsId = '',
  depth = 4,
}) {
  const base =
    (scheme === 'webcal' ? `webcal://${host}` : origin) +
    '/api/anniversaries.ics'
  const params = new URLSearchParams()
  params.set('token', token)
  if (eventTypes.length > 0) {
    params.set('event_types', eventTypes.join(','))
  }
  if (scope === 'close' && anchorGrampsId) {
    params.set('anchor_gramps_id', anchorGrampsId)
    params.set('generation_depth', String(depth))
  }
  return `${base}?${params.toString()}`
}

// Build the "add by URL" link for Google Calendar, given the webcal:// URL
// of the ICS feed.
export function buildGoogleCalendarUrl(webcalUrl) {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(
    webcalUrl
  )}`
}
