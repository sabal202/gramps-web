import {describe, it, expect} from 'vitest'
import {
  changeIcons,
  groupTransactionChanges,
  renderUser,
  renderRevisionListItem,
} from '../../src/components/GrampsjsRevisionListItem.js'

const appState = {i18n: {strings: {}, lang: 'en'}}

// ---------------------------------------------------------------------------
// Minimal Lit TemplateResult tree walker (this branch predates the shared
// test/unit/helpers.js added by other in-flight branches, so a small local
// copy is used here rather than depending on code that doesn't exist yet on
// this branch's base).
// ---------------------------------------------------------------------------

function hasValue(templateResult, pred) {
  if (!templateResult || typeof templateResult !== 'object') return false
  if (Array.isArray(templateResult)) {
    return templateResult.some(item => hasValue(item, pred))
  }
  const vals = templateResult.values
  if (!Array.isArray(vals)) return false
  for (const v of vals) {
    if (pred(v)) return true
    if (v && typeof v === 'object' && hasValue(v, pred)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// groupTransactionChanges
// ---------------------------------------------------------------------------

describe('groupTransactionChanges', () => {
  it('returns an empty array for a transaction with no changes', () => {
    expect(groupTransactionChanges({changes: []})).toEqual([])
  })

  it('handles a missing/undefined transaction gracefully', () => {
    expect(groupTransactionChanges(undefined)).toEqual([])
    expect(groupTransactionChanges({})).toEqual([])
  })

  it('groups changes by obj_class + trans_type and counts them', () => {
    const txn = {
      changes: [
        {obj_class: 'Person', trans_type: 1, obj_handle: 'h1'},
        {obj_class: 'Person', trans_type: 1, obj_handle: 'h2'},
        {obj_class: 'Event', trans_type: 0, obj_handle: 'h3'},
      ],
    }
    expect(groupTransactionChanges(txn)).toEqual([
      {key: 'Person_1', count: 2, highlighted: false},
      {key: 'Event_0', count: 1, highlighted: false},
    ])
  })

  it('flags a group as highlighted when one of its changes matches a highlight handle', () => {
    const txn = {
      changes: [
        {obj_class: 'Person', trans_type: 1, obj_handle: 'h1'},
        {obj_class: 'Event', trans_type: 0, obj_handle: 'h3'},
      ],
    }
    const groups = groupTransactionChanges(txn, ['h3'])
    expect(groups.find(g => g.key === 'Person_1').highlighted).toBe(false)
    expect(groups.find(g => g.key === 'Event_0').highlighted).toBe(true)
  })

  it('flags the whole group if any (not necessarily all) change in it matches', () => {
    const txn = {
      changes: [
        {obj_class: 'Person', trans_type: 1, obj_handle: 'h1'},
        {obj_class: 'Person', trans_type: 1, obj_handle: 'h2'},
      ],
    }
    const groups = groupTransactionChanges(txn, ['h2'])
    expect(groups).toEqual([{key: 'Person_1', count: 2, highlighted: true}])
  })

  it('does not flag anything when highlightHandles is empty or omitted', () => {
    const txn = {
      changes: [{obj_class: 'Person', trans_type: 1, obj_handle: 'h1'}],
    }
    expect(groupTransactionChanges(txn).every(g => !g.highlighted)).toBe(true)
    expect(groupTransactionChanges(txn, []).every(g => !g.highlighted)).toBe(
      true
    )
  })
})

// ---------------------------------------------------------------------------
// renderUser
// ---------------------------------------------------------------------------

describe('renderUser', () => {
  it('prefers full_name over name', () => {
    expect(renderUser({full_name: 'Jane Doe', name: 'jdoe'})).toBe('Jane Doe')
  })

  it('falls back to name when full_name is absent', () => {
    expect(renderUser({name: 'jdoe'})).toBe('jdoe')
  })

  it('returns undefined for a null/undefined user', () => {
    expect(renderUser(null)).toBeUndefined()
    expect(renderUser(undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// renderRevisionListItem
// ---------------------------------------------------------------------------

describe('renderRevisionListItem', () => {
  const baseTxn = {
    id: 42,
    description: 'Edit Person',
    timestamp: 1700000000,
    connection: {user: {full_name: 'Jane Doe'}},
    changes: [{obj_class: 'Person', trans_type: 1, obj_handle: 'h1'}],
  }

  it('links to /revision/<id> when the transaction has changes', () => {
    const result = renderRevisionListItem({transaction: baseTxn, appState})
    expect(hasValue(result, v => v === '/revision/42')).toBe(true)
  })

  it('renders type="text" and an empty href for a transaction with no changes', () => {
    const result = renderRevisionListItem({
      transaction: {...baseTxn, changes: []},
      appState,
    })
    expect(hasValue(result, v => v === 'text')).toBe(true)
    expect(hasValue(result, v => v === '/revision/42')).toBe(false)
  })

  it('shows the connection user full_name', () => {
    const result = renderRevisionListItem({transaction: baseTxn, appState})
    expect(hasValue(result, v => v === 'Jane Doe')).toBe(true)
  })

  it('falls back to "Unknown" when there is no connection user', () => {
    const result = renderRevisionListItem({
      transaction: {...baseTxn, connection: {}},
      appState,
    })
    expect(hasValue(result, v => v === 'Unknown')).toBe(true)
  })

  it('uses the emphasized color for a change-icon group that matches highlightHandles', () => {
    const result = renderRevisionListItem({
      transaction: baseTxn,
      appState,
      highlightHandles: ['h1'],
    })
    expect(hasValue(result, v => v === 'var(--mdc-theme-secondary)')).toBe(true)
  })

  it('does not use the emphasized color when highlightHandles does not match', () => {
    const result = renderRevisionListItem({
      transaction: baseTxn,
      appState,
      highlightHandles: ['some-other-handle'],
    })
    expect(hasValue(result, v => v === 'var(--mdc-theme-secondary)')).toBe(
      false
    )
  })

  it('does not use the emphasized color when highlightHandles is omitted', () => {
    const result = renderRevisionListItem({transaction: baseTxn, appState})
    expect(hasValue(result, v => v === 'var(--mdc-theme-secondary)')).toBe(
      false
    )
  })

  it('handles a null/undefined transaction without throwing', () => {
    expect(() =>
      renderRevisionListItem({transaction: null, appState})
    ).not.toThrow()
    expect(() =>
      renderRevisionListItem({transaction: undefined, appState})
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// changeIcons
// ---------------------------------------------------------------------------

describe('changeIcons', () => {
  it('has an add/edit/delete icon for every primary object type', () => {
    const types = [
      'Person',
      'Family',
      'Event',
      'Place',
      'Source',
      'Citation',
      'Repository',
      'Note',
      'Tag',
      'Media',
    ]
    types.forEach(t => {
      ;[0, 1, 2].forEach(n => {
        expect(changeIcons[`${t}_${n}`]).toBeTruthy()
      })
    })
  })
})
