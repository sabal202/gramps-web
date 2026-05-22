/*
Pure helpers for the Tasks feature.

A "task" is a Gramps Source tagged `ToDo`. All task-specific data is stored as
`SrcAttribute`s on the source, using human-readable value formats so they remain
legible in other Gramps clients:

  - Status     single   Open | In Progress | Blocked | Done
  - Priority   single   1 (High) | 5 (Medium) | 9 (Low)
  - Assignee   single   display name string
  - Related    multi    "<object_type>:<gramps_id>"   (e.g. "person:I0001")
  - Subtask    multi    "[ ] text" or "[x] text"
  - TaskUpdate multi    "<ISO8601>|<author>|<text>"   (split on the first two |)

These functions are intentionally pure so they can be unit-tested without a DOM.
*/

export const TASK_TAG = 'ToDo'

export const ATTR = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  related: 'Related',
  subtask: 'Subtask',
  update: 'TaskUpdate',
}

export const STATUS_VALUES = ['Open', 'In Progress', 'Blocked', 'Done']

// Display order for status, lower sorts first.
export const STATUS_ORDER = {
  Open: 1,
  'In Progress': 2,
  Blocked: 3,
  other: 4,
  Done: 5,
}

// Priority value -> label key.
export const PRIORITY_LABEL = {1: 'High', 5: 'Medium', 9: 'Low'}

export function srcAttribute(type, value) {
  return {_class: 'SrcAttribute', type, value}
}

export function getAttr(source, type) {
  return (source?.attribute_list || []).find(att => att.type === type)?.value
}

// Returns matching attributes together with their index in attribute_list,
// which is what the `updateAttribute` / `delAttr` edit actions operate on.
export function getAllAttrs(source, type) {
  const out = []
  ;(source?.attribute_list || []).forEach((att, attrIndex) => {
    if (att.type === type) {
      out.push({attrIndex, value: att.value})
    }
  })
  return out
}

// --- Subtasks ---------------------------------------------------------------

export function parseSubtask(value) {
  const match = /^\s*\[([ xX])\]\s?(.*)$/.exec(value ?? '')
  if (!match) {
    return {done: false, text: (value ?? '').trim()}
  }
  return {done: match[1].toLowerCase() === 'x', text: match[2].trim()}
}

export function formatSubtask({done, text}) {
  return `[${done ? 'x' : ' '}] ${(text ?? '').trim()}`
}

export function getSubtasks(source) {
  return getAllAttrs(source, ATTR.subtask).map(({attrIndex, value}) => ({
    attrIndex,
    ...parseSubtask(value),
  }))
}

export function subtaskProgress(source) {
  const subs = getSubtasks(source)
  return {done: subs.filter(s => s.done).length, total: subs.length}
}

// --- Updates (timestamped activity log) -------------------------------------

export function parseUpdate(value) {
  const str = value ?? ''
  const i1 = str.indexOf('|')
  const i2 = i1 === -1 ? -1 : str.indexOf('|', i1 + 1)
  if (i1 === -1 || i2 === -1) {
    return {date: '', author: '', text: str.trim()}
  }
  return {
    date: str.slice(0, i1),
    author: str.slice(i1 + 1, i2),
    text: str.slice(i2 + 1),
  }
}

export function formatUpdate({date, author, text}) {
  const sanitize = v => `${v ?? ''}`.replace(/\|/g, '/')
  return `${sanitize(date)}|${sanitize(author)}|${text ?? ''}`
}

export function getUpdates(source) {
  return getAllAttrs(source, ATTR.update).map(({attrIndex, value}) => ({
    attrIndex,
    ...parseUpdate(value),
  }))
}

// Newest first. ISO 8601 strings sort correctly lexicographically.
export function sortUpdates(updates) {
  return [...updates].sort((a, b) => {
    if (a.date === b.date) return 0
    return a.date < b.date ? 1 : -1
  })
}

export function lastUpdate(source) {
  return sortUpdates(getUpdates(source))[0]?.date || ''
}

// --- Related records --------------------------------------------------------

export function parseRelated(value) {
  const str = value ?? ''
  const i = str.indexOf(':')
  if (i === -1) {
    return {objectType: '', grampsId: str}
  }
  return {objectType: str.slice(0, i), grampsId: str.slice(i + 1)}
}

export function formatRelated({objectType, grampsId}) {
  return `${objectType}:${grampsId}`
}

export function getRelated(source) {
  return getAllAttrs(source, ATTR.related).map(({attrIndex, value}) => ({
    attrIndex,
    ...parseRelated(value),
  }))
}

// --- List operations (filter / sort / group), all client-side ---------------

export function filterTasks(
  list,
  {search = '', status = '', priority = '', assignee = ''} = {}
) {
  const query = search.trim().toLowerCase()
  return (list || []).filter(task => {
    if (query && !(task.title || '').toLowerCase().includes(query)) {
      return false
    }
    if (status && getAttr(task, ATTR.status) !== status) {
      return false
    }
    if (priority && getAttr(task, ATTR.priority) !== priority) {
      return false
    }
    if (assignee && (getAttr(task, ATTR.assignee) || '') !== assignee) {
      return false
    }
    return true
  })
}

export function sortTasks(list, key = 'status') {
  const byStatus = (a, b) =>
    (STATUS_ORDER[getAttr(a, ATTR.status) || 'other'] || STATUS_ORDER.other) -
    (STATUS_ORDER[getAttr(b, ATTR.status) || 'other'] || STATUS_ORDER.other)
  const byPriority = (a, b) =>
    Number(getAttr(a, ATTR.priority) || 5) -
    Number(getAttr(b, ATTR.priority) || 5)
  const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '')
  const byUpdated = (a, b) => {
    const da = lastUpdate(a)
    const db = lastUpdate(b)
    if (da === db) return 0
    return da < db ? 1 : -1
  }
  const comparators = {
    status: byStatus,
    priority: byPriority,
    title: byTitle,
    updated: byUpdated,
  }
  return [...(list || [])].sort(comparators[key] || byStatus)
}

export function groupTasks(list, key = 'none') {
  if (!key || key === 'none') {
    return [{key: null, items: [...(list || [])]}]
  }
  const keyFor = task => {
    if (key === 'status') return getAttr(task, ATTR.status) || 'other'
    if (key === 'priority') return getAttr(task, ATTR.priority) || ''
    if (key === 'assignee') return getAttr(task, ATTR.assignee) || ''
    return ''
  }
  const groups = new Map()
  ;(list || []).forEach(task => {
    const groupKey = keyFor(task)
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey).push(task)
  })
  let order = null
  if (key === 'status') {
    order = ['Open', 'In Progress', 'Blocked', 'other', 'Done']
  } else if (key === 'priority') {
    order = ['1', '5', '9', '']
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (order) {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
    }
    // assignee: alphabetical, with "unassigned" last
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b)
  })
  return sortedKeys.map(groupKey => ({
    key: groupKey,
    items: groups.get(groupKey),
  }))
}

// Distinct, sorted assignee values present in a task list (for filter options).
export function assigneeOptions(list) {
  const set = new Set()
  ;(list || []).forEach(task => {
    const value = getAttr(task, ATTR.assignee)
    if (value) {
      set.add(value)
    }
  })
  return [...set].sort((a, b) => a.localeCompare(b))
}
