import {describe, it, expect} from 'vitest'
import {buildIcsUrl, buildGoogleCalendarUrl} from '../../src/calendarUrl.js'

describe('buildIcsUrl — scope=all', () => {
  it('builds an https link with token and default event types', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: ['Birth', 'Marriage'],
      scope: 'all',
    })
    expect(url).toBe(
      'https://gramps.example.com/api/anniversaries.ics?token=abc123&event_types=Birth%2CMarriage'
    )
  })

  it('does not include anchor_gramps_id/generation_depth for scope=all even if anchor is passed', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: ['Birth'],
      scope: 'all',
      anchorGrampsId: 'I0001',
      depth: 5,
    })
    expect(url).not.toContain('anchor_gramps_id')
    expect(url).not.toContain('generation_depth')
  })
})

describe('buildIcsUrl — scope=close', () => {
  it('includes anchor_gramps_id and generation_depth when an anchor is set', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: ['Birth'],
      scope: 'close',
      anchorGrampsId: 'I0001',
      depth: 6,
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('anchor_gramps_id')).toBe('I0001')
    expect(parsed.searchParams.get('generation_depth')).toBe('6')
  })

  it('omits anchor_gramps_id/generation_depth when scope=close but no anchor is chosen yet', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: ['Birth'],
      scope: 'close',
      anchorGrampsId: '',
      depth: 4,
    })
    expect(url).not.toContain('anchor_gramps_id')
    expect(url).not.toContain('generation_depth')
  })
})

describe('buildIcsUrl — scheme', () => {
  it('uses webcal://<host> (no origin) for the webcal scheme', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'webcal',
      token: 'abc123',
      eventTypes: ['Birth'],
      scope: 'all',
    })
    expect(
      url.startsWith('webcal://gramps.example.com/api/anniversaries.ics?')
    ).toBe(true)
  })

  it('uses the https origin for the https scheme', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: ['Birth'],
      scope: 'all',
    })
    expect(
      url.startsWith('https://gramps.example.com/api/anniversaries.ics?')
    ).toBe(true)
  })
})

describe('buildIcsUrl — event types', () => {
  it('omits event_types entirely when the list is empty', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: [],
      scope: 'all',
    })
    expect(url).not.toContain('event_types')
  })

  it('joins multiple event types with a comma', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'abc123',
      eventTypes: ['Birth', 'Marriage', 'Death'],
      scope: 'all',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('event_types')).toBe('Birth,Marriage,Death')
  })
})

describe('buildIcsUrl — token URL-encoding', () => {
  it('URL-encodes special characters in the token param', () => {
    const url = buildIcsUrl({
      origin: 'https://gramps.example.com',
      host: 'gramps.example.com',
      scheme: 'https',
      token: 'a b+c/d',
      eventTypes: [],
      scope: 'all',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('token')).toBe('a b+c/d')
    expect(url).toContain('token=a+b%2Bc%2Fd')
  })
})

describe('buildGoogleCalendarUrl', () => {
  it('URL-encodes the webcal link as the cid query param', () => {
    const webcalUrl =
      'webcal://gramps.example.com/api/anniversaries.ics?token=abc123&event_types=Birth%2CMarriage'
    const url = buildGoogleCalendarUrl(webcalUrl)
    expect(url).toBe(
      'https://calendar.google.com/calendar/render?cid=' +
        encodeURIComponent(webcalUrl)
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.get('cid')).toBe(webcalUrl)
  })

  it('encodes reserved characters (&, :, ?) so the cid stays a single param', () => {
    const webcalUrl = 'webcal://example.com/api/anniversaries.ics?token=a&b=c'
    const url = buildGoogleCalendarUrl(webcalUrl)
    expect(url).not.toMatch(/cid=webcal:\/\//)
    const parsed = new URL(url)
    expect(parsed.searchParams.get('cid')).toBe(webcalUrl)
  })
})
