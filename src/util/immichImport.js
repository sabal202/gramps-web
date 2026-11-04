/*
Pure helpers for the "Immich Import" review/commit flow.

These functions build and transform the client-side review state for both
flows (Flow B: new photos from an Immich album; Flow A: face-region
back-fill on media already in the Gramps tree) without touching the network
or the DOM, so they can be unit tested in isolation.

Review state shape (array of "items", one per photo):
  {
    key,                 // stable identity: immichAssetId (flow B) or mediaHandle (flow A)
    immichAssetId,
    mediaHandle,         // null for flow B until the photo is actually imported
    thumbnailUrl,        // null for flow A (existing media is rendered via grampsjs-img)
    alreadyImported,     // flow B only
    attach,              // flow B only: false = "import without faces" (drop all regions)
    people: [
      {
        immichPersonId,
        name,
        grampsHandle,    // null until resolved/mapped
        rect,            // normalized percent rect [x1,y1,x2,y2], editable
        removed,         // curator removed this region from the review
        alreadyHasRegion // flow A only
      }
    ]
  }
*/

import {normalizeRect, isValidRect} from '../util.js'

/**
 * Stable identity for a preview item, independent of flow.
 * @param {object} item
 * @returns {string}
 */
export function itemKey(item) {
  return item?.immichAssetId ?? item?.mediaHandle ?? ''
}

function buildPersonState(person) {
  const candidateRect = person?.proposedRect ?? null
  return {
    immichPersonId: person?.immichPersonId,
    name: person?.name ?? '',
    grampsHandle: person?.grampsHandle ?? null,
    rect: normalizeRect(candidateRect) ?? candidateRect,
    removed: false,
    alreadyHasRegion: !!person?.alreadyHasRegion,
  }
}

/**
 * Build the initial editable review state from a Flow B album-preview response
 * (`GET /api/immich/albums/<id>/preview`).
 * @param {Array<object>} previewItems
 * @returns {Array<object>}
 */
export function buildAlbumReviewState(previewItems) {
  return (previewItems || []).map(item => ({
    key: itemKey(item),
    immichAssetId: item.immichAssetId,
    mediaHandle: null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    alreadyImported: !!item.alreadyImported,
    attach: true,
    people: (item.people || []).map(buildPersonState),
  }))
}

/**
 * Build the initial editable review state from a Flow A existing-media preview
 * response (`GET /api/immich/existing/preview`).
 * @param {Array<object>} previewItems
 * @returns {Array<object>}
 */
export function buildExistingReviewState(previewItems) {
  return (previewItems || []).map(item => ({
    key: item.mediaHandle,
    immichAssetId: item.immichAssetId ?? null,
    mediaHandle: item.mediaHandle,
    thumbnailUrl: null,
    alreadyImported: true,
    attach: true,
    people: (item.people || []).map(buildPersonState),
  }))
}

/**
 * Replace the rect of a single person's region within one item.
 */
export function updatePersonRect(state, key, immichPersonId, rect) {
  return (state || []).map(item =>
    item.key === key
      ? {
          ...item,
          people: item.people.map(p =>
            p.immichPersonId === immichPersonId
              ? {...p, rect, removed: false}
              : p
          ),
        }
      : item
  )
}

/**
 * Mark a person's region as removed (or restore it) within one item.
 */
export function setPersonRemoved(state, key, immichPersonId, removed) {
  return (state || []).map(item =>
    item.key === key
      ? {
          ...item,
          people: item.people.map(p =>
            p.immichPersonId === immichPersonId ? {...p, removed} : p
          ),
        }
      : item
  )
}

/**
 * Flow B only: toggle "import without faces" for one item — when `attach` is
 * false, no regions are sent for that photo on commit (the photo/media is
 * still attached, just without face regions).
 */
export function setItemAttach(state, key, attach) {
  return (state || []).map(item =>
    item.key === key ? {...item, attach} : item
  )
}

/**
 * Apply a freshly-confirmed Immich person -> Gramps person mapping to every
 * occurrence of that Immich person across the whole review state, so the
 * curator doesn't have to re-resolve the same person on every photo.
 */
export function applyPersonMapping(state, immichPersonId, grampsHandle) {
  return (state || []).map(item => ({
    ...item,
    people: item.people.map(p =>
      p.immichPersonId === immichPersonId ? {...p, grampsHandle} : p
    ),
  }))
}

/**
 * Deduplicated list of persons that still need a Gramps mapping, across all
 * (non-removed) items/regions currently in the review state.
 * @returns {Array<{immichPersonId: string, name: string}>}
 */
export function getUnmappedPersons(state) {
  const seen = new Map()
  ;(state || []).forEach(item => {
    item.people.forEach(p => {
      if (!p.grampsHandle && !p.removed && !seen.has(p.immichPersonId)) {
        seen.set(p.immichPersonId, {
          immichPersonId: p.immichPersonId,
          name: p.name,
        })
      }
    })
  })
  return Array.from(seen.values())
}

function activeRegions(item) {
  return (item.people || []).filter(
    p => !p.removed && p.grampsHandle && isValidRect(p.rect)
  )
}

/**
 * Number of regions that will actually be committed for one item (excludes
 * removed regions and regions whose person is still unmapped).
 */
export function countActiveRegions(item) {
  return activeRegions(item).length
}

/**
 * Build the commit payload for `POST /api/immich/albums/<album_id>/commit`.
 */
export function buildAlbumCommitPayload(target, state) {
  return {
    target,
    items: (state || []).map(item => ({
      immichAssetId: item.immichAssetId,
      attach: item.attach,
      regions: item.attach
        ? activeRegions(item).map(p => ({
            grampsHandle: p.grampsHandle,
            rect: p.rect,
          }))
        : [],
    })),
  }
}

/**
 * Build the commit payload for `POST /api/immich/existing/commit`.
 */
export function buildExistingCommitPayload(state) {
  return {
    items: (state || []).map(item => ({
      mediaHandle: item.mediaHandle,
      regions: activeRegions(item).map(p => ({
        grampsHandle: p.grampsHandle,
        rect: p.rect,
      })),
    })),
  }
}
