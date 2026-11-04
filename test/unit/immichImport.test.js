import {describe, it, expect} from 'vitest'
import {
  itemKey,
  buildAlbumReviewState,
  buildExistingReviewState,
  updatePersonRect,
  setPersonRemoved,
  setItemAttach,
  applyPersonMapping,
  getUnmappedPersons,
  countActiveRegions,
  buildAlbumCommitPayload,
  buildExistingCommitPayload,
} from '../../src/util/immichImport.js'

// ---------------------------------------------------------------------------
// itemKey
// ---------------------------------------------------------------------------

describe('itemKey', () => {
  it('uses immichAssetId when present', () => {
    expect(itemKey({immichAssetId: 'a1', mediaHandle: 'm1'})).toBe('a1')
  })

  it('falls back to mediaHandle when immichAssetId is absent', () => {
    expect(itemKey({mediaHandle: 'm1'})).toBe('m1')
  })

  it('returns empty string when neither is present', () => {
    expect(itemKey({})).toBe('')
  })
})

// ---------------------------------------------------------------------------
// buildAlbumReviewState (Flow B)
// ---------------------------------------------------------------------------

describe('buildAlbumReviewState', () => {
  const previewItems = [
    {
      immichAssetId: 'asset-1',
      thumbnailUrl: '/api/immich/albums/1/assets/asset-1/thumbnail',
      alreadyImported: false,
      people: [
        {
          immichPersonId: 'p1',
          name: 'Jane',
          bbox: [10, 10, 30, 30],
          grampsHandle: null,
          proposedRect: [5, 5, 35, 45],
        },
        {
          immichPersonId: 'p2',
          name: 'Known Person',
          bbox: [50, 50, 70, 70],
          grampsHandle: 'handle-known',
          proposedRect: [45, 40, 75, 80],
        },
      ],
    },
  ]

  it('returns one entry per preview item, keyed by immichAssetId', () => {
    const state = buildAlbumReviewState(previewItems)
    expect(state).toHaveLength(1)
    expect(state[0].key).toBe('asset-1')
    expect(state[0].mediaHandle).toBeNull()
    expect(state[0].thumbnailUrl).toBe(previewItems[0].thumbnailUrl)
  })

  it('defaults attach to true (faces included by default)', () => {
    const state = buildAlbumReviewState(previewItems)
    expect(state[0].attach).toBe(true)
  })

  it('carries over person fields and normalizes the proposed rect', () => {
    const state = buildAlbumReviewState(previewItems)
    const [jane, known] = state[0].people
    expect(jane.immichPersonId).toBe('p1')
    expect(jane.name).toBe('Jane')
    expect(jane.grampsHandle).toBeNull()
    expect(jane.rect).toEqual([5, 5, 35, 45])
    expect(jane.removed).toBe(false)
    expect(known.grampsHandle).toBe('handle-known')
  })

  it('handles an empty/undefined input gracefully', () => {
    expect(buildAlbumReviewState([])).toEqual([])
    expect(buildAlbumReviewState(undefined)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildExistingReviewState (Flow A)
// ---------------------------------------------------------------------------

describe('buildExistingReviewState', () => {
  const previewItems = [
    {
      mediaHandle: 'media-1',
      immichAssetId: 'asset-9',
      people: [
        {
          immichPersonId: 'p3',
          name: 'Someone',
          grampsHandle: null,
          proposedRect: [1, 2, 3, 4],
          alreadyHasRegion: false,
        },
      ],
    },
  ]

  it('keys by mediaHandle and carries no thumbnailUrl', () => {
    const state = buildExistingReviewState(previewItems)
    expect(state[0].key).toBe('media-1')
    expect(state[0].mediaHandle).toBe('media-1')
    expect(state[0].thumbnailUrl).toBeNull()
    expect(state[0].alreadyImported).toBe(true)
  })

  it('preserves alreadyHasRegion on the person', () => {
    const state = buildExistingReviewState(previewItems)
    expect(state[0].people[0].alreadyHasRegion).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updatePersonRect / setPersonRemoved / setItemAttach
// ---------------------------------------------------------------------------

describe('updatePersonRect', () => {
  it('updates only the targeted person in the targeted item', () => {
    const state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
          {immichPersonId: 'p2', name: 'B', proposedRect: [20, 20, 30, 30]},
        ],
      },
      {
        immichAssetId: 'a2',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
        ],
      },
    ])
    const updated = updatePersonRect(state, 'a1', 'p1', [1, 1, 11, 11])
    expect(updated[0].people[0].rect).toEqual([1, 1, 11, 11])
    expect(updated[0].people[1].rect).toEqual([20, 20, 30, 30])
    // other item untouched
    expect(updated[1].people[0].rect).toEqual([0, 0, 10, 10])
  })

  it('clears the removed flag when a rect is (re)drawn', () => {
    let state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
        ],
      },
    ])
    state = setPersonRemoved(state, 'a1', 'p1', true)
    expect(state[0].people[0].removed).toBe(true)
    state = updatePersonRect(state, 'a1', 'p1', [2, 2, 12, 12])
    expect(state[0].people[0].removed).toBe(false)
  })
})

