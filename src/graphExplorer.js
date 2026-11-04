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
/**
 * Betweenness centrality (Brandes, unweighted, undirected).
 *
 * O(V·E) per connected component — cheap on genealogy "archipelago" graphs
 * where even the largest component is a few hundred people.
 *
 * @param {number[][]} adj adjacency lists
 * @returns {number[]} raw betweenness score per node
 */
export function betweennessCentrality(adj) {
  const n = adj.length
  const bc = new Array(n).fill(0)
  const dist = new Array(n)
  const sigma = new Array(n)
  const delta = new Array(n)
  const preds = new Array(n)
  const queue = new Array(n)
  for (let s = 0; s < n; s += 1) {
    if (!adj[s].length) {
      continue
    }
    dist.fill(-1)
    sigma.fill(0)
    delta.fill(0)
    const stack = []
    let qHead = 0
    let qTail = 0
    dist[s] = 0
    sigma[s] = 1
    preds[s] = []
    queue[qTail] = s
    qTail += 1
    while (qHead < qTail) {
      const v = queue[qHead]
      qHead += 1
      stack.push(v)
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1
          preds[w] = []
          queue[qTail] = w
          qTail += 1
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v]
          preds[w].push(v)
        }
      }
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const w = stack[i]
      for (const v of preds[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
      }
      if (w !== s) {
        bc[w] += delta[w]
      }
    }
  }
  // each undirected pair was counted from both endpoints
  for (let i = 0; i < n; i += 1) {
    bc[i] /= 2
  }
  return bc
}

/**
 * Number of distinct descendants per node, following 'child' links
 * (source = parent, target = child). Cycle-safe (bad data won't hang).
 *
 * @param {number} n number of nodes
 * @param {Array} links [{source, target, type}]
 * @returns {number[]} descendant count per node
 */
export function descendantCounts(n, links) {
  const children = Array.from({length: n}, () => [])
  for (const l of links) {
    if (l.type === 'child') {
      children[l.source].push(l.target)
    }
  }
  const counts = new Array(n).fill(0)
  const seen = new Array(n).fill(-1)
  for (let s = 0; s < n; s += 1) {
    if (!children[s].length) {
      continue
    }
    let count = 0
    const stack = [...children[s]]
    while (stack.length) {
      const v = stack.pop()
      if (seen[v] === s) {
        continue
      }
      seen[v] = s
      count += 1
      for (const w of children[v]) {
        if (seen[w] !== s) {
          stack.push(w)
        }
      }
    }
    counts[s] = count
  }
  return counts
}

/**
 * Similarity edges between connected components ("islands").
 *
 * Builds a sparse meta-graph for laying out disconnected islands so that
 * similar ones sit close together: similarity = cosine over TF-IDF surname
 * bags (grouped via surnameKey), dampened by the distance between the
 * islands' mean birth years. For each island only its top-k most similar
 * neighbors become edges.
 *
 * @param {(string|null)[]} surnameKeys normalized surname per node
 * @param {(number|null)[]} years (estimated) birth year per node
 * @param {number[]} comp component id per node
 * @param {number} nComp number of components
 * @returns {{a: number, b: number, w: number}[]} deduplicated meta edges
 */
export function componentSimilarityEdges(
  surnameKeys,
  years,
  comp,
  nComp,
  {k = 6, minScore = 0.05, yearScale = 60, maxDf = 400} = {}
) {
  const bags = Array.from({length: nComp}, () => new Map())
  const sizes = new Array(nComp).fill(0)
  const yearSum = new Array(nComp).fill(0)
  const yearCnt = new Array(nComp).fill(0)
  for (let i = 0; i < comp.length; i += 1) {
    const c = comp[i]
    sizes[c] += 1
    const s = surnameKeys[i]
    if (s) {
      bags[c].set(s, (bags[c].get(s) || 0) + 1)
    }
    const y = years[i]
    if (y) {
      yearSum[c] += y
      yearCnt[c] += 1
    }
  }
  const df = new Map()
  for (const bag of bags) {
    for (const s of bag.keys()) {
      df.set(s, (df.get(s) || 0) + 1)
    }
  }
  const vecs = bags.map((bag, c) => {
    const v = new Map()
    for (const [s, cnt] of bag) {
      v.set(s, (cnt / sizes[c]) * Math.log(1 + nComp / df.get(s)))
    }
    return v
  })
  const norms = vecs.map(
    v => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1
  )
  // inverted index: surname → components containing it
  const inverted = new Map()
  vecs.forEach((v, c) => {
    for (const s of v.keys()) {
      if (!inverted.has(s)) {
        inverted.set(s, [])
      }
      inverted.get(s).push(c)
    }
  })
  // accumulate dot products only for component pairs sharing a surname
  const dots = Array.from({length: nComp}, () => new Map())
  for (const [s, comps] of inverted) {
    // ubiquitous surnames carry ~no signal (tiny idf) but quadratic cost
    if (comps.length < 2 || comps.length > maxDf) {
      continue
    }
    for (let i = 0; i < comps.length; i += 1) {
      for (let j = i + 1; j < comps.length; j += 1) {
        const a = comps[i]
        const b = comps[j]
        const add = vecs[a].get(s) * vecs[b].get(s)
        dots[a].set(b, (dots[a].get(b) || 0) + add)
      }
    }
  }
  const meanYear = c => (yearCnt[c] ? yearSum[c] / yearCnt[c] : null)
  const seen = new Map()
  for (let a = 0; a < nComp; a += 1) {
    const scored = []
    for (const [b, dot] of dots[a]) {
      let w = dot / (norms[a] * norms[b])
      const ya = meanYear(a)
      const yb = meanYear(b)
      if (ya !== null && yb !== null) {
        const f = Math.exp(-(((ya - yb) / yearScale) ** 2))
        w *= 0.6 + 0.4 * f
      }
      if (w >= minScore) {
        scored.push([b, w])
      }
    }
    scored.sort((x, y) => y[1] - x[1])
    for (const [b, w] of scored.slice(0, k)) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const prev = seen.get(key)
      if (!prev || w > prev.w) {
        seen.set(key, {a: Math.min(a, b), b: Math.max(a, b), w})
      }
    }
  }
  return [...seen.values()]
}

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
