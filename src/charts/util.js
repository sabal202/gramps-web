// Utility functions for d3.js charts.

import {range} from 'd3-array'
import {select} from 'd3-selection'
import {scaleSequential} from 'd3-scale'
import {interpolateWarm} from 'd3-scale-chromatic'
import {getThumbnailUrl, getThumbnailUrlCropped} from '../api.js'
import {normalizeRect} from '../util.js'
import {descendantChildRefs} from './familyHelpers.js'

const FEMALE = 0

const familySurname = name =>
  (name?.surname_list ?? [])
    .filter(s => s.origintype !== 'Patronymic')
    .map(s => s.surname)
    .join(' ')

// Maiden (birth) surname for a woman whose current (primary) name is her
// married name, for the "show maiden name" chart toggle. Returns null when
// there is nothing meaningful to show: not a woman, primary name isn't
// tagged as a married name, no birth-name alternate is recorded, or the
// birth surname is blank/identical to the current one (surname unchanged
// by marriage).
export const getMaidenSurname = person => {
  if (person?.gender !== FEMALE) {
    return null
  }
  if (person?.primary_name?.type !== 'Married Name') {
    return null
  }
  const birthName = (person?.alternate_names ?? []).find(
    n => n.type === 'Birth Name'
  )
  if (!birthName) {
    return null
  }
  const maiden = familySurname(birthName)
  if (!maiden || maiden === familySurname(person.primary_name)) {
    return null
  }
  return maiden
}

export const getPerson = (data, handle) =>
  data.find(person => person.handle === handle) || {}

export const getPersonByGrampsId = (data, grampsId) =>
  data.find(person => person.gramps_id === grampsId) || {}

export const getImageUrl = (person, size, square = true) => {
  if (!person.media_list || person.media_list.length === 0) {
    return ''
  }
  const [mediaRef] = person.media_list
  const rect = normalizeRect(mediaRef.rect)
  if (!rect) {
    return getThumbnailUrl(mediaRef.ref, size, square)
  }
  return getThumbnailUrlCropped(mediaRef.ref, rect, size, square)
}

export const getTree = (
  data,
  handle,
  depth,
  includeEmpty = true,
  i = 0,
  label = 'p'
) => {
  if (depth === 0) {
    return {}
  }
  const person = getPerson(data, handle)
  const surnameListA = person?.primary_name?.surname_list ?? []
  const tree = {
    name_given: person?.profile ? person?.profile?.name_given : null,
    name_surname: person?.profile ? person?.profile?.name_surname : null,
    name_patronymic:
      surnameListA
        .filter(s => s.origintype === 'Patronymic')
        .map(s => s.surname)
        .join(' ') || null,
    name_family_surname:
      surnameListA
        .filter(s => s.origintype !== 'Patronymic')
        .map(s => s.surname)
        .join(' ') || null,
    name_maiden_surname: getMaidenSurname(person),
    id: label,
    depth: i,
    person,
  }
  if (depth === 1) {
    return tree
  }
  const fatherHandle =
    person?.extended?.primary_parent_family?.father_handle || ''
  const motherHandle =
    person?.extended?.primary_parent_family?.mother_handle || ''
  tree.children = []
  if (fatherHandle || includeEmpty) {
    tree.children.push(
      getTree(data, fatherHandle, depth - 1, includeEmpty, i + 1, `${label}f`)
    )
  }
  if (motherHandle || includeEmpty) {
    tree.children.push(
      getTree(data, motherHandle, depth - 1, includeEmpty, i + 1, `${label}m`)
    )
  }
  return tree
}

