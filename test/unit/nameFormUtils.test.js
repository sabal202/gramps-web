import {describe, it, expect} from 'vitest'
import {
  getOriginTypeString,
  isComplexName,
  getPatronymicValue,
  withPatronymic,
} from '../../src/nameFormUtils.js'

describe('getOriginTypeString', () => {
  it('returns empty string for null/undefined', () => {
    expect(getOriginTypeString(null)).to.equal('')
    expect(getOriginTypeString(undefined)).to.equal('')
  })

  it('returns the value unchanged for a plain string', () => {
    expect(getOriginTypeString('Patronymic')).to.equal('Patronymic')
  })

  it('unwraps the .string field of a GrampsType-shaped object', () => {
    expect(
      getOriginTypeString({_class: 'NameOriginType', string: 'Patronymic'})
    ).to.equal('Patronymic')
  })

  it('returns empty string for an object with no .string field', () => {
    expect(getOriginTypeString({_class: 'NameOriginType'})).to.equal('')
  })
})

describe('isComplexName', () => {
  it('is false for empty/missing data', () => {
    expect(isComplexName(undefined)).to.equal(false)
    expect(isComplexName({})).to.equal(false)
  })

  it('is false for given name + plain surname only', () => {
    expect(
      isComplexName({first_name: 'Ivan', surname_list: [{surname: 'Ivanov'}]})
    ).to.equal(false)
  })

  it('is false for a clean patronymic second surname', () => {
    expect(
      isComplexName({
        first_name: 'Ivan',
        surname_list: [
          {surname: 'Ivanov'},
          {surname: 'Petrovich', origintype: 'Patronymic'},
        ],
      })
    ).to.equal(false)
  })

  it('is true when title/suffix/call/nick/famnick is set', () => {
    expect(isComplexName({title: 'Dr.'})).to.equal(true)
    expect(isComplexName({suffix: 'Jr.'})).to.equal(true)
    expect(isComplexName({call: 'Vanya'})).to.equal(true)
    expect(isComplexName({nick: 'Vanya'})).to.equal(true)
    expect(isComplexName({famnick: 'Ivanovs'})).to.equal(true)
  })

  it('is true for more than two surnames', () => {
    expect(
      isComplexName({
        surname_list: [{surname: 'A'}, {surname: 'B'}, {surname: 'C'}],
      })
    ).to.equal(true)
  })

  it('is true when the primary surname has a prefix or connector', () => {
    expect(
      isComplexName({surname_list: [{surname: 'A', prefix: 'von'}]})
    ).to.equal(true)
    expect(
      isComplexName({surname_list: [{surname: 'A', connector: 'y'}]})
    ).to.equal(true)
  })

  it('is true when the second surname has a prefix/connector or a non-Patronymic origin type', () => {
    expect(
      isComplexName({
        surname_list: [{surname: 'A'}, {surname: 'B', prefix: 'von'}],
      })
    ).to.equal(true)
    expect(
      isComplexName({
        surname_list: [
          {surname: 'A'},
          {surname: 'B', origintype: 'Matronymic'},
        ],
      })
    ).to.equal(true)
  })
})

describe('getPatronymicValue', () => {
  it('returns empty string when there is no second surname', () => {
    expect(getPatronymicValue({surname_list: [{surname: 'A'}]})).to.equal('')
    expect(getPatronymicValue({})).to.equal('')
  })

  it('returns the second surname when it is a Patronymic row', () => {
    expect(
      getPatronymicValue({
        surname_list: [
          {surname: 'Ivanov'},
          {surname: 'Petrovich', origintype: 'Patronymic'},
        ],
      })
    ).to.equal('Petrovich')
  })

  it('returns empty string when the second surname is not Patronymic', () => {
    expect(
      getPatronymicValue({
        surname_list: [
          {surname: 'Ivanov'},
          {surname: 'Something', origintype: 'Matronymic'},
        ],
      })
    ).to.equal('')
  })
})

describe('withPatronymic', () => {
  it('adds a Patronymic second surname when there was none', () => {
    const result = withPatronymic(
      {surname_list: [{surname: 'Ivanov'}]},
      'Petrovich'
    )
    expect(result.surname_list).to.deep.equal([
      {surname: 'Ivanov'},
      {surname: 'Petrovich', origintype: 'Patronymic'},
    ])
  })

  it('updates an existing Patronymic surname in place', () => {
    const result = withPatronymic(
      {
        surname_list: [
          {surname: 'Ivanov'},
          {handle: 'h1', surname: 'Old', origintype: 'Patronymic'},
        ],
      },
      'New'
    )
    expect(result.surname_list[1]).to.deep.equal({
      handle: 'h1',
      surname: 'New',
      origintype: 'Patronymic',
    })
  })

  it('removes the second surname when cleared to empty', () => {
    const result = withPatronymic(
      {
        surname_list: [
          {surname: 'Ivanov'},
          {surname: 'Petrovich', origintype: 'Patronymic'},
        ],
      },
      ''
    )
    expect(result.surname_list).to.deep.equal([{surname: 'Ivanov'}])
  })

  it('defaults to an empty primary surname when surname_list is missing', () => {
    const result = withPatronymic({}, 'Petrovich')
    expect(result.surname_list).to.deep.equal([
      {},
      {surname: 'Petrovich', origintype: 'Patronymic'},
    ])
  })

  it('preserves surnames beyond index 1', () => {
    const result = withPatronymic(
      {
        surname_list: [{surname: 'A'}, {surname: 'B'}, {surname: 'C'}],
      },
      'D'
    )
    expect(result.surname_list).to.deep.equal([
      {surname: 'A'},
      {surname: 'D', origintype: 'Patronymic'},
      {surname: 'C'},
    ])
  })
})
