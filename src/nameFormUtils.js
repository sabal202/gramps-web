/*
Helpers for the compact "Patronymic" field in the name-edit form
(grampsjs-form-name). Patronymic is not a distinct Gramps attribute - it is
stored as a second Surname with origintype=Patronymic. These helpers let the
compact field read/write that second surname without exposing the underlying
multi-surname model to the user.
*/

export function getOriginTypeString(origintype) {
  if (origintype === null || origintype === undefined) {
    return ''
  }
  if (typeof origintype === 'object') {
    return origintype.string || ''
  }
  return origintype
}

// Whether a name's data doesn't fit the simple
// given name / surname / patronymic compact model, and the form should
// therefore open already expanded instead of hiding data from the user.
export function isComplexName(data) {
  if (!data) {
    return false
  }
  if (data.title || data.suffix || data.call || data.nick || data.famnick) {
    return true
  }
  const surnameList = data.surname_list || []
  if (surnameList.length > 2) {
    return true
  }
  const primary = surnameList[0]
  if (primary && (primary.prefix || primary.connector)) {
    return true
  }
  const second = surnameList[1]
  if (second) {
    if (second.prefix || second.connector) {
      return true
    }
    if (getOriginTypeString(second.origintype) !== 'Patronymic') {
      return true
    }
  }
  return false
}

export function getPatronymicValue(data) {
  const second = (data?.surname_list || [])[1]
  if (second && getOriginTypeString(second.origintype) === 'Patronymic') {
    return second.surname || ''
  }
  return ''
}

// Returns updated name data with the second surname set to (or removed for)
// the given patronymic value. Assumes data is not "complex" (see
// isComplexName) - i.e. any existing second surname is already a clean
// origintype=Patronymic row.
export function withPatronymic(data, value) {
  const surnameList =
    data.surname_list && data.surname_list.length ? data.surname_list : [{}]
  const primary = surnameList[0] || {}
  const rest = surnameList.slice(2)
  if (value) {
    const existingSecond = surnameList[1] || {}
    return {
      ...data,
      surname_list: [
        primary,
        {...existingSecond, surname: value, origintype: 'Patronymic'},
        ...rest,
      ],
    }
  }
  return {
    ...data,
    surname_list: [primary, ...rest],
  }
}