export const getDescendantTree = (
  data,
  handle,
  depth,
  {includeNonBirth = false} = {},
  i = 0,
  label = 'p'
) => {
  if (depth === 0) {
    return {}
  }
  const person = getPerson(data, handle)
  const surnameListB = person?.primary_name?.surname_list ?? []
  const tree = {
    name_given: person?.profile ? person?.profile?.name_given : null,
    name_surname: person?.profile ? person?.profile?.name_surname : null,
    name_patronymic:
      surnameListB
        .filter(s => s.origintype === 'Patronymic')
        .map(s => s.surname)
        .join(' ') || null,
    name_family_surname:
      surnameListB
        .filter(s => s.origintype !== 'Patronymic')
        .map(s => s.surname)
        .join(' ') || null,
    name_maiden_surname: getMaidenSurname(person),
    id: label,
    depth: i,
    person,
  }
  if (depth === 1) {
    return tree
  }
  // Collect children across all families where this person is a parent, deduplicating
  // by child handle. A child wrongly listed in two families would otherwise appear
  // twice. Birth relationship takes priority for the dashed flag.
  const childRefMap = new Map() // childHandle -> dashed
  for (const fam of person?.extended?.families || []) {
    for (const {ref, dashed} of descendantChildRefs(fam, person.handle, {
      includeNonBirth,
    })) {
      if (!childRefMap.has(ref)) {
        childRefMap.set(ref, dashed)
      } else if (childRefMap.get(ref) && !dashed) {
        childRefMap.set(ref, false) // prefer the birth (solid) relationship
      }
    }
  }
  tree.children = [...childRefMap.entries()].map(
    ([childHandle, dashed], childInd) => {
      // depth >= 2 here (depth===1 returns early above), so depth-1 >= 1 and
      // the depth===0 → {} branch is never reached from this recursion.
      const child = getDescendantTree(
        data,
        childHandle,
        depth - 1,
        {includeNonBirth},
        i + 1,
        `${label}c${childInd}`
      )
      child.dashed = dashed
      return child
    }
  )
  return tree
}

export const LegendCategorical = (
  legend,
  legendData,
  {
    legendItemHeight = 15,
    legendItemWidth = 15,
    legendItemMargin = 5,
    opacity = 1,
  } = {}
) => {
  legend
    .selectAll('rect')
    .data(legendData)
    .enter()
    .append('rect')
    .attr('x', 0)
    .attr('y', (d, i) => i * (legendItemHeight + legendItemMargin))
    .attr('width', legendItemWidth)
    .attr('height', legendItemHeight)
    .attr('fill', d => d.color)
    .attr('fill-opacity', opacity)

  legend
    .selectAll('text')
    .data(legendData)
    .enter()
    .append('text')
    .attr('x', legendItemWidth + 8)
    .attr('fill', 'var(--grampsjs-body-font-color)')
    .attr('text-anchor', 'start')
    .attr('font-family', 'Inter var')
    .attr('font-weight', 350)
    .attr('font-size', 13)
    .attr(
      'y',
      (d, i) => i * (legendItemHeight + legendItemMargin) + legendItemHeight / 2
    )
    .attr('dy', '0.35em')
    .text(d => d.label)
}

export const LegendColorBar = (
  legend,
  {
    opacity = 1,
    minColorValue = 0,
    maxColorValue = 100,
    colorBarWidth = 20,
    colorBarHeight = 200,
  } = {}
) => {
  const numColorTicks = 5 // Number of legend ticks

  if (
    minColorValue === Infinity ||
    maxColorValue === -Infinity ||
    minColorValue === maxColorValue
  ) {
    return
  }

  // Create a color scale
  const colorScale = scaleSequential(interpolateWarm).domain([
    maxColorValue,
    minColorValue,
  ])

  // Create legend gradient
  legend
    .append('linearGradient')
    .attr('id', 'color-gradient')
    .attr('gradientUnits', 'userSpaceOnUse')
    .attr('x1', 0)
    .attr('y1', 0)
    .attr('x2', 0)
    .attr('y2', 200)
    .selectAll('stop')
    .data(range(0, 1.1, 0.1))
    .enter()
    .append('stop')
    .attr('offset', d => `${d * 100}%`)
    .attr('stop-color', d =>
      colorScale(d * (maxColorValue - minColorValue) + minColorValue)
    )

  // Create legend rectangle
  legend
    .append('rect')
    .attr('width', colorBarWidth) // Adjust the width as needed
    .attr('height', colorBarHeight) // Adjust the height as needed
    .style('fill', 'url(#color-gradient)')
    .style('fill-opacity', opacity)

  const colorbarTicks = colorScale.ticks(numColorTicks)

  legend
    .selectAll('.colorbar-tick')
    .data(colorbarTicks)
    .enter()
    .append('g')
    .attr('class', 'colorbar-tick')
    .attr(
      'transform',
      d =>
        `translate(30, ${
          (1 - (d - minColorValue) / (maxColorValue - minColorValue)) *
          colorBarHeight
        })`
    )
    .each(function () {
      const tickGroup = select(this)
      tickGroup
        .append('line')
        .attr('x1', -4)
        .attr('x2', -10) // Adjust the length of the tick mark
        .attr('stroke', 'var(--grampsjs-body-font-color)') // Set the tick color
    })
    .append('text')
    .attr('class', 'colorbar-tick')
    .attr('fill', 'var(--grampsjs-body-font-color)')
    .attr('x', 4)
    .attr('text-anchor', 'start')
    .attr('dy', '0.4em')
    .text(d => `${d}`)
}
