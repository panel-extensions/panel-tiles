import assert from "node:assert/strict"
import {test} from "node:test"

import {
  FIT_SLACK_PCT, allocateColumns, balancedPartition, generateLayout, packLayout, planRowResize, resolveLayout,
  resolveRowResize, snapEdge, widthPercent,
} from "../../src/panel_tiles/models/responsive.js"

const REF = 1400

function tiles(...specs) {
  return specs.map(([width, height = 100, extra = {}], index) => ({index, width, height, visible: true, ...extra}))
}

function widths(layout) {
  return layout.map(spec => spec.width)
}

function order(layout) {
  return [...layout.keys()].sort((a, b) => layout[a].index - layout[b].index)
}

function generate(layout, width, options = {}) {
  return generateLayout(layout, {width, referenceWidth: REF, ...options})
}

test("packLayout places tiles first-fit into gaps", () => {
  const rects = packLayout([
    {key: "chart", width: 66.6667, height: 400},
    {key: "a", width: 33.3333, height: 200},
    {key: "b", width: 33.3333, height: 200},
    {key: "table", width: 100, height: 100},
  ])
  const byKey = Object.fromEntries(rects.map(r => [r.key, r]))
  assert.deepEqual([byKey.a.x, byKey.a.y], [66.6667, 0])
  assert.deepEqual([byKey.b.x, byKey.b.y], [66.6667, 200])
  assert.deepEqual([byKey.table.x, byKey.table.y], [0, 400])
})

test("balancedPartition balances line spans and favors longer early lines", () => {
  assert.deepEqual(balancedPartition([3, 3, 3, 3], 2), [[0, 2], [2, 4]])
  assert.deepEqual(balancedPartition([3, 3, 3, 3, 3], 2), [[0, 3], [3, 5]])
  assert.deepEqual(balancedPartition([6, 3, 3], 2), [[0, 1], [1, 3]])
})

test("allocateColumns keeps equal spans equal and sums to 12", () => {
  assert.deepEqual(allocateColumns([4, 4, 4]), [4, 4, 4])
  assert.deepEqual(allocateColumns([3, 3]), [6, 6])
  assert.deepEqual(allocateColumns([3, 3, 3]), [4, 4, 4])
  assert.deepEqual(allocateColumns([5, 2]), [9, 3])
  assert.equal(allocateColumns([1, 1, 1, 1, 1, 7]).reduce((a, b) => a + b), 12)
})

test("returns the base unchanged at or above the reference width", () => {
  const layout = tiles([25], [25], [25], [25])
  for (const width of [REF, 2000]) {
    const result = generate(layout, width)
    assert.equal(result.changed, false)
    assert.equal(result.layout, layout)
  }
})

test("returns the base unchanged while every tile fits", () => {
  const layout = tiles([37], [63])
  const result = generate(layout, 1000)
  assert.equal(result.changed, false)
  assert.equal(result.layout, layout)
})

test("KPI row wraps 4 -> 2+2 and keeps order", () => {
  const layout = tiles([25], [25], [25], [25])
  assert.equal(generate(layout, 700).changed, false)
  const result = generate(layout, 600)
  assert.equal(result.changed, true)
  assert.deepEqual(widths(result.layout), [50, 50, 50, 50])
  assert.deepEqual(order(result.layout), [0, 1, 2, 3])
})

test("KPI row goes one per line once min_col_width is exceeded", () => {
  const layout = tiles([25], [25], [25], [25])
  assert.deepEqual(widths(generate(layout, 375).layout), [50, 50, 50, 50])
  const floored = generate(layout, 375, {minWidths: [200, 200, 200, 200]})
  assert.deepEqual(widths(floored.layout), [100, 100, 100, 100])
})

test("chart and table stack full width when they no longer fit", () => {
  const layout = tiles([66.6667], [33.3333])
  assert.equal(generate(layout, 1000).changed, false)
  assert.deepEqual(widths(generate(layout, 600).layout), [100, 100])
})

