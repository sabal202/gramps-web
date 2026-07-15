import {min, max} from 'd3-array'
import {create} from 'd3-selection'
import {hierarchy, tree} from 'd3-hierarchy'
import {curveBumpX, link, symbolTriangle, symbol} from 'd3-shape'
import {zoom} from 'd3-zoom'
import {chartNameDisplayFormat, fireEvent} from '../util.js'
import {appendAddPersonButton} from './addPersonButton.js'

// Dash pattern for non-birth child links; kept in sync with DASH_CHILD_EDGE in RelationshipChart.js
const DASH_NON_BIRTH = '5,3'

const genderColor = {
  0: 'var(--color-girl)',
  1: 'var(--color-boy)',
  2: 'var(--color-unknown)',
  3: 'var(--color-other)',
}

// Returns the total depth of the tree
function countDepthOfTree(treeData) {
  if (treeData == null) {
    return 0
  }
  return (
    1 +
    Math.max(
      countDepthOfTree(treeData?.children?.[0]),
      countDepthOfTree(treeData?.children?.[1])
    )
  )
}

function getMinMaxX(descendants) {
  const xValues = descendants.map(d => d.x)
  const maxX = max(xValues)
  const minX = min(xValues)
  return [minX, maxX]
}

function TreeChartCore(
  svgParent,
  data,
  {
    depth = 3,
    padding = 20, // horizontal padding for first and last column
    gapX = 30, // horizontal gap between boxes
    gapY = 5, // vertical gap between boxes
    stroke = 'var(--grampsjs-body-font-color-70)', // stroke for links
    strokeWidth = 1, // stroke width for links
    strokeOpacity = 0.4, // stroke opacity for links
    strokeLinejoin, // stroke line join for links
    strokeLinecap, // stroke line cap for links
    curve = curveBumpX, // curve for the link
    boxWidth = 190,
    boxHeight = 90,
    imgPadding = 10,
    childrenTriangle = true,
    getImageUrl = null,
    orientation = 'LTR',
    nameDisplayFormat = chartNameDisplayFormat.surnameThenGiven,
    canEdit = false,
    showMaidenName = false,
  } = {}
) {
  // Content-adaptive box height. Each card is exactly as tall as the rows it
  // actually shows — 2 name lines, then a maiden-name line, a birth date and a
  // death date, each only when present — packed with no gaps and no reserved
  // slots for absent rows. Floored by the avatar height so a photo always fits.
  // This height drives BOTH the drawing (rect + rows, below) AND the layout's
  // separation accessor (tree() below), so short cards are drawn shorter AND
  // packed tighter: toggling the maiden line on grows only the rows that gain a
  // line, not the whole tree, and a woman missing dates does not reserve their
  // rows.
  const imgRadius = 70 / 2 // half the fixed 70x70 avatar bitmap; see image pattern
  const LINE_STEP = 17
  const FIRST_BASELINE = 25 // first text baseline, from the box top
  const LAST_LINE_MARGIN = 14 // space below the last baseline to the box bottom
  const PHOTO_HEIGHT = 2 * imgRadius + 2 * imgPadding
  const hasName = d => !!(d.data.name_given || d.data.name_surname)
  const hasMaiden = d => showMaidenName && !!d.data.name_maiden_surname
  const hasBirth = d => !!d.data.person?.profile?.birth?.date
  const hasDeath = d => !!d.data.person?.profile?.death?.date
  // 0-based packed row index of each optional line (name lines are rows 0 & 1).
  const maidenRow = 2
  const birthRow = d => 2 + (hasMaiden(d) ? 1 : 0)
  const deathRow = d => birthRow(d) + (hasBirth(d) ? 1 : 0)
  const rowCount = d =>
    (hasName(d) ? 2 : 0) +
    (hasMaiden(d) ? 1 : 0) +
    (hasBirth(d) ? 1 : 0) +
    (hasDeath(d) ? 1 : 0)
  const nodeBoxHeight = d => {
    const n = rowCount(d)
    const textHeight =
      n > 0 ? FIRST_BASELINE + (n - 1) * LINE_STEP + LAST_LINE_MARGIN : 0
    return Math.max(textHeight, getImageUrl(d) ? PHOTO_HEIGHT : 0)
  }

  // Create a hierarchical data structure based on the input data
  const root = hierarchy(data)

  const descendants = root.descendants()

  // The true depth of the tree may be less than the passed in "depth" if the tree just doesn't
  // go that far back
  const trueDepth = Math.min(countDepthOfTree(data), depth)

  // Adaptive vertical packing. With the breadth cell size set to 1px, the
  // separation accessor returns the exact centre-to-centre distance between two
  // adjacent nodes = half of each one's own box height + the gap. Short (4-line)
  // boxes therefore pack tightly while a tall (maiden-line) box gets exactly the
  // room it needs — no overlap and no wasted air. With the toggle off every
  // nodeBoxHeight is 90, so this reduces to the former uniform 90+gapY spacing.
  tree()
    .nodeSize([1, boxWidth + gapX])
    .separation((a, b) => (nodeBoxHeight(a) + nodeBoxHeight(b)) / 2 + gapY)(
    root
  )

  // Center the tree.
  let x0 = Infinity
  let x1 = -x0
  root.each(d => {
    if (d.x > x1) x1 = d.x
    if (d.x < x0) x0 = d.x
  })

  if (orientation === 'RTL') {
    descendants.forEach(d => {
      // eslint-disable-next-line no-param-reassign
      d.y = -d.y
    })
  }
  // Use the required curve
  if (typeof curve !== 'function') throw new Error('Unsupported curve')
  const width = trueDepth * boxWidth + (trueDepth - 1) * gapX + 2 * padding
  const [minX, maxX] = getMinMaxX(descendants)
  const height = maxX - minX + boxHeight
  const yOffset = minX - boxHeight / 2
  const xOffset =
    orientation === 'RTL'
      ? boxWidth / 2 + padding - width
      : -boxWidth / 2 - padding

  const chart = svgParent
    .append('g')
    .attr('transform', `translate(${-xOffset},${0})`)

  chart
    .append('g')
    .attr('fill', 'none')
    .attr('stroke', stroke)
    .attr('stroke-opacity', strokeOpacity)
    .attr('stroke-linecap', strokeLinecap)
    .attr('stroke-linejoin', strokeLinejoin)
    .attr('stroke-width', strokeWidth)
    .selectAll('path')
    .data(root.links())
    .join('path')
    .attr('d', d => {
      const sourceX = d.source.x
      const sourceY =
        orientation === 'LTR'
          ? d.source.y + boxWidth / 2 - 10
          : d.source.y - boxWidth / 2 + 10
      const targetX = d.target.x
      const targetY =
        orientation === 'LTR'
          ? d.target.y - boxWidth / 2 + 10
          : d.target.y + boxWidth / 2 - 10

      return link(curve)
        .x(dd => dd.y)
        .y(dd => dd.x)({
        source: {x: sourceX, y: sourceY},
        target: {x: targetX, y: targetY},
      })
    })
    .attr('stroke-dasharray', d =>
      d.target.data.dashed ? DASH_NON_BIRTH : null
    )

  const node = chart
    .append('g')
    .selectAll('a')
    .data(descendants)
    .join('a')
    .attr('transform', d => `translate(${d.y},${d.x})`)
    .style('filter', d =>
      d.depth === 0
        ? 'drop-shadow(0 3px 8px var(--grampsjs-body-font-color-30))'
        : null
    )

  node
    .append('rect')
    .filter(d => d.data.person)
    .attr(
      'fill',
      d => genderColor[d.data?.person?.gender] ?? 'var(--color-unknown)'
    )
    .attr('width', 24)
    .attr('height', d => nodeBoxHeight(d) - 1)
    .attr('rx', 12)
    .attr('ry', 12)
    .attr(
      'transform',
      d => `translate(${-boxWidth / 2 - 4},${-nodeBoxHeight(d) / 2 + 0.5})`
    )
    .attr('id', d => d.data.id) // Unique id for each rect

  function clicked(event, d) {
    const grampsId = d.data?.person?.gramps_id
    if (window.matchMedia('(hover: none)').matches) {
      // Touch: show the preview card (with a "Make root" button) instead of
      // immediately re-rooting — a plain tap otherwise gives no way to glance
      // at the person first.
      if (!grampsId) return
      window.dispatchEvent(
        new CustomEvent('object:preview-show', {
          detail: {
            objectType: 'person',
            grampsId,
            anchorRect: this.getBoundingClientRect(),
            touch: true,
          },
        })
      )
      return
    }
    dispatchEvent(
      new CustomEvent('pedigree:person-selected', {
        bubbles: true,
        composed: true,
        detail: {grampsId},
      })
    )
  }

  node
    .append('rect')
    .filter(d => d.data.person)
    .attr('fill', 'var(--grampsjs-color-shade-230)')
    .attr('width', boxWidth)
    .attr('height', d => nodeBoxHeight(d))
    .attr('rx', 8)
    .attr('ry', 8)
    .attr(
      'transform',
      d => `translate(${-boxWidth / 2},${-nodeBoxHeight(d) / 2})`
    )
    .attr('id', d => d.data.id) // Unique id for each slice

  function triangleClicked(e) {
    fireEvent(this, 'pedigree:show-children', {pageX: e.pageX, pageY: e.pageY})
    e.stopPropagation()
    e.preventDefault()
  }

  function yPos(d) {
    return orientation === 'LTR'
      ? d.y - boxWidth / 2 - 12
      : d.y + boxWidth / 2 + 12
  }

  if (childrenTriangle) {
    const triangle = symbol().type(symbolTriangle).size(200)

    const angle = orientation === 'LTR' ? -90 : 90

    node
      .append('path')
      .filter(d => d.depth === 0)
      .attr('d', triangle)
      .attr(
        'transform',
        d => `translate(${yPos(d)},${d.x}) rotate(${angle}) scale(-1, 0.5)`
      )
      .attr('fill', 'var(--grampsjs-body-font-color-30)')
      .attr('id', 'triangle-children')
      .on('click', triangleClicked)
  }

  const textPadding = d =>
    getImageUrl(d) ? 2 * imgRadius + 2 * imgPadding : 2 * imgPadding

  const clipString = (s, length) => {
    if (!s) {
      return ''
    }
    const fontSize = 13
    const nChar = length / (fontSize * 0.6)
    if (s.length <= nChar) {
      return s
    }
    if (nChar < 2) {
      return ''
    }
    return `${s.slice(0, nChar - 2)}…`
  }

  const textWidth = d =>
    getImageUrl(d)
      ? boxWidth - 2 * imgPadding - 2 * imgRadius
      : boxWidth - 2 * imgPadding

  node
    .append('text')
    .filter(d => d.data.name_given || d.data.name_surname)
    .attr('y', d => -nodeBoxHeight(d) / 2 + 25)
    .attr('x', d => -boxWidth / 2 + textPadding(d))
    .attr('text-anchor', 'start')
    .attr('font-weight', '500')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .text(d =>
      clipString(
        nameDisplayFormat === chartNameDisplayFormat.surnameThenGiven
          ? `${d.data.name_surname || '…'},`
          : nameDisplayFormat ===
            chartNameDisplayFormat.givenPatronymicThenSurname
          ? [d.data.name_given, d.data.name_patronymic]
              .filter(Boolean)
              .join(' ') || '…'
          : nameDisplayFormat ===
            chartNameDisplayFormat.surnameThenGivenPatronymic
          ? d.data.name_family_surname || d.data.name_surname || '…'
          : d.data.name_given || '…',
        textWidth(d)
      )
    )

  node
    .append('text')
    .filter(d => d.data.name_given || d.data.name_surname)
    .attr('y', d => -nodeBoxHeight(d) / 2 + 25 + 17)
    .attr('x', d => -boxWidth / 2 + textPadding(d))
    .attr('width', 50)
    .attr('text-anchor', 'start')
    .attr('font-weight', '500')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .attr('text-overflow', 'ellipsis')
    .attr('overflow', 'hidden')
    .attr('width', 25)
    .text(d =>
      clipString(
        nameDisplayFormat === chartNameDisplayFormat.surnameThenGiven
          ? d.data.name_given || '…'
          : nameDisplayFormat ===
            chartNameDisplayFormat.givenPatronymicThenSurname
          ? d.data.name_family_surname || d.data.name_surname || '…'
          : nameDisplayFormat ===
            chartNameDisplayFormat.surnameThenGivenPatronymic
          ? [d.data.name_given, d.data.name_patronymic]
              .filter(Boolean)
              .join(' ') || '…'
          : d.data.name_surname || '…',
        textWidth(d)
      )
    )

  // Dedicated maiden-name line, rendered below the two name lines when the
  // toggle is on and this person has one (see getMaidenSurname). Smaller and
  // subtler than the name lines so it reads as a secondary detail.
  node
    .append('text')
    .filter(d => showMaidenName && d.data.name_maiden_surname)
    .attr(
      'y',
      d => -nodeBoxHeight(d) / 2 + FIRST_BASELINE + LINE_STEP * maidenRow
    )
    .attr('x', d => -boxWidth / 2 + textPadding(d))
    .attr('text-anchor', 'start')
    .attr('font-size', '13px')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-70)')
    .attr('paint-order', 'stroke')
    .text(d => clipString(`(${d.data.name_maiden_surname})`, textWidth(d)))

  node
    .append('text')
    .filter(d => d.data.person?.profile?.birth?.date)
    .attr(
      'y',
      d => -nodeBoxHeight(d) / 2 + FIRST_BASELINE + LINE_STEP * birthRow(d)
    )
    .attr('x', d => -boxWidth / 2 + textPadding(d))
    .attr('text-anchor', 'start')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')
    .attr('paint-order', 'stroke')
    .text(d => clipString(`*${d.data.person.profile.birth.date}`, textWidth(d)))

  node
    .append('text')
    .filter(d => d.data.person?.profile?.death?.date)
    .attr(
      'y',
      d => -nodeBoxHeight(d) / 2 + FIRST_BASELINE + LINE_STEP * deathRow(d)
    )
    .attr('x', d => -boxWidth / 2 + textPadding(d))
    .attr('text-anchor', 'start')
    .attr('font-weight', '350')
    .attr('fill', 'var(--grampsjs-body-font-color-90)')

    .attr('paint-order', 'stroke')
    .text(d => clipString(`†${d.data.person.profile.death.date}`, textWidth(d)))

  if (canEdit) {
    appendAddPersonButton(
      node.filter(d => d.data.person),
      boxWidth / 2 - 14,
      -boxHeight / 2 + 14,
      d => d.data.person?.handle
    )
  }

  node
    .filter(getImageUrl)
    .append('circle')
    .attr('r', imgRadius)
    .attr('cy', d => -nodeBoxHeight(d) / 2 + imgRadius + imgPadding)
    .attr('cx', -boxWidth / 2 + imgRadius + imgPadding)
    .attr('fill', d => `url(#imgpattern-${d.data.id})`)

  const defs = svgParent.append('defs')

  const imgPattern = defs
    .selectAll('.imgpattern')
    .data(descendants)
    .enter()
    .append('pattern')
    .attr('id', d => `imgpattern-${d.data.id}`)
    .attr('height', 1)
    .attr('width', 1)
    .attr('x', '0')
    .attr('y', '0')

  imgPattern
    .append('image')
    .attr('x', 0)
    .attr('y', 0)
    .attr('height', 70)
    .attr('width', 70)
    .attr('xlink:href', getImageUrl)

  node
    .style('cursor', canEdit ? 'default' : 'pointer')
    .on('click', canEdit ? null : clicked)
    .on('mouseenter', function (event, d) {
      if (canEdit) return
      if (window.matchMedia('(hover: none)').matches) return
      const grampsId = d.data?.person?.gramps_id
      if (!grampsId) return
      window.dispatchEvent(
        new CustomEvent('object:preview-show', {
          detail: {
            objectType: 'person',
            grampsId,
            anchorRect: this.getBoundingClientRect(),
          },
        })
      )
    })
    .on('mouseleave', () => {
      if (window.matchMedia('(hover: none)').matches) return
      window.dispatchEvent(new CustomEvent('object:preview-hide'))
    })

  return [xOffset, yOffset, width, height, boxWidth + 2 * padding]
}

