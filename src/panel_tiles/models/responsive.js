// @ts-check
// DOM-free layout generation so it can be unit tested under node.

export const COLUMNS = 12
export const DEFAULT_REFERENCE_WIDTH = 1200
const PCT_EPS = 1e-3
const PX_EPS = 0.5
const DEFAULT_HEIGHT = 200
// Browsers round tile widths to 1/64px layout units and Muuri moves a tile to
// the next free slot when it overflows by more than 0.001px, so a width taken
// from a resize stays this far under the edge it was dragged or snapped to.
export const FIT_SLACK_PCT = 0.01
// Fraction of a tile a drag must reach into, from the side it enters, to pass it.
export const SWAP_THRESHOLD = 0.25

function overlaps(a, b) {
  return (
    a.x < b.x + b.w - PCT_EPS && b.x < a.x + a.w - PCT_EPS &&
    a.y < b.y + b.h - PX_EPS && b.y < a.y + a.h - PX_EPS
  )
}

function contains(outer, inner) {
  return (
    inner.x >= outer.x - PCT_EPS && inner.y >= outer.y - PX_EPS &&
    inner.x + inner.w <= outer.x + outer.w + PCT_EPS &&
    inner.y + inner.h <= outer.y + outer.h + PX_EPS
  )
}

/**
 * First-fit packing into free rectangles sorted top-left, mirroring Muuri's
 * `fillGaps` packer. Widths are percentages, heights pixels; since tile outer
 * widths are exact percentages the result is independent of container width.
 */
export function packLayout(entries) {
  let slots = [{x: 0, y: 0, w: 100, h: Infinity}]
  const rects = []
  for (const entry of entries) {
    const w = Math.min(100, Math.max(entry.width, 0))
    const h = Math.max(entry.height, 1)
    // The unbounded bottom slot always fits, so a slot is always found.
    const slot = slots.find(s => w <= s.w + PCT_EPS && h <= s.h + PX_EPS)
    const rect = {key: entry.key, x: slot.x, y: slot.y, w, h}
    rects.push(rect)
    slots = carve(slots, rect)
  }
  return rects
}