describe('setItemAttach', () => {
  it('toggles attach only for the targeted item', () => {
    const state = buildAlbumReviewState([
      {immichAssetId: 'a1', people: []},
      {immichAssetId: 'a2', people: []},
    ])
    const updated = setItemAttach(state, 'a1', false)
    expect(updated[0].attach).toBe(false)
    expect(updated[1].attach).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyPersonMapping / getUnmappedPersons
// ---------------------------------------------------------------------------

describe('applyPersonMapping', () => {
  it('applies the mapping to every occurrence of the same immichPersonId', () => {
    const state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
        ],
      },
      {
        immichAssetId: 'a2',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
          {immichPersonId: 'p2', name: 'B', proposedRect: [0, 0, 10, 10]},
        ],
      },
    ])
    const mapped = applyPersonMapping(state, 'p1', 'gramps-handle-1')
    expect(mapped[0].people[0].grampsHandle).toBe('gramps-handle-1')
    expect(mapped[1].people[0].grampsHandle).toBe('gramps-handle-1')
    expect(mapped[1].people[1].grampsHandle).toBeNull()
  })
})

describe('getUnmappedPersons', () => {
  it('deduplicates unmapped persons across items', () => {
    const state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
        ],
      },
      {
        immichAssetId: 'a2',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
          {
            immichPersonId: 'p2',
            name: 'B',
            grampsHandle: 'h2',
            proposedRect: [0, 0, 10, 10],
          },
        ],
      },
    ])
    const unmapped = getUnmappedPersons(state)
    expect(unmapped).toEqual([{immichPersonId: 'p1', name: 'A'}])
  })

  it('excludes removed regions', () => {
    let state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {immichPersonId: 'p1', name: 'A', proposedRect: [0, 0, 10, 10]},
        ],
      },
    ])
    state = setPersonRemoved(state, 'a1', 'p1', true)
    expect(getUnmappedPersons(state)).toEqual([])
  })

  it('returns an empty array when everyone is mapped', () => {
    const state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {
            immichPersonId: 'p1',
            name: 'A',
            grampsHandle: 'h1',
            proposedRect: [0, 0, 10, 10],
          },
        ],
      },
    ])
    expect(getUnmappedPersons(state)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// countActiveRegions
// ---------------------------------------------------------------------------

describe('countActiveRegions', () => {
  it('counts only mapped, non-removed, valid-rect regions', () => {
    const state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {
            immichPersonId: 'p1',
            name: 'Mapped',
            grampsHandle: 'h1',
            proposedRect: [0, 0, 10, 10],
          },
          {
            immichPersonId: 'p2',
            name: 'Unmapped',
            grampsHandle: null,
            proposedRect: [0, 0, 10, 10],
          },
        ],
      },
    ])
    expect(countActiveRegions(state[0])).toBe(1)
  })

  it('drops a region once removed', () => {
    let state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {
            immichPersonId: 'p1',
            name: 'Mapped',
            grampsHandle: 'h1',
            proposedRect: [0, 0, 10, 10],
          },
        ],
      },
    ])
    expect(countActiveRegions(state[0])).toBe(1)
    state = setPersonRemoved(state, 'a1', 'p1', true)
    expect(countActiveRegions(state[0])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildAlbumCommitPayload / buildExistingCommitPayload
// ---------------------------------------------------------------------------

describe('buildAlbumCommitPayload', () => {
  it('builds the frozen-contract shape with only mapped, active regions', () => {
    const state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        alreadyImported: false,
        people: [
          {
            immichPersonId: 'p1',
            name: 'Mapped',
            grampsHandle: 'h1',
            proposedRect: [1, 2, 3, 4],
          },
          {
            immichPersonId: 'p2',
            name: 'Unmapped',
            grampsHandle: null,
            proposedRect: [5, 6, 7, 8],
          },
        ],
      },
    ])
    const payload = buildAlbumCommitPayload('E0001', state)
    expect(payload).toEqual({
      target: 'E0001',
      items: [
        {
          immichAssetId: 'a1',
          attach: true,
          regions: [{grampsHandle: 'h1', rect: [1, 2, 3, 4]}],
        },
      ],
    })
  })

  it('sends no regions for an item with attach=false ("import without faces")', () => {
    let state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {
            immichPersonId: 'p1',
            name: 'Mapped',
            grampsHandle: 'h1',
            proposedRect: [1, 2, 3, 4],
          },
        ],
      },
    ])
    state = setItemAttach(state, 'a1', false)
    const payload = buildAlbumCommitPayload('E0001', state)
    expect(payload.items[0].regions).toEqual([])
    expect(payload.items[0].attach).toBe(false)
  })

  it('excludes a region whose person was removed by the curator', () => {
    let state = buildAlbumReviewState([
      {
        immichAssetId: 'a1',
        people: [
          {
            immichPersonId: 'p1',
            name: 'Mapped',
            grampsHandle: 'h1',
            proposedRect: [1, 2, 3, 4],
          },
        ],
      },
    ])
    state = setPersonRemoved(state, 'a1', 'p1', true)
    const payload = buildAlbumCommitPayload('E0001', state)
    expect(payload.items[0].regions).toEqual([])
  })
})

describe('buildExistingCommitPayload', () => {
  it('builds the frozen-contract shape keyed by mediaHandle', () => {
    const state = buildExistingReviewState([
      {
        mediaHandle: 'm1',
        people: [
          {
            immichPersonId: 'p1',
            name: 'Mapped',
            grampsHandle: 'h1',
            proposedRect: [1, 2, 3, 4],
          },
          {
            immichPersonId: 'p2',
            name: 'Unmapped',
            grampsHandle: null,
            proposedRect: [5, 6, 7, 8],
          },
        ],
      },
    ])
    const payload = buildExistingCommitPayload(state)
    expect(payload).toEqual({
      items: [
        {
          mediaHandle: 'm1',
          regions: [{grampsHandle: 'h1', rect: [1, 2, 3, 4]}],
        },
      ],
    })
  })
})
