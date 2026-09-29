import assert from "node:assert/strict"
import {test} from "node:test"

import {
  allocateColumns, balancedPartition, generateLayout, packLayout, resolveLayout,
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