test("stacked KPIs beside a chart keep their stack when wrapping", () => {
  const layout = tiles([66.6667, 400], [33.3333, 190], [33.3333, 190])
  assert.equal(generate(layout, 1000).changed, false)
  const result = generate(layout, 600)
  assert.deepEqual(widths(result.layout), [100, 100, 100])
  assert.deepEqual(order(result.layout), [0, 1, 2])
})

test("a KPI grid beside a chart wraps below it as a grid", () => {
  // Full-width header, then [chart | 2x2 KPI grid]
  const layout = tiles(
    [100, 60],
    [50, 400],
    [25, 190], [25, 190],
    [25, 190], [25, 190],
  )
  const minWidths = [0, 0, 200, 200, 200, 200]
  assert.equal(generate(layout, 800, {minWidths}).changed, false)
  // 190px KPI columns are below their 200px floor, so they move under the chart and keep their 2x2 arrangement.
  const result = generate(layout, 760, {minWidths})
  assert.deepEqual(widths(result.layout), [100, 100, 50, 50, 50, 50])
  assert.deepEqual(order(result.layout), [0, 1, 2, 3, 4, 5])
  const rects = packLayout(order(result.layout).map(i => ({key: i, width: result.layout[i].width, height: result.layout[i].height})))
  const byKey = Object.fromEntries(rects.map(r => [r.key, r]))
  assert.deepEqual([byKey[2].x, byKey[3].x, byKey[4].x, byKey[5].x], [0, 50, 0, 50])
  assert.ok(byKey[4].y > byKey[2].y)
})

test("a lone narrow tile below a full row widens only when too small", () => {
  const layout = tiles([100, 100], [50, 100])
  assert.equal(generate(layout, 900).changed, false)
  assert.deepEqual(widths(generate(layout, 500).layout), [100, 100])
})

test("unwrapped lines keep their authored percentages", () => {
  const layout = tiles([37, 100], [63, 100], [25], [25], [25], [25])
  const result = generate(layout, 600, {shrink: 0.3, minWidths: [0, 0, 200, 200, 200, 200]})
  assert.equal(result.changed, true)
  assert.equal(result.layout[0].width, 37)
  assert.equal(result.layout[1].width, 63)
  assert.deepEqual(widths(result.layout).slice(2), [50, 50, 50, 50])
})

test("hidden tiles are passed through after visible ones", () => {
  const layout = tiles([25], [25, 100, {visible: false}], [25], [25], [25])
  const result = generate(layout, 600)
  assert.equal(result.layout[1].visible, false)
  assert.equal(result.layout[1].width, 25)
  assert.equal(result.layout[1].index, 4)
  assert.deepEqual([0, 2, 3, 4].map(i => result.layout[i].width), [50, 50, 50, 50])
})

test("respects authored visual order from index", () => {
  const layout = [
    {index: 1, width: 25, height: 100, visible: true},
    {index: 0, width: 25, height: 100, visible: true},
    {index: 3, width: 25, height: 100, visible: true},
    {index: 2, width: 25, height: 100, visible: true},
  ]
  const result = generate(layout, 600)
  assert.deepEqual(order(result.layout), [1, 0, 3, 2])
})

test("uses measured heights for tiles without an explicit height", () => {
  const layout = tiles([66.6667, 400], [33.3333, null], [33.3333, null])
  const result = generate(layout, 600, {heights: [null, 190, 190]})
  assert.deepEqual(widths(result.layout), [100, 100, 100])
  assert.equal(result.layout[1].height, null)
})

test("is deterministic", () => {
  const layout = tiles([30, 120], [40, 300], [30, 80], [60, 200], [40, 90])
  const a = generate(layout, 640)
  const b = generate(layout, 640)
  assert.deepEqual(a.layout, b.layout)
})

test("no line exceeds 100% for irregular layouts", () => {
  const layout = tiles([30, 120], [40, 300], [30, 80], [60, 200], [40, 90], [20, 50], [80, 60])
  for (const width of [1200, 900, 640, 400, 320]) {
    const result = generate(layout, width)
    const rects = packLayout(order(result.layout).map(i => ({key: i, width: result.layout[i].width, height: result.layout[i].height})))
    for (const rect of rects) { assert.ok(rect.x + rect.w <= 100 + 1e-3) }
  }
})

