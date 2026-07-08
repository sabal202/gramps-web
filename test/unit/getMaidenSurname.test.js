import {describe, it, expect} from 'vitest'
import {getMaidenSurname} from '../../src/charts/util.js'

const surname = (value, origintype = '') => ({surname: value, origintype})

const makeName = (type, surnameList) => ({type, surname_list: surnameList})

const makeWoman = ({primaryType, primarySurnames, alternateNames = []}) => ({
  gender: 0,
  primary_name: makeName(primaryType, primarySurnames),
  alternate_names: alternateNames,
})

describe('getMaidenSurname', () => {
  it('returns the maiden surname when the primary name is a married name', () => {
    const person = makeWoman({
      primaryType: 'Married Name',
      primarySurnames: [surname('Сабалевская')],
      alternateNames: [makeName('Birth Name', [surname('Степко')])],
    })
    expect(getMaidenSurname(person)).toBe('Степко')
  })

  it('excludes patronymic components from both surnames', () => {
    const person = makeWoman({
      primaryType: 'Married Name',
      primarySurnames: [
        surname('Сабалевская'),
        surname('Иосифовна', 'Patronymic'),
      ],
      alternateNames: [
        makeName('Birth Name', [
          surname('Степко'),
          surname('Иосифовна', 'Patronymic'),
        ]),
      ],
    })
    expect(getMaidenSurname(person)).toBe('Степко')
  })

  it('returns null for men', () => {
    const person = {
      gender: 1,
      primary_name: makeName('Married Name', [surname('Иванов')]),
      alternate_names: [makeName('Birth Name', [surname('Петров')])],
    }
    expect(getMaidenSurname(person)).toBeNull()
  })

  it('returns null when the primary name is the birth name (never remarried)', () => {
    const person = makeWoman({
      primaryType: 'Birth Name',
      primarySurnames: [surname('Иванова')],
    })
    expect(getMaidenSurname(person)).toBeNull()
  })

  it('returns null when primary type is unset/custom (e.g. bulk-imported data)', () => {
    const person = makeWoman({
      primaryType: '',
      primarySurnames: [surname('Кузяева')],
    })
    expect(getMaidenSurname(person)).toBeNull()
  })

  it('returns null when there is no Birth Name alternate', () => {
    const person = makeWoman({
      primaryType: 'Married Name',
      primarySurnames: [surname('Сабалевская')],
      alternateNames: [makeName('Also Known As', [surname('Саша')])],
    })
    expect(getMaidenSurname(person)).toBeNull()
  })

  it('returns null when the maiden surname is identical to the current one', () => {
    const person = makeWoman({
      primaryType: 'Married Name',
      primarySurnames: [surname('Иванова')],
      alternateNames: [makeName('Birth Name', [surname('Иванова')])],
    })
    expect(getMaidenSurname(person)).toBeNull()
  })

  it('returns null when the birth name has no non-patronymic surname', () => {
    const person = makeWoman({
      primaryType: 'Married Name',
      primarySurnames: [surname('Сабалевская')],
      alternateNames: [
        makeName('Birth Name', [surname('Иосифовна', 'Patronymic')]),
      ],
    })
    expect(getMaidenSurname(person)).toBeNull()
  })

  it('uses the first Birth Name alternate when there are several', () => {
    const person = makeWoman({
      primaryType: 'Married Name',
      primarySurnames: [surname('Сабалевская')],
      alternateNames: [
        makeName('Birth Name', [surname('Степко')]),
        makeName('Birth Name', [surname('Другая')]),
      ],
    })
    expect(getMaidenSurname(person)).toBe('Степко')
  })

  it('returns null when alternate_names is missing entirely', () => {
    const person = {
      gender: 0,
      primary_name: makeName('Married Name', [surname('Сабалевская')]),
    }
    expect(getMaidenSurname(person)).toBeNull()
  })
})
