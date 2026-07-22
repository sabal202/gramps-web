import {describe, expect, it} from 'vitest'

import {
  buildAdjacency,
  computeComponents,
  estimateBirthYears,
  surnameKey,
  GENERATION_GAP,
} from '../../src/graphExplorer.js'

describe('surnameKey', () => {
  it('merges feminine declensions into the masculine form', () => {
    expect(surnameKey('Соболевская')).toBe('Соболевский')
    expect(surnameKey('Пилипцевичева')).toBe('Пилипцевичев')
    expect(surnameKey('Кузяева')).toBe('Кузяев')
    expect(surnameKey('Минюкина')).toBe('Минюкин')
  })

  it('leaves other surnames untouched', () => {
    expect(surnameKey('Бинько')).toBe('Бинько')
    expect(surnameKey('Стасевич')).toBe('Стасевич')
    expect(surnameKey('')).toBe('')
    expect(surnameKey(null)).toBe('')
  })
})

describe('computeComponents', () => {
  it('finds components and ranks them by size', () => {
    // 0-1-2 chain, 3-4 pair, 5 singleton
    const adj = buildAdjacency(6, [
      {source: 0, target: 1},
      {source: 1, target: 2},
      {source: 3, target: 4},
    ])
    const {comp, compSize, compOrder, compRank} = computeComponents(adj)
    expect(comp[0]).toBe(comp[1])
    expect(comp[1]).toBe(comp[2])
    expect(comp[3]).toBe(comp[4])
    expect(comp[5]).not.toBe(comp[0])
    expect(compSize[comp[0]]).toBe(3)
    expect(compOrder[0]).toBe(comp[0])
    expect(compRank[comp[0]]).toBe(0)
    expect(compSize[comp[5]]).toBe(1)
  })
})

describe('estimateBirthYears', () => {
  it('keeps known years and marks them as not estimated', () => {
    const people = [{birth_year: 1850}, {birth_year: null}]
    const {years, estimated} = estimateBirthYears(people, [])
    expect(years[0]).toBe(1850)
    expect(estimated[0]).toBe(false)
    expect(years[1]).toBe(null)
  })

  it('propagates down a parent chain by one generation gap per step', () => {
    // 0 (1800) → 1 → 2, only the root is dated
    const people = [{birth_year: 1800}, {}, {}]
    const links = [
      {source: 0, target: 1, type: 'child'},
      {source: 1, target: 2, type: 'child'},
    ]
    const {years, estimated} = estimateBirthYears(people, links)
    expect(years[1]).toBe(1800 + GENERATION_GAP)
    expect(years[2]).toBe(1800 + 2 * GENERATION_GAP)
    expect(estimated[1]).toBe(true)
  })

  it('propagates up to parents and sideways to spouses', () => {
    // parent 0 unknown, child 1 (1860); spouse 2 of 0 unknown
    const people = [{}, {birth_year: 1860}, {}]
    const links = [
      {source: 0, target: 1, type: 'child'},
      {source: 0, target: 2, type: 'spouse'},
    ]
    const {years} = estimateBirthYears(people, links)
    expect(years[0]).toBe(1860 - GENERATION_GAP)
    expect(years[2]).toBe(1860 - GENERATION_GAP)
  })

  it('averages over several dated neighbors', () => {
    // child of a 1800 parent AND parent of a 1840-born child
    const people = [{birth_year: 1800}, {}, {birth_year: 1840}]
    const links = [
      {source: 0, target: 1, type: 'child'},
      {source: 1, target: 2, type: 'child'},
    ]
    const {years} = estimateBirthYears(people, links)
    // (1800+28 + 1840-28)/2 = 1820
    expect(years[1]).toBe(1820)
  })

  it('clamps the estimate by a known death year', () => {
    // spouse of someone born 1900, but died 1880 → estimate ≤ 1880
    const people = [{birth_year: 1900}, {death_year: 1880}]
    const links = [{source: 0, target: 1, type: 'spouse'}]
    const {years} = estimateBirthYears(people, links)
    expect(years[1]).toBeLessThanOrEqual(1880)
  })

  it('leaves unreachable nodes null', () => {
    const people = [{birth_year: 1850}, {}, {}]
    const links = [{source: 1, target: 2, type: 'spouse'}]
    const {years} = estimateBirthYears(people, links)
    expect(years[1]).toBe(null)
    expect(years[2]).toBe(null)
  })

  it('ignores bogus years outside a plausible range', () => {
    const people = [{birth_year: 150}, {}]
    const links = [{source: 0, target: 1, type: 'spouse'}]
    const {years} = estimateBirthYears(people, links)
    expect(years[0]).toBe(null)
    expect(years[1]).toBe(null)
  })
})
