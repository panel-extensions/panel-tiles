// @ts-check
// DOM-free layout generation so it can be unit tested under node.

export const COLUMNS = 12
export const DEFAULT_REFERENCE_WIDTH = 1200
const PCT_EPS = 1e-3
const PX_EPS = 0.5
const DEFAULT_HEIGHT = 200

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
    const next = []
    for (const s of slots) {
      if (!overlaps(s, rect)) { next.push(s); continue }
      if (rect.x > s.x) { next.push({x: s.x, y: s.y, w: rect.x - s.x, h: s.h}) }
      if (rect.x + rect.w < s.x + s.w) { next.push({x: rect.x + rect.w, y: s.y, w: s.x + s.w - rect.x - rect.w, h: s.h}) }
      if (rect.y > s.y) { next.push({x: s.x, y: s.y, w: s.w, h: rect.y - s.y}) }
      if (rect.y + rect.h < s.y + s.h) { next.push({x: s.x, y: rect.y + rect.h, w: s.w, h: s.y + s.h - rect.y - rect.h}) }
    }
    slots = next
      .filter(s => s.w > PCT_EPS && s.h > PX_EPS)
      .filter((s, i, all) => !all.some((o, j) => j !== i && contains(o, s) && (!contains(s, o) || j < i)))
      .sort((a, b) => a.y - b.y || a.x - b.x)
  }
  return rects
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

function roundPct(value) {
  return Math.min(100, Math.max(1, Math.round(value * 1e4) / 1e4))
}

/**
 * Derive a layout for container `width` from a `layout` authored at
 * `referenceWidth`, wrapping tiles that would shrink below
 * max(minWidths[i], shrink * authored px) onto new lines.
 *
 * `heights[i]` supplies measured heights for entries without an explicit one.
 * Returns the input layout itself when nothing needs to change.
 */
export function generateLayout(layout, {width, referenceWidth, shrink = 0.5, minWidths = [], heights = []}) {
  if (!layout?.length || !(width > 0) || width >= referenceWidth) {
    return {layout, changed: false}
  }
  const visible = []
  layout.forEach((spec, i) => {
    if (spec && spec.visible !== false) { visible.push({spec, i}) }
  })
  if (!visible.length) { return {layout, changed: false} }
  visible.sort((a, b) => (a.spec.index ?? a.i) - (b.spec.index ?? b.i) || a.i - b.i)

  const rects = packLayout(visible.map(({spec, i}) => ({
    key: i, width: spec.width ?? 100, height: spec.height ?? heights[i] ?? DEFAULT_HEIGHT,
  })))
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
  mode = "wrap", shrink = 0.5, minWidths = [], heights = [],
}) {
  const override = band && band !== baseBand ? overrides?.[band] : null
  if (override?.length) { return {layout: override, source: "custom"} }
  if (mode === "scale") { return {layout, source: "base"} }
  const generated = generateLayout(layout, {width, referenceWidth, shrink, minWidths, heights})
  return {layout: generated.layout, source: generated.changed ? "generated" : "base"}
}