test("resolveLayout prefers overrides outside the base band", () => {
  const layout = tiles([50], [50])
  const override = tiles([100], [100])
  const args = {layout, overrides: {xs: override, md: override}, baseBand: "md", width: 600, referenceWidth: 1200}
  assert.deepEqual(resolveLayout({...args, band: "xs"}), {layout: override, source: "custom"})
  // Base-band overrides are ignored; 50% of 600px is at the shrink limit so the base holds.
  assert.deepEqual(resolveLayout({...args, band: "md"}), {layout, source: "base"})
  assert.equal(resolveLayout({...args, band: "sm", width: 500}).source, "generated")
  assert.deepEqual(resolveLayout({...args, band: "sm", width: 500, mode: "scale"}), {layout, source: "base"})
})

test("widthPercent stays under the pixel width it was taken from", () => {
  for (const container of [1236.40625, 1212, 1279.703125, 640.5]) {
    for (const px of [100, 353.59, 433.48, 0.37 * container, container]) {
      const pct = widthPercent(px, container)
      assert.ok(pct * container / 100 <= px - FIT_SLACK_PCT * container / 100 + 1e-9)
      assert.ok(pct >= (px / container) * 100 - FIT_SLACK_PCT - 1e-4)
      assert.equal(pct, Math.round(pct * 1e4) / 1e4)
    }
  }
  assert.equal(widthPercent(0, 1000), 1)
  assert.equal(widthPercent(1000, 1000), 100 - FIT_SLACK_PCT)
  assert.equal(widthPercent(2000, 1000), 100)
})

test("a tile snapped flush to a boundary fits beside its neighbour at any width", () => {
  // Tuning (30%) and Weights below Activity (66.6667%), snapped at 1236.4px.
  const width = 1236.40625
  const weights = widthPercent((66.6667 - 30) / 100 * width, width)
  for (const other of [480, 800, 1210, 1600, 2560]) {
    assert.ok((30 + weights) * other / 100 < 66.6667 * other / 100 - 1 / 64)
  }
})

// Orientation map, Weights and Orientation tuning share a row with 192px spare; a full-width tile sits below.
const ROW = [
  {left: 0, top: 0, width: 384, height: 240},
  {left: 384, top: 0, width: 384, height: 240},
  {left: 768, top: 0, width: 320, height: 240},
  {left: 0, top: 240, width: 1280, height: 180},
]

test("planRowResize leaves room for the tiles pushed along the row", () => {
  const plan = planRowResize(ROW, 1, 1280)
  assert.equal(plan.limit, 1280)
  assert.deepEqual(plan.pushed.map(p => p.index), [2])
  assert.equal(plan.fill, 1280 - 384 - 320)
})

test("planRowResize stops the row at an earlier tile reaching down into it", () => {
  // A tall tile placed earlier occupies the right of the second row.
  const items = [
    {left: 0, top: 0, width: 800, height: 300},
    {left: 800, top: 0, width: 480, height: 430},
    {left: 0, top: 300, width: 360, height: 300},
    {left: 360, top: 300, width: 360, height: 300},
  ]
  const plan = planRowResize(items, 3, 1280)
  assert.equal(plan.limit, 800)
  assert.deepEqual(plan.pushed, [])
  assert.equal(plan.fill, 440)
})

test("resolveRowResize fills the row within tolerance and reflows beyond it", () => {
  const plan = planRowResize(ROW, 1, 1280)
  assert.deepEqual(resolveRowResize(plan, 500, 56), {state: "free", width: 500, final: 500, moving: []})
  assert.equal(resolveRowResize(plan, plan.fill - 0.2, 56).state, "fill")
  for (const over of [0, 1, 30, 56]) {
    assert.deepEqual(resolveRowResize(plan, plan.fill + over, 56), {state: "fill", width: plan.fill, final: plan.fill, moving: []})
  }
  assert.deepEqual(resolveRowResize(plan, plan.fill + 57, 56), {state: "overflow", width: plan.fill, final: plan.fill + 57, moving: [2]})
  assert.equal(resolveRowResize(plan, plan.fill + 1, 0).state, "overflow")
})