/** Free rectangles left of `slots` once `rect` is occupied, maximal and sorted top-left. */
function carve(slots, rect) {
  const next = []
  for (const s of slots) {
    if (!overlaps(s, rect)) { next.push(s); continue }
    if (rect.x > s.x) { next.push({x: s.x, y: s.y, w: rect.x - s.x, h: s.h}) }
    if (rect.x + rect.w < s.x + s.w) { next.push({x: rect.x + rect.w, y: s.y, w: s.x + s.w - rect.x - rect.w, h: s.h}) }
    if (rect.y > s.y) { next.push({x: s.x, y: s.y, w: s.w, h: rect.y - s.y}) }
    if (rect.y + rect.h < s.y + s.h) { next.push({x: s.x, y: rect.y + rect.h, w: s.w, h: s.y + s.h - rect.y - rect.h}) }
  }
  return next
    .filter(s => s.w > PCT_EPS && s.h > PX_EPS)
    .filter((s, i, all) => !all.some((o, j) => j !== i && contains(o, s) && (!contains(s, o) || j < i)))
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Row-banded packing. Tiles fill a row left to right in order and the row is
 * as tall as its tallest tile; the next row starts below it. Once a tile no
 * longer fits on the row's top line, it and the tiles after it may drop into
 * holes lower down in the same row (e.g. a second card stacked under a first
 * one beside a tall chart), but never into an earlier row, and the top line
 * takes no further tiles so the reading order stays left to right.
 *
 * `entries` are outer {width, height} in any unit matching `width`. Returns
 * a rect per entry and the rows, each with its band and the entry indices it
 * holds in order.
 */
export function packRows(entries, width) {
  const rects = []
  const rows = []
  let row = null
  const open = top => {
    row = {top, bottom: top, cursor: 0, closed: false, items: []}
    rows.push(row)
  }
  open(0)
  entries.forEach((entry, i) => {
    const w = Math.min(width, Math.max(entry.width, 0))
    const h = Math.max(entry.height, 0)
    let spot = rowSpot(row, rects, w, h, width)
    if (!spot) {
      open(row.bottom)
      spot = {x: 0, y: row.top}
    }
    rects[i] = {x: spot.x, y: spot.y, w, h}
    if (spot.y <= row.top + PX_EPS) { row.cursor = spot.x + w } else { row.closed = true }
    row.bottom = Math.max(row.bottom, spot.y + h)
    row.items.push(i)
  })
  const bands = rows.filter(r => r.items.length).map(({top, bottom, items}) => ({top, bottom, items}))
  return {rects, rows: bands, height: bands.length ? bands[bands.length - 1].bottom : 0}
}

function rowSpot(row, rects, w, h, width) {
  if (!row.items.length || (!row.closed && row.cursor + w <= width + PCT_EPS)) { return {x: row.cursor, y: row.top} }
  let free = [{x: 0, y: row.top, w: width, h: row.bottom - row.top}]
  for (const i of row.items) { free = carve(free, rects[i]) }
  return free.find(s => s.y > row.top + PX_EPS && w <= s.w + PCT_EPS && h <= s.h + PX_EPS) ?? null
}

/**
 * Where a tile dragged with the pointer at (`x`, `y`) should go, given the
 * `rows` and `rects` of `packRows` and the index of the `dragged` entry.
 * The row under the pointer is the target: over a tile, its horizontal
 * midpoint decides before or after it; in a hole the pointer goes after the
 * tile above it; right of the row's tiles is the end of that row. Below
 * every row is the end of the grid. With a horizontal `lead` (-1 or 1) the
 * pointer only has to reach `SWAP_THRESHOLD` into a tile, from the side it
 * enters, to pass it. Returns {ref, side} relative to another entry,
 * {end: true}, or null to stay put.
 */
export function dropTarget(rows, rects, dragged, x, y, lead = 0) {
  if (!rows.length || y >= rows[rows.length - 1].bottom) { return {end: true} }
  const row = rows.find(r => y < r.bottom)
  const items = row.items.filter(i => i !== dragged)
  if (!items.length) { return null }
  const spansX = r => x >= r.x && x < r.x + r.w
  const spansY = r => y >= r.y && y < r.y + r.h
  const hit = items.find(i => spansX(rects[i]) && spansY(rects[i]))
  if (hit !== undefined) {
    const r = rects[hit]
    const split = lead > 0 ? SWAP_THRESHOLD : lead < 0 ? 1 - SWAP_THRESHOLD : 0.5
    return {ref: hit, side: x < r.x + r.w * split ? "before" : "after"}
  }
  const above = items.filter(i => spansX(rects[i]) && rects[i].y <= y)
  if (above.length) { return {ref: above[above.length - 1], side: "after"} }
  let line = items.filter(i => spansY(rects[i]))
  if (!line.length) { line = items.filter(i => rects[i].y <= row.top + PX_EPS) }
  const next = line
    .filter(i => rects[i].x + rects[i].w / 2 > x)
    .sort((a, b) => rects[a].x - rects[b].x)[0]
  if (next !== undefined) { return {ref: next, side: "before"} }
  return {ref: items[items.length - 1], side: "after"}
}

/**
 * The point `dropTarget` should test for a tile dragged by `pointer` whose
 * current box is `rect`, moving in direction `dir` ({x, y} of -1, 0 or 1).
 * The pointer sits on the drag handle in the tile's top-left corner, so a
 * large tile would have to travel its own size before the pointer reaches a
 * neighbour. The edge leading the movement is used instead: horizontally
 * that edge itself, vertically the furthest row it reaches `SWAP_THRESHOLD`
 * of the way into. Given the `rects` of `packRows` and the row `width`, a
 * `dragged` tile too wide to share a row with any other tile is placed by
 * the pointer horizontally. Returns the point and the horizontal `lead` to
 * pass on to `dropTarget`.
 */
export function dragProbe(rows, rect, pointer, dir, {rects = null, dragged = -1, width = Infinity} = {}) {
  let lead = dir.x
  // A tile that can't share a row with any other tile is placed by the pointer alone.
  if (rects && dragged >= 0) {
    const narrowest = Math.min(...rects.filter((_, i) => i !== dragged).map(r => r.w))
    if (rects[dragged].w + narrowest > width + PX_EPS) { lead = 0 }
  }
  let x = pointer.x
  if (lead > 0) { x = rect.x + rect.w - 1 } else if (lead < 0) { x = rect.x + 1 }
  let row = null
  if (dir.y > 0) {
    row = rows.filter(r => r.top + (r.bottom - r.top) * SWAP_THRESHOLD <= rect.y + rect.h).pop() ?? null
  } else if (dir.y < 0) {
    row = rows.find(r => r.bottom - (r.bottom - r.top) * SWAP_THRESHOLD >= rect.y) ?? null
  }
  const y = !row || (pointer.y >= row.top && pointer.y < row.bottom) ? pointer.y : row.top + 1
  return {x, y, lead}
}

/** Muuri move index for an item at `current` going `side` of the item at `ref`. */
export function moveIndex(current, ref, side) {
  if (side === "before") { return current < ref ? ref - 1 : ref }
  return current < ref ? ref : ref + 1
}

function groupByInterval(items, lo, hi, eps) {
  const sorted = [...items].sort((a, b) => lo(a) - lo(b) || a.order - b.order)
  const groups = []
  let current = null
  let end = -Infinity
  for (const item of sorted) {
    if (current && lo(item) < end - eps) {
      current.push(item)
      end = Math.max(end, hi(item))
    } else {
      current = [item]
      groups.push(current)
      end = hi(item)
    }
  }
  return groups
}

function makeNode(type, children) {
  const leaves = children.flatMap(c => c.leaves)
  const x0 = Math.min(...leaves.map(l => l.x0))
  const x1 = Math.max(...leaves.map(l => l.x1))
  const c0 = Math.min(...leaves.map(l => l.c0))
  const c1 = Math.max(...leaves.map(l => l.c1))
  return {type, children, leaves, nat: x1 - x0, span: c1 - c0}
}

/** Recursive XY-cut of packed tiles into rows (side by side) and stacks (top to bottom). */
export function buildTree(items) {
  if (items.length === 1) {
    const item = items[0]
    return {type: "leaf", item, children: [], leaves: [item], nat: item.x1 - item.x0, span: item.c1 - item.c0}
  }
  const strips = groupByInterval(items, i => i.y0, i => i.y1, PX_EPS)
  if (strips.length > 1) { return makeNode("stack", strips.map(buildTree)) }
  const columns = groupByInterval(items, i => i.c0, i => i.c1, 0)
  if (columns.length > 1) { return makeNode("row", columns.map(buildTree)) }
  // No guillotine cut exists: fall back to a flat row in visual order.
  const leaves = [...items].sort((a, b) => a.order - b.order).map(i => buildTree([i]))
  return makeNode("row", leaves)
}

/** Split `spans` into `k` contiguous lines minimizing the widest line; ties favor longer early lines. */
export function balancedPartition(spans, k) {
  const n = spans.length
  const prefix = [0]
  for (const s of spans) { prefix.push(prefix[prefix.length - 1] + s) }
  const sum = (i, j) => prefix[j] - prefix[i]
  const memo = new Map()
  function best(i, lines) {
    if (lines === 1) { return {cost: sum(i, n), cuts: []} }
    const key = `${i}:${lines}`
    if (memo.has(key)) { return memo.get(key) }
    let result = null
    for (let j = n - lines + 1; j > i; j--) {
      const rest = best(j, lines - 1)
      const cost = Math.max(sum(i, j), rest.cost)
      if (!result || cost < result.cost) { result = {cost, cuts: [j, ...rest.cuts]} }
    }
    memo.set(key, result)
    return result
  }
  const {cuts} = best(0, k)
  const bounds = [0, ...cuts, n]
  const lines = []
  for (let i = 0; i < bounds.length - 1; i++) { lines.push([bounds[i], bounds[i + 1]]) }
  return lines
}

/** Largest-remainder allocation of `total` columns in proportion to `spans`, at least one each. */
export function allocateColumns(spans, total = COLUMNS) {
  const sum = spans.reduce((a, b) => a + b, 0)
  if (spans.length > total || sum <= 0) { return spans.map(() => total / spans.length) }
  const raw = spans.map(s => (s / sum) * total)
  const cols = raw.map(r => Math.max(1, Math.floor(r)))
  let remaining = total - cols.reduce((a, b) => a + b, 0)
  const byRemainder = raw.map((r, i) => i).sort((a, b) => (raw[b] - cols[b]) - (raw[a] - cols[a]) || a - b)
  for (let i = 0; remaining > 0; i = (i + 1) % byRemainder.length, remaining--) { cols[byRemainder[i]]++ }
  while (remaining < 0) {
    const widest = cols.indexOf(Math.max(...cols))
    cols[widest]--
    remaining++
  }
  return cols
}

function minWidth(node, ctx) {
  if (node.type === "leaf") {
    const natural = (node.nat / 100) * ctx.referenceWidth
    return Math.max(node.item.minPx || 0, ctx.shrink * natural)
  }
  return Math.max(...node.children.map(c => minWidth(c, ctx)))
}

function fits(share, min, avail) {
  return share + PX_EPS >= Math.min(min, avail)
}

function placeLine(children, shares, x, y, ctx, out) {
  let height = 0
  children.forEach((child, i) => {
    height = Math.max(height, fitNode(child, shares[i], x, y, ctx, out))
    x += shares[i]
  })
  return height
}

/** Fit `node` into `avail` px at (x, y), appending leaf placements to `out`; returns the height used. */
function fitNode(node, avail, x, y, ctx, out) {
  if (node.type === "leaf") {
    out.push({item: node.item, px: avail, x, y})
    return node.item.y1 - node.item.y0
  }
  if (node.type === "stack") {
    let height = 0
    for (const child of node.children) {
      let share = avail * child.nat / node.nat
      if (!fits(share, minWidth(child, ctx), avail)) {
        share = avail
        ctx.changed = true
      }
      height += fitNode(child, share, x, y + height, ctx, out)
    }
    return height
  }
  const children = node.children
  const mins = children.map(c => minWidth(c, ctx))
  const authored = children.map(c => avail * c.nat / node.nat)
  if (authored.every((share, i) => fits(share, mins[i], avail))) {
    return placeLine(children, authored, x, y, ctx, out)
  }
  ctx.changed = true
  const spans = children.map(c => c.span)
  for (let k = 2; k <= children.length; k++) {
    const lines = balancedPartition(spans, k)
    const shares = lines.map(([start, end]) => allocateColumns(spans.slice(start, end)).map(c => avail * c / COLUMNS))
    if (k < children.length && !shares.flat().every((share, i) => fits(share, mins[i], avail))) { continue }
    let height = 0
    lines.forEach(([start, end], i) => {
      height += placeLine(children.slice(start, end), shares[i], x, y + height, ctx, out)
    })
    return height
  }
  return 0
}

/** Percentage of `containerWidth` taken by `px`, less `FIT_SLACK_PCT` and rounded down to 1e-4. */
export function widthPercent(px, containerWidth) {
  const pct = (px / containerWidth) * 100 - FIT_SLACK_PCT
  return Math.min(100, Math.max(1, Math.floor(pct * 1e4) / 1e4))
}

/**
 * Width to lay out and author breakpoint `band` ({min, max}) at when the
 * container measures `width`: `width` itself while it lies inside the band,
 * else `fallback` if that lies inside it, else the nearest width inside it.
 */
export function bandWidth(width, band, fallback = null) {
  if (!band) { return width }
  const inside = w => (band.min == null || w >= band.min) && (band.max == null || w < band.max)
  if (inside(width)) { return width }
  if (fallback != null && inside(fallback)) { return fallback }
  return band.max != null && width >= band.max ? band.max - 1 : band.min
}

/**
 * Row geometry for widening `items[index]`, from Muuri's outer boxes (px) at
 * drag start. Earlier items to the right of a tile in its row fix where that
 * tile's row ends; later items in the resized tile's band are pushed along,
 * so `fill` is the widest it can grow without anything reflowing, and `end`
 * is the row end that bounds it.
 */
export function planRowResize(items, index, containerWidth) {
  const r = items[index]
  const overlaps = (a, b) => a.top < b.top + b.height - PX_EPS && b.top < a.top + a.height - PX_EPS
  const rightOf = (o, t) => o !== t && overlaps(o, t) && o.left >= t.left + t.width - PX_EPS
  // Tiles placed before the resized one stay put, so each tile's row ends at the first of them to its right.
  const rowEnd = t => items.reduce((end, o, j) => (j < index && rightOf(o, t) ? Math.min(end, o.left) : end), containerWidth)
  const limit = rowEnd(r)
  const pushed = items
    .map((o, j) => ({index: j, left: o.left, width: o.width, limit: rowEnd(o)}))
    .filter(p => p.index > index && rightOf(items[p.index], r) && p.left < p.limit - PX_EPS)
    .sort((a, b) => a.left - b.left)
  // Tiles stacked above one another in the band share their columns, so the
  // row needs the width they cover, not the sum of their widths.
  let fill = limit - r.left
  let end = limit
  for (const p of pushed) {
    p.offset = coveredWidth(pushed, p.left)
    const room = p.limit - r.left - p.offset - p.width
    if (room < fill) { fill = room; end = p.limit }
  }
  return {index, left: r.left, width: r.width, limit, end, fill, pushed}
}

/** Width covered by the spans of `boxes` left of `end`, overlaps counted once. */
function coveredWidth(boxes, end) {
  let covered = 0
  let reach = -Infinity
  for (const {left, width} of boxes) {
    const from = Math.max(left, reach)
    const to = Math.min(left + width, end)
    if (to > from) { covered += to - from }
    reach = Math.max(reach, left + width)
  }
  return covered
}

/**
 * What a resize to `desired` outer px does to the row in `plan`: "free" and
 * "fill" apply `width` now, while "overflow" holds the tile at the row end
 * until release, when `final` applies and the `moving` items reflow.
 */
export function resolveRowResize(plan, desired, tolerance) {
  if (desired < plan.fill - PX_EPS) {
    return {state: "free", width: desired, final: desired, moving: []}
  }
  if (desired <= plan.fill + tolerance) {
    return {state: "fill", width: plan.fill, final: plan.fill, moving: []}
  }
  const right = plan.left + desired
  let moving = []
  if (right > plan.limit + PX_EPS) {
    moving = [plan.index]
  } else {
    // Muuri places tiles in order, so every tile after the first that no
    // longer fits is placed again.
    const over = plan.pushed.filter(p => right + p.offset + p.width > p.limit + PX_EPS)
    const first = Math.min(...over.map(p => p.index))
    moving = plan.pushed.filter(p => p.index >= first).map(p => p.index)
  }
  return {state: "overflow", width: plan.fill, final: desired, moving}
}

/**
 * Snap a dragged edge at `x` to the nearest of `targets` within `range`.
 * Within `tolerance` past `fill` the edge always lands on `fill`; past that
 * only targets beyond the tolerance zone apply.
 */
export function snapEdge(x, targets, {range, fill = null, tolerance = 0}) {
  let candidates = targets
  if (fill != null) {
    if (x > fill && x <= fill + tolerance) { return fill }
    candidates = x > fill ? targets.filter(t => t > fill + tolerance) : [fill, ...targets.filter(t => t <= fill)]
  }
  let best
  for (const t of candidates) {
    if (Math.abs(t - x) < range && (best === undefined || Math.abs(t - x) < Math.abs(best - x))) { best = t }
  }
  return best
}

function roundPct(value) {
  return Math.min(100, Math.max(1, Math.round(value * 1e4) / 1e4))
}

/**
 * Derive a layout for container `width` from a `layout` authored at
 * `referenceWidth`, wrapping tiles that would shrink below
 * max(minWidths[i], shrink * authored px) onto new lines.
 *
 * `heights[i]` supplies measured heights for entries without an explicit one,
 * and `packing` names the layout ("masonry" or "rows") that places the tiles.
 * Returns the input layout itself when nothing needs to change.
 */
export function generateLayout(layout, {width, referenceWidth, shrink = 0.5, minWidths = [], heights = [], packing = "masonry"}) {
  if (!layout?.length || !(width > 0) || width >= referenceWidth) {
    return {layout, changed: false}
  }
  const visible = []
  layout.forEach((spec, i) => {
    if (spec && spec.visible !== false) { visible.push({spec, i}) }
  })
  if (!visible.length) { return {layout, changed: false} }
  visible.sort((a, b) => (a.spec.index ?? a.i) - (b.spec.index ?? b.i) || a.i - b.i)

  const entries = visible.map(({spec, i}) => ({
    key: i, width: spec.width ?? 100, height: spec.height ?? heights[i] ?? DEFAULT_HEIGHT,
  }))
  const rects = packing === "rows"
    ? packRows(entries, 100).rects.map((rect, n) => ({...rect, key: entries[n].key}))
    : packLayout(entries)
  const items = rects.map((rect, order) => {
    const c0 = Math.min(COLUMNS - 1, Math.round(rect.x * COLUMNS / 100))
    const c1 = Math.max(c0 + 1, Math.min(COLUMNS, Math.round((rect.x + rect.w) * COLUMNS / 100)))
    return {
      key: rect.key, order, minPx: minWidths[rect.key] || 0,
      x0: rect.x, x1: rect.x + rect.w, c0, c1, y0: rect.y, y1: rect.y + rect.h,
    }
  })

  const tree = buildTree(items)
  const root = {type: "stack", children: [tree], leaves: tree.leaves, nat: 100, span: COLUMNS}
  const ctx = {referenceWidth, shrink, changed: false}
  const out = []
  fitNode(root, width, 0, 0, ctx, out)
  if (!ctx.changed) { return {layout, changed: false} }

  // Muuri places each tile in the top-left-most free slot, so ordering by
  // intended top-left position reproduces the fitted arrangement.
  const placed = out
    .map((p, dfs) => ({...p, dfs}))
    .sort((a, b) => (Math.abs(a.y - b.y) > PX_EPS ? a.y - b.y : 0) || (Math.abs(a.x - b.x) > PX_EPS ? a.x - b.x : 0) || a.dfs - b.dfs)
  const result = layout.map(spec => (spec ? {...spec} : spec))
  placed.forEach(({item, px}, index) => {
    result[item.key] = {...result[item.key], index, width: roundPct(px / width * 100)}
  })
  let hiddenIndex = out.length
  layout.forEach((spec, i) => {
    if (spec && spec.visible === false) { result[i] = {...result[i], index: hiddenIndex++} }
  })
  return {layout: result, changed: true}
}

/**
 * Pick the layout to display: an override for a non-base band, else the base
 * at or above its reference width, else a generated layout.
 */
export function resolveLayout({
  layout, overrides = {}, band = null, baseBand = null, width, referenceWidth,
  mode = "wrap", shrink = 0.5, minWidths = [], heights = [], packing = "masonry",
}) {
  const override = band && band !== baseBand ? overrides?.[band] : null
  if (override?.length) { return {layout: override, source: "custom"} }
  if (mode === "scale") { return {layout, source: "base"} }
  const generated = generateLayout(layout, {width, referenceWidth, shrink, minWidths, heights, packing})
  return {layout: generated.layout, source: generated.changed ? "generated" : "base"}
}
