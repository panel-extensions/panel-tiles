import assert from "node:assert/strict"
import {test} from "node:test"

import {
  FIT_SLACK_PCT, SWAP_THRESHOLD, allocateColumns, balancedPartition, bandWidth, dragProbe, dropTarget, generateLayout, moveIndex,
  packLayout, packRows, planRowResize, planRowSplit, resolveLayout, resolveRowResize, resolveRowSplit, snapEdge, widthPercent,
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

test("bandWidth keeps a forced band's width inside the band", () => {
  const xs = {label: "xs", max: 768}
  const sm = {label: "sm", min: 768, max: 1200}
  const md = {label: "md", min: 1200}
  assert.equal(bandWidth(900, null, 1400), 900)
  assert.equal(bandWidth(900, sm, 1400), 900)
  // The base band falls back to the reference width, which lies inside it.
  assert.equal(bandWidth(900, md, 1400), 1400)
  assert.equal(bandWidth(900, md), 1200)
  assert.equal(bandWidth(600, sm, 1400), 768)
  assert.equal(bandWidth(1200, sm, 1400), 1199)
  assert.equal(bandWidth(768, xs, 1000), 767)
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

function boxes(...specs) {
  return specs.map(([width, height]) => ({width, height}))
}

function positions(rects) {
  return rects.map(r => [r.x, r.y])
}

test("packRows starts each row at the bottom of the tallest tile in the previous one", () => {
  const {rects, rows, height} = packRows(boxes([40, 100], [40, 300], [40, 250], [60, 120]), 100)
  assert.deepEqual(positions(rects), [[0, 0], [40, 0], [0, 300], [40, 300]])
  assert.deepEqual(rows, [{top: 0, bottom: 300, items: [0, 1]}, {top: 300, bottom: 550, items: [2, 3]}])
  assert.equal(height, 550)
})

test("packRows never backfills an earlier row", () => {
  // Masonry puts the last tile into the gap under the first one.
  const entries = boxes([50, 100], [50, 300], [100, 100], [50, 100])
  const masonry = packLayout(entries.map((e, key) => ({key, ...e})))
  assert.deepEqual([masonry[3].x, masonry[3].y], [0, 100])
  const {rects} = packRows(entries, 100)
  assert.deepEqual(positions(rects), [[0, 0], [50, 0], [0, 300], [0, 400]])
})

test("packRows stacks shorter tiles in a hole within the row", () => {
  const {rects, rows} = packRows(boxes([66.6667, 400], [33.3333, 200], [33.3333, 200], [100, 100]), 100)
  assert.deepEqual(positions(rects), [[0, 0], [66.6667, 0], [66.6667, 200], [0, 400]])
  assert.deepEqual(rows.map(r => r.items), [[0, 1, 2], [3]])
})

test("packRows wraps a tile too tall for the hole", () => {
  const {rects} = packRows(boxes([50, 300], [50, 100], [50, 250]), 100)
  assert.deepEqual(positions(rects), [[0, 0], [50, 0], [0, 300]])
})

test("packRows closes the top line once a tile drops into a hole", () => {
  const {rects, rows} = packRows(boxes([40, 100], [40, 300], [40, 100], [20, 50], [20, 100]), 100)
  // The 20% tiles would fit on the top line but stay after the stacked tile in reading order.
  assert.deepEqual(positions(rects), [[0, 0], [40, 0], [0, 100], [0, 200], [20, 200]])
  assert.deepEqual(rows.map(r => r.items), [[0, 1, 2, 3, 4]])
})

test("packRows grows a row while later tiles still fit its top line", () => {
  const {rects, rows} = packRows(boxes([40, 100], [40, 100], [20, 300], [40, 100]), 100)
  assert.deepEqual(positions(rects), [[0, 0], [40, 0], [80, 0], [0, 100]])
  assert.deepEqual(rows.map(r => [r.top, r.bottom]), [[0, 300]])
})

test("packRows works in pixels with fractional widths and clamps oversized tiles", () => {
  const width = 1000.5
  const third = width / 3
  const {rects} = packRows(boxes([third, 100], [third, 100], [third, 100], [2000, 50]), width)
  assert.deepEqual(rects.map(r => r.y), [0, 0, 0, 100])
  assert.equal(rects[3].w, width)
})

test("packRows of nothing has no rows", () => {
  assert.deepEqual(packRows([], 100), {rects: [], rows: [], height: 0})
})

test("generateLayout can derive wrapped layouts from row packing", () => {
  const layout = tiles([50, 100], [50, 300], [100, 100], [50, 100])
  const result = generate(layout, 500, {packing: "rows"})
  assert.equal(result.changed, true)
  assert.deepEqual(order(result.layout), [0, 1, 2, 3])
})

// Chart 0 (66%, tall), KPIs 1 and 2 stacked beside it, then 3 and 4 in a second row.
const DROP = packRows(boxes([66, 400], [34, 200], [34, 200], [50, 100], [50, 100]), 100)

test("dropTarget uses the horizontal midpoint of the tile under the pointer", () => {
  const {rows, rects} = DROP
  assert.deepEqual(dropTarget(rows, rects, 4, 10, 450), {ref: 3, side: "before"})
  assert.deepEqual(dropTarget(rows, rects, 0, 40, 450), {ref: 3, side: "after"})
  assert.deepEqual(dropTarget(rows, rects, 3, 90, 450), {ref: 4, side: "after"})
})

test("dropTarget targets stacked tiles inside a row band", () => {
  const {rows, rects} = DROP
  assert.deepEqual(dropTarget(rows, rects, 4, 70, 300), {ref: 2, side: "before"})
  assert.deepEqual(dropTarget(rows, rects, 4, 95, 100), {ref: 1, side: "after"})
})

test("dropTarget places the tile at the end of a row right of its tiles", () => {
  const {rows, rects} = packRows(boxes([30, 100], [30, 200], [100, 100]), 100)
  assert.deepEqual(dropTarget(rows, rects, 2, 90, 50), {ref: 1, side: "after"})
  assert.deepEqual(dropTarget(rows, rects, 0, 90, 150), {ref: 1, side: "after"})
})

test("dropTarget goes after the tile above a hole", () => {
  const {rows, rects} = packRows(boxes([30, 100], [30, 300], [100, 100]), 100)
  assert.deepEqual(dropTarget(rows, rects, 2, 15, 200), {ref: 0, side: "after"})
})

test("dropTarget below every row moves the tile to the end", () => {
  const {rows, rects} = DROP
  assert.deepEqual(dropTarget(rows, rects, 0, 10, 500), {end: true})
  assert.deepEqual(dropTarget(rows, rects, 0, 10, 5000), {end: true})
})

test("dropTarget keeps a tile alone in its row where it is", () => {
  const {rows, rects} = packRows(boxes([50, 100], [100, 100]), 100)
  assert.equal(dropTarget(rows, rects, 1, 50, 150), null)
})

test("dropTarget over the dragged tile's own slot keeps its index", () => {
  const {rows, rects} = packRows(boxes([30, 100], [30, 100], [30, 100]), 100)
  const target = dropTarget(rows, rects, 1, 45, 50)
  assert.deepEqual(target, {ref: 2, side: "before"})
  assert.equal(moveIndex(1, target.ref, target.side), 1)
})

test("moveIndex converts before and after into Muuri move indices", () => {
  assert.equal(moveIndex(0, 3, "before"), 2)
  assert.equal(moveIndex(0, 3, "after"), 3)
  assert.equal(moveIndex(4, 1, "before"), 1)
  assert.equal(moveIndex(4, 1, "after"), 2)
})

test("dropTarget passes a tile once a horizontal drag reaches the swap threshold into it", () => {
  const {rows, rects} = packRows(boxes([20, 100], [40, 100], [40, 100]), 100)
  const into = 20 + 40 * SWAP_THRESHOLD
  assert.deepEqual(dropTarget(rows, rects, 0, into + 1, 50, 1), {ref: 1, side: "after"})
  assert.deepEqual(dropTarget(rows, rects, 0, into - 1, 50, 1), {ref: 1, side: "before"})
  const back = 60 - 40 * SWAP_THRESHOLD
  assert.deepEqual(dropTarget(rows, rects, 2, back - 1, 50, -1), {ref: 1, side: "before"})
  assert.deepEqual(dropTarget(rows, rects, 2, back + 1, 50, -1), {ref: 1, side: "after"})
})

// A wide tile 0 beside a narrow one, and a second row below.
const PROBE = packRows(boxes([75, 300], [25, 100], [50, 100], [50, 100]), 100)

test("dragProbe follows the pointer until the drag has a direction", () => {
  const rect = {x: 5, y: 10, w: 75, h: 300}
  assert.deepEqual(dragProbe(PROBE.rows, rect, {x: 6, y: 11}, {x: 0, y: 0}), {x: 6, y: 11, lead: 0})
})

test("dragProbe uses the edge leading a horizontal drag", () => {
  const rect = {x: 5, y: 0, w: 75, h: 300}
  assert.deepEqual(dragProbe(PROBE.rows, rect, {x: 6, y: 1}, {x: 1, y: 0}), {x: 79, y: 1, lead: 1})
  assert.deepEqual(dragProbe(PROBE.rows, rect, {x: 6, y: 1}, {x: -1, y: 0}), {x: 6, y: 1, lead: -1})
  // Ten units to the right, the wide tile's edge reaches past the narrow tile's threshold.
  const {x, y, lead} = dragProbe(PROBE.rows, {...rect, x: 10}, {x: 11, y: 1}, {x: 1, y: 0}, {rects: PROBE.rects, dragged: 0, width: 100})
  assert.ok(x > 75 + 25 * SWAP_THRESHOLD)
  assert.deepEqual(dropTarget(PROBE.rows, PROBE.rects, 0, x, y, lead), {ref: 1, side: "after"})
})

test("dragProbe places a tile that can't share a row by the pointer", () => {
  // A full-width tile in the second row dragged up and right: its right edge is beyond the first row.
  const {rows, rects} = packRows(boxes([25, 100], [25, 100], [25, 100], [100, 100]), 100)
  const rect = {x: 10, y: 20, w: 100, h: 100}
  const probe = dragProbe(rows, rect, {x: 11, y: 21}, {x: 1, y: -1}, {rects, dragged: 3, width: 100})
  assert.deepEqual(probe, {x: 11, y: 21, lead: 0})
  assert.deepEqual(dropTarget(rows, rects, 3, probe.x, probe.y, probe.lead), {ref: 0, side: "before"})
  // A wide tile that still fits beside the narrowest one keeps its leading edge.
  const wide = packRows(boxes([75, 100], [25, 100]), 100)
  assert.equal(dragProbe(wide.rows, {x: 5, y: 0, w: 75, h: 100}, {x: 6, y: 1}, {x: 1, y: 0}, {rects: wide.rects, dragged: 0, width: 100}).lead, 1)
})

test("dragProbe moves a tall tile into the next row once its bottom reaches into it", () => {
  const reach = 300 + 100 * SWAP_THRESHOLD
  const short = {x: 0, y: reach - 301, w: 75, h: 300}
  assert.equal(dragProbe(PROBE.rows, short, {x: 1, y: 1}, {x: 0, y: 1}).y, 1)
  const past = {x: 0, y: reach - 299, w: 75, h: 300}
  assert.deepEqual(dragProbe(PROBE.rows, past, {x: 1, y: 2}, {x: 0, y: 1}), {x: 1, y: 301, lead: 0})
})

test("dragProbe moves a tile up once its top reaches into the previous row", () => {
  const {rows} = packRows(boxes([60, 300], [40, 100], [60, 100]), 100)
  const reach = 300 - 300 * SWAP_THRESHOLD
  // The pointer is still below the first row, but the top edge has not reached far enough into it.
  assert.equal(dragProbe(rows, {x: 0, y: reach + 1, w: 60, h: 100}, {x: 1, y: 310}, {x: 0, y: -1}).y, 310)
  assert.equal(dragProbe(rows, {x: 0, y: reach - 1, w: 60, h: 100}, {x: 1, y: 310}, {x: 0, y: -1}).y, 1)
})

// Two tiles filling a 1000px row, with a third on the next row.
const FULL_ROW = [
  {left: 0, top: 0, width: 600, height: 200},
  {left: 600, top: 0, width: 400, height: 200},
  {left: 0, top: 200, width: 1000, height: 100},
]

test("planRowSplit finds the tile flush against the resized one", () => {
  const plan = planRowSplit(planRowResize(FULL_ROW, 0, 1000), FULL_ROW, [120, 120, 120])
  assert.deepEqual(plan.split.neighbors, [{index: 1, width: 400, min: 120, max: Infinity}])
  assert.equal(plan.split.full, true)
  assert.equal(plan.split.min, 120)
  assert.equal(plan.split.max, 880)
})

test("planRowSplit leaves the last tile in a row without a split", () => {
  assert.equal(planRowSplit(planRowResize(FULL_ROW, 1, 1000), FULL_ROW).split, null)
  assert.equal(planRowSplit(planRowResize(ROW, 2, 1280), ROW).split, null)
})

test("resolveRowSplit moves the boundary of a full row both ways", () => {
  const plan = planRowSplit(planRowResize(FULL_ROW, 0, 1000), FULL_ROW, [120, 120, 120])
  assert.equal(resolveRowSplit(plan, 600).state, "fill")
  assert.deepEqual(resolveRowSplit(plan, 700), {state: "split", width: 700, final: 700, moving: [], shift: 100, neighbors: [{index: 1, width: 300}]})
  assert.deepEqual(resolveRowSplit(plan, 450).neighbors, [{index: 1, width: 550}])
  // Held where the neighbour reaches its minimum.
  assert.deepEqual(resolveRowSplit(plan, 990).neighbors, [{index: 1, width: 120}])
  assert.equal(resolveRowSplit(plan, 50).width, 120)
})

test("resolveRowSplit respects the neighbour's maximum when the tile narrows", () => {
  const plan = planRowSplit(planRowResize(FULL_ROW, 0, 1000), FULL_ROW, [120, 120, 120], [Infinity, 500, Infinity])
  assert.equal(resolveRowSplit(plan, 300).width, 500)
  assert.deepEqual(resolveRowSplit(plan, 300).neighbors, [{index: 1, width: 500}])
})

test("resolveRowSplit grows into spare room before shrinking the neighbour", () => {
  const plan = planRowSplit(planRowResize(ROW, 1, 1280), ROW, [120, 120, 120, 120])
  assert.equal(plan.split.full, false)
  assert.deepEqual(plan.split.neighbors.map(n => n.index), [2])
  assert.deepEqual(resolveRowSplit(plan, 300), {state: "free", width: 300, final: 300, moving: [], shift: 0, neighbors: [{index: 2, width: 320}]})
  assert.equal(resolveRowSplit(plan, plan.fill).state, "fill")
  assert.deepEqual(resolveRowSplit(plan, plan.fill + 50).neighbors, [{index: 2, width: 270}])
  assert.equal(resolveRowSplit(plan, 2000).width, plan.fill + 200)
})

test("resolveRowSplit shrinks tiles stacked beside the resized one together", () => {
  const plan = planRowSplit(planRowResize(STACKED, 0, 1000), STACKED, [120, 120, 120, 120])
  assert.deepEqual(plan.split.neighbors.map(n => n.index), [1, 3])
  assert.deepEqual(resolveRowSplit(plan, plan.fill + 60).neighbors, [{index: 1, width: 240}, {index: 3, width: 240}])
})
