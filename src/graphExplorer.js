/*
Pure helpers for the whole-tree graph explorer view (no DOM, no D3).

Works on the payload of `GET /api/analysis/graph/`:
  people: [{gramps_id, given_name, surname, gender, birth_year, death_year}, …]
  links:  [{source, target, type: 'spouse'|'child'}, …]  (indices into people;
          for 'child' links, source is the parent and target is the child)
*/

// Average parent→child generation gap (years) used when estimating missing
// birth years from relatives.
export const GENERATION_GAP = 28

// Assumed maximum lifespan when only a death year is known.
const MAX_LIFESPAN = 100

/**
 * Collapse common Russian feminine surname declensions so male/female forms
 * of the same family name group together ("Соболевская" → "Соболевский").
 */
export function surnameKey(surname) {
  if (!surname) {
    return ''
  }
  return surname
    .replace(/ская$/, 'ский')
    .replace(/цкая$/, 'цкий')
    .replace(/ёва$/, 'ёв')
    .replace(/ева$/, 'ев')
    .replace(/ова$/, 'ов')
    .replace(/ина$/, 'ин')
    .replace(/ына$/, 'ын')
}

/**
 * Adjacency lists (undirected) from typed links.
 *
 * @param {number} n number of nodes
 * @param {Array} links [{source, target}]
 * @returns {number[][]} neighbor indices per node
 */
export function buildAdjacency(n, links) {
  const adj = Array.from({length: n}, () => [])
  for (const l of links) {
    adj[l.source].push(l.target)
    adj[l.target].push(l.source)
  }
  return adj
}

/**
 * Connected components over the adjacency lists.
 *
 * @returns {{comp: number[], compSize: number[], compOrder: number[],
 *            compRank: number[]}}
 *   comp: component id per node; compSize: size per component id;
 *   compOrder: component ids sorted largest-first;
 *   compRank: rank (0 = largest) per component id.
 */
export function computeComponents(adj) {
  const n = adj.length
  const comp = new Array(n).fill(-1)
  let c = 0
  const stack = []
  for (let i = 0; i < n; i += 1) {
    if (comp[i] >= 0) {
      continue
    }
    comp[i] = c
    stack.push(i)
    while (stack.length) {
      const v = stack.pop()
      for (const w of adj[v]) {
        if (comp[w] < 0) {
          comp[w] = c
          stack.push(w)
        }
      }
    }
    c += 1
  }
  const compSize = new Array(c).fill(0)
  for (const id of comp) {
    compSize[id] += 1
  }
  const compOrder = Array.from({length: c}, (_, i) => i).sort(
    (a, b) => compSize[b] - compSize[a]
  )
  const compRank = new Array(c)
  compOrder.forEach((cid, rank) => {
    compRank[cid] = rank
  })
  return {comp, compSize, compOrder, compRank}
}

/**
 * Estimate missing birth years from relatives.
 *
 * People with a known birth year keep it (fixed). For the rest, iterative
 * relaxation over the kinship graph: a person's estimate is the average of
 * (neighbor estimate + offset), where the offset is +GENERATION_GAP from
 * parent to child, -GENERATION_GAP from child to parent and 0 between
 * spouses. A known death year clamps the estimate into
 * [death - MAX_LIFESPAN, death]. Nodes unreachable from any dated node
 * stay null.
 *
 * @param {Array} people [{birth_year, death_year}]
 * @param {Array} links [{source, target, type}] — source is the parent for
 *   'child' links
 * @returns {{years: (number|null)[], estimated: boolean[]}} rounded year per
 *   node (real or estimated), and whether it was estimated
 */
export function estimateBirthYears(people, links, maxIter = 80) {
  const n = people.length
  const years = new Array(n).fill(null)
  const known = new Array(n).fill(false)
  for (let i = 0; i < n; i += 1) {
    const by = people[i].birth_year
    if (by && by > 1000 && by < 2100) {
      years[i] = by
      known[i] = true
    }
  }
  // neighbor lists with the offset to apply when propagating INTO the node
  const inbound = Array.from({length: n}, () => [])
  for (const l of links) {
    const off = l.type === 'child' ? GENERATION_GAP : 0
    inbound[l.target].push([l.source, off])
    inbound[l.source].push([l.target, -off])
  }
  const clamp = i => {
    const dy = people[i].death_year
    if (dy && dy > 1000 && dy < 2100 && years[i] !== null) {
      years[i] = Math.min(dy, Math.max(dy - MAX_LIFESPAN, years[i]))
    }
  }
  for (let iter = 0; iter < maxIter; iter += 1) {
    let maxDelta = 0
    for (let i = 0; i < n; i += 1) {
      if (known[i]) {
        continue
      }
      let sum = 0
      let count = 0
      for (const [u, off] of inbound[i]) {
        if (years[u] !== null) {
          sum += years[u] + off
          count += 1
        }
      }
      if (!count) {
        continue
      }
      const next = sum / count
      maxDelta = Math.max(
        maxDelta,
        years[i] === null ? Infinity : Math.abs(next - years[i])
      )
      years[i] = next
      clamp(i)
    }
    if (maxDelta < 0.5) {
      break
    }
  }
  const estimated = new Array(n).fill(false)
  for (let i = 0; i < n; i += 1) {
    if (!known[i] && years[i] !== null) {
      years[i] = Math.round(years[i])
      estimated[i] = true
    }
  }
  return {years, estimated}
}