export function TreeChart(dataDescendants, dataAncestors, chartsettings) {
  const svg = create('svg')
    .call(
      zoom().on('zoom', e =>
        svg.select('#chart-content').attr('transform', e.transform)
      )
    )
    .attr('font-family', 'Inter var')
    .attr('font-size', 13)

  const chartContent = svg.append('g').attr('id', 'chart-content')

  // Restore zoom state from previous render if available
  if (chartsettings.initialZoom) {
    svg.node().__zoom = chartsettings.initialZoom
    chartContent.attr('transform', chartsettings.initialZoom.toString())
  }

  let width = 0
  let height = 0
  let xMin = 0
  let yMin = 0
  let yMax = 0
  let xOffset = 0
  let yOffset = 0

  if (dataDescendants) {
    const chartD = chartContent.append('g')
    const [xD, yD, widthD, heightD, overlap] = TreeChartCore(
      chartD,
      dataDescendants,
      {...chartsettings, orientation: 'RTL', depth: chartsettings.nDesc}
    )
    chartD.attr('transform', `translate(${-widthD + overlap},0)`)
    yMin = Math.min(yMin, yD)
    yMax = Math.max(yMax, yD + heightD)
    xMin = Math.min(xMin, xD)
    width += widthD - overlap
  }
  if (dataAncestors) {
    const chartA = chartContent.append('g')
    const [xA, yA, widthA, heightA] = TreeChartCore(chartA, dataAncestors, {
      ...chartsettings,
      orientation: 'LTR',
      depth: chartsettings.nAnc,
    })
    chartA.attr('transform', 'translate(0,0)')
    yMin = Math.min(yMin, yA)
    yMax = Math.max(yMax, yA + heightA)
    xMin = Math.min(xMin, xA)
    width += widthA
  }

  xOffset = xMin
  height = yMax - yMin
  if (chartsettings.bboxWidth > width) {
    xOffset -= (chartsettings.bboxWidth - width) / 2
  }
  yOffset = yMin
  if (chartsettings.bboxHeight > height) {
    yOffset -= (chartsettings.bboxHeight - height) / 2
  }
  svg.attr('viewBox', [
    xOffset,
    yOffset,
    chartsettings.bboxWidth,
    chartsettings.bboxHeight,
  ])
  return svg.node()
}
