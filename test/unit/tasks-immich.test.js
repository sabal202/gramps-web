import {describe, it, expect} from 'vitest'
import {
  ATTR,
  srcAttribute,
  getAttr,
  getAllAttrs,
  parseSubtask,
  formatSubtask,
  getSubtasks,
  subtaskProgress,
  parseUpdate,
  formatUpdate,
  getUpdates,
  sortUpdates,
  lastUpdate,
  parseRelated,
  formatRelated,
  getRelated,
  filterTasks,
  sortTasks,
  groupTasks,
  assigneeOptions,
} from '../../src/tasks.js'

// Build a task (source) with the given attributes and optional title.
const task = (attrs = [], title = '') => ({
  _class: 'Source',
  title,
  attribute_list: attrs.map(([type, value]) => srcAttribute(type, value)),
})

describe('getAttr / getAllAttrs', () => {
  it('returns the value of a single attribute', () => {
    const t = task([
      [ATTR.status, 'Open'],
      [ATTR.priority, '5'],
    ])
    expect(getAttr(t, ATTR.status)).toBe('Open')
    expect(getAttr(t, ATTR.priority)).toBe('5')
  })

  it('returns undefined for a missing attribute and tolerates no list', () => {
    expect(getAttr(task(), ATTR.status)).toBeUndefined()
    expect(getAttr({}, ATTR.status)).toBeUndefined()
    expect(getAttr(undefined, ATTR.status)).toBeUndefined()
  })

  it('returns all matching attributes with their attribute_list index', () => {
    const t = task([
      [ATTR.status, 'Open'],
      [ATTR.subtask, '[ ] a'],
      [ATTR.priority, '5'],
      [ATTR.subtask, '[x] b'],
    ])
    expect(getAllAttrs(t, ATTR.subtask)).toEqual([
      {attrIndex: 1, value: '[ ] a'},
      {attrIndex: 3, value: '[x] b'},
    ])
  })
})

describe('subtasks', () => {
  it('parses checked and unchecked items', () => {
    expect(parseSubtask('[ ] buy milk')).toEqual({
      done: false,
      text: 'buy milk',
    })
    expect(parseSubtask('[x] done thing')).toEqual({
      done: true,
      text: 'done thing',
    })
    expect(parseSubtask('[X] caps')).toEqual({done: true, text: 'caps'})
  })

  it('treats a value with no checkbox prefix as an unchecked item', () => {
    expect(parseSubtask('no prefix')).toEqual({done: false, text: 'no prefix'})
  })

  it('round-trips through format/parse', () => {
    const item = {done: true, text: 'write tests'}
    expect(parseSubtask(formatSubtask(item))).toEqual(item)
    expect(formatSubtask({done: false, text: 'x'})).toBe('[ ] x')
  })

  it('computes progress', () => {
    const t = task([
      [ATTR.subtask, '[x] a'],
      [ATTR.subtask, '[ ] b'],
      [ATTR.subtask, '[x] c'],
    ])
    expect(subtaskProgress(t)).toEqual({done: 2, total: 3})
    expect(getSubtasks(t)[1]).toEqual({attrIndex: 1, done: false, text: 'b'})
    expect(subtaskProgress(task())).toEqual({done: 0, total: 0})
  })
})

describe('updates', () => {
  it('parses the date|author|text format and keeps pipes in the text', () => {
    expect(parseUpdate('2026-05-22T10:00:00Z|alice|found a record')).toEqual({
      date: '2026-05-22T10:00:00Z',
      author: 'alice',
      text: 'found a record',
    })
    expect(parseUpdate('2026-05-22T10:00:00Z|bob|a|b|c').text).toBe('a|b|c')
  })

  it('treats a malformed value as text only', () => {
    expect(parseUpdate('just some text')).toEqual({
      date: '',
      author: '',
      text: 'just some text',
    })
  })

  it('sanitizes pipes in date/author when formatting', () => {
    const value = formatUpdate({date: '2026-01-01', author: 'a|b', text: 'hi'})
    expect(parseUpdate(value)).toEqual({
      date: '2026-01-01',
      author: 'a/b',
      text: 'hi',
    })
  })

  it('sorts updates newest first and reports the latest date', () => {
    const t = task([
      [ATTR.update, '2026-01-01T00:00:00Z|a|old'],
      [ATTR.update, '2026-05-01T00:00:00Z|a|new'],
      [ATTR.update, '2026-03-01T00:00:00Z|a|mid'],
    ])
    const sorted = sortUpdates(getUpdates(t))
    expect(sorted.map(u => u.text)).toEqual(['new', 'mid', 'old'])
    expect(lastUpdate(t)).toBe('2026-05-01T00:00:00Z')
    expect(lastUpdate(task())).toBe('')
  })
})