// A tall tile with two rows of tiles beside it: Map, Weights and Tuning above, Series below Weights.
const STACKED = [
  {left: 0, top: 0, width: 300, height: 320},
  {left: 300, top: 0, width: 300, height: 140},
  {left: 600, top: 0, width: 300, height: 140},
  {left: 300, top: 140, width: 300, height: 140},
]

test("planRowResize counts tiles stacked beside the resized one once", () => {
  const plan = planRowResize(STACKED, 0, 1000)
  assert.deepEqual(plan.pushed.map(p => p.index), [1, 3, 2])
  assert.deepEqual(plan.pushed.map(p => p.offset), [0, 0, 300])
  assert.equal(plan.fill, 400)
})

test("resolveRowResize moves the stacked tiles from the first that no longer fits", () => {
  const plan = planRowResize(STACKED, 0, 1000)
  assert.equal(resolveRowResize(plan, 400, 20).state, "fill")
  assert.deepEqual(resolveRowResize(plan, 450, 20), {state: "overflow", width: 400, final: 450, moving: [3, 2]})
  assert.deepEqual(resolveRowResize(plan, 750, 20).moving, [1, 3, 2])
})

test("planRowResize bounds each pushed tile by its own row end", () => {
  // Weights ends the resized tile's row but stops above Series, which sits lower in its band.
  const items = [
    {left: 0, top: 0, width: 400, height: 140},
    {left: 400, top: 0, width: 400, height: 300},
    {left: 800, top: 0, width: 200, height: 300},
    {left: 0, top: 140, width: 200, height: 300},
    {left: 200, top: 300, width: 400, height: 100},
  ]
  const plan = planRowResize(items, 3, 1000)
  assert.equal(plan.limit, 400)
  assert.deepEqual(plan.pushed.map(p => [p.index, p.limit]), [[4, 1000]])
  assert.equal(plan.fill, 400)
  assert.equal(plan.end, 400)
  assert.deepEqual(resolveRowResize(plan, 450, 0).moving, [3])
})

test("resolveRowResize moves the resized tile itself when it alone exceeds the row", () => {
  const plan = planRowResize(ROW, 2, 1280)
  assert.equal(plan.fill, 1280 - 768)
  assert.deepEqual(resolveRowResize(plan, 600, 56).moving, [2])
})

test("resolveRowResize moves every pushed tile from the first that no longer fits", () => {
  const items = [
    {left: 0, top: 0, width: 300, height: 100},
    {left: 300, top: 0, width: 300, height: 100},
    {left: 600, top: 0, width: 300, height: 100},
  ]
  const plan = planRowResize(items, 0, 1000)
  assert.equal(plan.fill, 400)
  assert.deepEqual(resolveRowResize(plan, 500, 56).moving, [2])
  assert.deepEqual(resolveRowResize(plan, 800, 56).moving, [1, 2])
})

test("snapEdge treats the row fill as the strongest target", () => {
  const fill = 900
  // Within tolerance past the fill the edge always lands on it, even next to another target.
  assert.equal(snapEdge(940, [950, 1270], {range: 50, fill, tolerance: 56}), fill)
  // Below the fill it competes on distance with targets that do not overflow.
  assert.equal(snapEdge(870, [860, 1270], {range: 50, fill, tolerance: 56}), 860)
  assert.equal(snapEdge(880, [860], {range: 50, fill, tolerance: 56}), fill)
  // Past the tolerance only targets beyond it apply.
  assert.equal(snapEdge(990, [950, 1000], {range: 50, fill, tolerance: 56}), 1000)
  assert.equal(snapEdge(1100, [950], {range: 50, fill, tolerance: 56}), undefined)
  assert.equal(snapEdge(1100, [1120, 1090], {range: 50}), 1090)
})
