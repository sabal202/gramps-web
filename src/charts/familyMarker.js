import {fireEvent} from '../util.js'
import {chartPalette} from './palette.js'
import {isHoverDevice} from './util.js'
import {
  maritalStatusToMarker,
  formatUnionDates,
  unionStatusLabels,
} from './unionStatus.js'

// Radius of a family's node, which fills most of the gap between the
// partners' cards
const nodeRadius = 12

// Half the visible gap between the cards of two adjacent partners, from the
// edge of one card to the colour stripe of the other
const halfGap = 18

// Position of a family's marker relative to its family node, at the height of
// the middle of the partners' cards. The colour stripe of a card reaches 4
// pixels past its left edge, so the gap between the two partners is centred
// 2 pixels left of the family node.
export const familyMarkerPosition = [-2, 0]

// Appends a node for the family of each node in the selection, in the gap
// between the cards of the two partners, on a line that joins the two cards.
// Partners who are not next to each other are joined by a bracket, which the
// caller draws.
// The chip encodes the union status (from the node's `union` datum:
// {maritalStatus, marriage, divorce} — see buildFamilyUnionMap): solid for
// married, dashed for unmarried partners, a slash across it for divorces, a
// cross above for widowed, and an optional year label above. Families
// without a derived status follow the upstream convention: solid chip for
// married, dashed otherwise.
export function appendFamilyMarker(
  nodes,
  {palette = chartPalette, showUnionDates = false} = {}
) {
  const [x, y] = familyMarkerPosition
  const withUnion = nodes.filter(
    d => d.union && d.union.maritalStatus !== 'unknown'
  )

  nodes
    .filter(d => !d.bracket)
    .append('line')
    .attr('class', 'partner-line')
    .attr('x1', x - halfGap)
    .attr('x2', x + halfGap)
    .attr('y1', y)
    .attr('y2', y)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1.5)
  nodes
    .append('circle')
    .attr('class', d =>
      d.family?.type === 'Married' ? 'family-chip married' : 'family-chip'
    )
    .attr('r', nodeRadius)
    .attr('cx', x)
    .attr('cy', y)
    .attr('fill', palette.personBox)
    .attr('stroke', palette.familyMarker)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', d => {
      if (d.union && d.union.maritalStatus !== 'unknown') {
        return maritalStatusToMarker(d.union.maritalStatus).dashed
          ? '4 3'
          : null
      }
      return d.family?.type === 'Married' ? null : '4 3'
    })

  // Accessible label: name the union status on each family node (SVG <title>)
  withUnion
    .append('title')
    .text(
      d => unionStatusLabels[d.union.maritalStatus] ?? d.union.maritalStatus
    )

  // Union status overlays never intercept the chip's hover/click events
  const overlay = sel => sel.attr('pointer-events', 'none')

  // The chip itself carries married (solid) vs unmarried (dashed) — see the
  // dasharray logic above. Only the states the chip cannot encode are drawn
  // on top of it.

  // Divorce slash — diagonal line across the chip
  overlay(
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
  )

  // Widowed cross above the chip
  overlay(
    withUnion
      .filter(d => maritalStatusToMarker(d.union.maritalStatus).cross)
      .append('line')
      .attr('class', 'union-cross-v')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', y - 14)
      .attr('y2', y - 20)
      .attr('stroke', palette.familyMarker)
      .attr('stroke-width', 1.5)
  )
  overlay(
    withUnion
      .filter(d => maritalStatusToMarker(d.union.maritalStatus).cross)
      .append('line')
      .attr('class', 'union-cross-h')
      .attr('x1', x - 3)
      .attr('x2', x + 3)
      .attr('y1', y - 17)
      .attr('y2', y - 17)
      .attr('stroke', palette.familyMarker)
      .attr('stroke-width', 1.5)
  )

  // Union date label above the chip
  if (showUnionDates) {
    overlay(
      withUnion
        .filter(d => formatUnionDates(d.union.maritalStatus, d.union))
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('fill', palette.text)
        .attr('x', x)
        .attr('y', y - 26)
        .text(d => formatUnionDates(d.union.maritalStatus, d.union))
    )
  }
}

// Makes the node of each family in the selection open the preview of the
// family: on hover, like the cards of people, and pinned on a click or tap,
// which also reaches it on touch devices. A hovered node gets a darker
// outline.
export function setFamilyInteraction(nodes, {palette = chartPalette} = {}) {
  const show = (element, family, pinned) =>
    fireEvent(window, 'object:preview-show', {
      objectType: 'family',
      grampsId: family.gramps_id,
      anchorRect: element.getBoundingClientRect(),
      chart: true,
      pinned,
    })
  nodes
    .filter(d => d.family?.gramps_id)
    .select('.family-chip')
    .style('cursor', 'pointer')
    .on('mouseenter', function (event, d) {
      if (isHoverDevice()) {
        this.setAttribute('stroke', palette.text)
        show(this, d.family, false)
      }
    })
    .on('mouseleave', function () {
      if (isHoverDevice()) {
        this.setAttribute('stroke', palette.familyMarker)
        fireEvent(window, 'object:preview-hide')
      }
    })
    .on('click', function (event, d) {
      show(this, d.family, true)
    })
}
