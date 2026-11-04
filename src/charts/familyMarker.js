import {chartPalette} from './palette.js'
import {
  maritalStatusToMarker,
  formatUnionDates,
  unionStatusLabels,
} from './unionStatus.js'

// Returns the position of a family's marker relative to its family node, for
// partner cards that are `boxHeight` pixels high. The colour stripe of a card
// reaches 4 pixels past its left edge, so the gap between the two partners is
// centred 2 pixels left of the family node.
export const familyMarkerPosition = boxHeight => [-2, boxHeight / 2 - 10]

// Appends a marker for the family of each node in the selection, in the gap
// between the cards of the two partners, which are `boxHeight` pixels high.
// The marker encodes the union status (from the node's `union` datum:
// {maritalStatus, marriage, divorce} — see buildUnionMap): rings on a short
// line, a slash across the rings for divorces, a cross above for widowed,
// and an optional year label underneath. Families without a derived status
// keep the plain bar; a married couple always shows the double ring.
export function appendFamilyMarker(
  nodes,
  {boxHeight = 90, palette = chartPalette, showUnionDates = false} = {}
) {
  const [x, y] = familyMarkerPosition(boxHeight)
  const withUnion = nodes.filter(
    d => d.union && d.union.maritalStatus !== 'unknown'
  )
  const plain = nodes.filter(
    d => !d.union || d.union.maritalStatus === 'unknown'
  )
  const marriedPlain = plain.filter(d => d.family?.type === 'Married')

  // Union bar: dashed for partners, solid otherwise
  const bars = nodes.filter(
    d => !d.union || maritalStatusToMarker(d.union.maritalStatus).dashed === false
  )
  bars
    .append('line')
    .attr('x1', x - 11)
    .attr('x2', x + 11)
    .attr('y1', y)
    .attr('y2', y)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1.5)
  nodes
    .filter(
      d =>
        d.union &&
        maritalStatusToMarker(d.union.maritalStatus).dashed
    )
    .append('line')
    .attr('x1', x - 11)
    .attr('x2', x + 11)
    .attr('y1', y)
    .attr('y2', y)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '3,2')

  // Accessible label: name the union status on each family node (SVG <title>)
  withUnion
    .append('title')
    .text(d => unionStatusLabels[d.union.maritalStatus] ?? d.union.maritalStatus)

  // Ring(s): two for married/divorced, one for partners/widowed, none for unknown
  withUnion
    .filter(d => maritalStatusToMarker(d.union.maritalStatus).rings >= 1)
    .append('circle')
    .attr('class', 'union-ring union-ring-left')
    .attr('r', 5)
    .attr('cx', d =>
      maritalStatusToMarker(d.union.maritalStatus).rings === 2 ? x - 5 : x
    )
    .attr('cy', y)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1)
    .attr('fill', d =>
      maritalStatusToMarker(d.union.maritalStatus).filled
        ? palette.familyMarkerFill
        : 'none'
    )
  withUnion
    .filter(d => maritalStatusToMarker(d.union.maritalStatus).rings === 2)
    .append('circle')
    .attr('class', 'union-ring union-ring-right')
    .attr('r', 5)
    .attr('cx', x + 5)
    .attr('cy', y)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1)
    .attr('fill', d =>
      maritalStatusToMarker(d.union.maritalStatus).filled
        ? palette.familyMarkerFill
        : 'none'
    )

  // Divorce slash — diagonal line across the rings
  withUnion
    .filter(d => maritalStatusToMarker(d.union.maritalStatus).slash)
    .append('line')
    .attr('class', 'union-slash')
    .attr('x1', x - 8)
    .attr('x2', x + 8)
    .attr('y1', y + 6)
    .attr('y2', y - 6)
    .attr('stroke', 'var(--md-sys-color-error)')
    .attr('stroke-width', 1.5)

  // Widowed cross above the ring
  withUnion
    .filter(d => maritalStatusToMarker(d.union.maritalStatus).cross)
    .append('line')
    .attr('class', 'union-cross-v')
    .attr('x1', x)
    .attr('x2', x)
    .attr('y1', y - 5)
    .attr('y2', y - 11)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1.5)
  withUnion
    .filter(d => maritalStatusToMarker(d.union.maritalStatus).cross)
    .append('line')
    .attr('class', 'union-cross-h')
    .attr('x1', x - 3)
    .attr('x2', x + 3)
    .attr('y1', y - 8)
    .attr('y2', y - 8)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1.5)

  // Union date label under the marker
  if (showUnionDates) {
    withUnion
      .filter(d => formatUnionDates(d.union.maritalStatus, d.union))
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px')
      .attr('fill', palette.text)
      .attr('x', x)
      .attr('y', y - 16)
      .text(d => formatUnionDates(d.union.maritalStatus, d.union))
  }

  // Families without a derived status: keep the plain married ring look
  marriedPlain
    .append('circle')
    .attr('class', 'married')
    .attr('r', 6)
    .attr('cx', x)
    .attr('cy', y)
    .attr('stroke', palette.familyMarker)
    .attr('fill', palette.familyMarkerFill)
}