describe('related records', () => {
  it('parses and formats object_type:gramps_id', () => {
    expect(parseRelated('person:I0001')).toEqual({
      objectType: 'person',
      grampsId: 'I0001',
    })
    expect(formatRelated({objectType: 'event', grampsId: 'E5'})).toBe(
      'event:E5'
    )
  })

  it('lists related records with their attribute index', () => {
    const t = task([
      [ATTR.status, 'Open'],
      [ATTR.related, 'person:I1'],
      [ATTR.related, 'place:P2'],
    ])
    expect(getRelated(t)).toEqual([
      {attrIndex: 1, objectType: 'person', grampsId: 'I1'},
      {attrIndex: 2, objectType: 'place', grampsId: 'P2'},
    ])
  })
})

describe('filterTasks', () => {
  const list = [
    task(
      [
        [ATTR.status, 'Open'],
        [ATTR.priority, '1'],
        [ATTR.assignee, 'Alice'],
      ],
      'Find birth record'
    ),
    task(
      [
        [ATTR.status, 'Done'],
        [ATTR.priority, '5'],
        [ATTR.assignee, 'Bob'],
      ],
      'Scan photos'
    ),
    task(
      [
        [ATTR.status, 'Open'],
        [ATTR.priority, '9'],
      ],
      'Verify census'
    ),
  ]

  it('filters by free-text title search (case-insensitive)', () => {
    expect(filterTasks(list, {search: 'CENSUS'})).toHaveLength(1)
  })

  it('filters by status, priority and assignee', () => {
    expect(filterTasks(list, {status: 'Open'})).toHaveLength(2)
    expect(filterTasks(list, {priority: '1'})).toHaveLength(1)
    expect(filterTasks(list, {assignee: 'Bob'})).toHaveLength(1)
  })

  it('returns everything with no criteria', () => {
    expect(filterTasks(list, {})).toHaveLength(3)
    expect(filterTasks(list)).toHaveLength(3)
  })
})

describe('sortTasks', () => {
  it('orders by status (Open before Done, unknown before Done)', () => {
    const list = [
      task([[ATTR.status, 'Done']], 'd'),
      task([[ATTR.status, 'Open']], 'o'),
      task([], 'u'),
      task([[ATTR.status, 'In Progress']], 'p'),
    ]
    expect(sortTasks(list, 'status').map(t => t.title)).toEqual([
      'o',
      'p',
      'u',
      'd',
    ])
  })

  it('orders by priority ascending (High=1 first)', () => {
    const list = [
      task([[ATTR.priority, '9']], 'low'),
      task([[ATTR.priority, '1']], 'high'),
      task([[ATTR.priority, '5']], 'med'),
    ]
    expect(sortTasks(list, 'priority').map(t => t.title)).toEqual([
      'high',
      'med',
      'low',
    ])
  })

  it('does not mutate the input array', () => {
    const list = [
      task([[ATTR.status, 'Done']], 'd'),
      task([[ATTR.status, 'Open']], 'o'),
    ]
    const copy = [...list]
    sortTasks(list, 'status')
    expect(list).toEqual(copy)
  })
})

describe('groupTasks', () => {
  it('returns a single null group when grouping is off', () => {
    const list = [task([[ATTR.status, 'Open']])]
    expect(groupTasks(list, 'none')).toEqual([{key: null, items: list}])
  })

  it('groups by status in canonical order', () => {
    const list = [
      task([[ATTR.status, 'Done']], 'd'),
      task([[ATTR.status, 'Open']], 'o1'),
      task([[ATTR.status, 'Open']], 'o2'),
    ]
    const groups = groupTasks(list, 'status')
    expect(groups.map(g => g.key)).toEqual(['Open', 'Done'])
    expect(groups[0].items).toHaveLength(2)
  })

  it('groups by assignee with unassigned last', () => {
    const list = [
      task([], 'none'),
      task([[ATTR.assignee, 'Zed']], 'z'),
      task([[ATTR.assignee, 'Amy']], 'a'),
    ]
    expect(groupTasks(list, 'assignee').map(g => g.key)).toEqual([
      'Amy',
      'Zed',
      '',
    ])
  })
})

describe('assigneeOptions', () => {
  it('returns distinct sorted assignees, ignoring empty', () => {
    const list = [
      task([[ATTR.assignee, 'Bob']]),
      task([[ATTR.assignee, 'Alice']]),
      task([[ATTR.assignee, 'Bob']]),
      task([]),
    ]
    expect(assigneeOptions(list)).toEqual(['Alice', 'Bob'])
  })
})
