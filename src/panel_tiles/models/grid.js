// @ts-check
import Muuri from "https://esm.sh/muuri@0.9.5"
import interact from "https://esm.sh/interactjs@1.10.27"

import {
  DEFAULT_REFERENCE_WIDTH, bandWidth, dragProbe, dropTarget, fitRows, moveIndex, packRows, planRowResize, planRowSplit,
  resolveLayout, resolveRowResize, resolveRowSplit, snapEdge, widthPercent,
} from "./responsive.js"

function getLSKey(name) {
  return `${window.location.origin + window.location.pathname}::${name || "default"}`
}

function getBreakpointBands(breakpoints) {
  if (!breakpoints || !breakpoints.length) { return [] }
  const sorted = [...breakpoints].sort((a, b) => a - b)
  const names = ["xs", "sm", "md", "lg", "xl", "xxl"]
  const bands = []
  for (let i = 0; i <= sorted.length; i++) {
    const label = names[i] || `bp${i}`
    if (i === 0) { bands.push({label, max: sorted[0]}) } else if (i === sorted.length) { bands.push({label, min: sorted[i - 1]}) } else { bands.push({label, min: sorted[i - 1], max: sorted[i]}) }
  }
  return bands
}

function getBandForWidth(breakpoints, width) {
  const bands = getBreakpointBands(breakpoints)
  if (!bands.length) { return null }
  for (const band of bands) {
    if (band.max && width < band.max) { return band }
  }
  return bands[bands.length - 1]
}

function saveToLS(name, value) {
  if (!window.localStorage) { return }
  window.localStorage.setItem(getLSKey(name), JSON.stringify(value))
}

function getFromLS(name) {
  if (!window.localStorage) { return null }
  try {
    return JSON.parse(window.localStorage.getItem(getLSKey(name)))
  } catch { return null }
}

function exportLayout(grid, modelIds) {
  const layout = new Array(modelIds.length)
  const items = grid.getItems()
  for (let visualIdx = 0; visualIdx < items.length; visualIdx++) {
    const item = items[visualIdx]
    const el = item.getElement()
    const dataId = el.getAttribute("data-id")
    const modelIdx = modelIds.indexOf(dataId)
    if (modelIdx === -1) { continue }
    let height = el.style.height.slice(0, -2)
    if (!height) {
      const {top, bottom} = item.getMargin()
      height = item.getHeight() - top - bottom
    } else {
      height = parseFloat(height)
    }
    const width = parseFloat(el.getAttribute("data-width")) || 100
    // A hide applies with the next layout, which the default packer computes asynchronously.
    layout[modelIdx] = {
      index: visualIdx, width, height, visible: item.isActive()
    }
  }
  return layout.filter(Boolean)
}

// Tile percentages resolve against the fractional width, which clientWidth rounds.
function gridWidth(grid) {
  const el = grid.getElement()
  const style = getComputedStyle(el)
  return el.getBoundingClientRect().width - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0)
}

function setAuthoredWidth(el, width) {
  width = Math.min(100, Math.max(width, 1))
  el.setAttribute("data-width", width.toString())
  el.removeAttribute("data-fit-width")
}

function clampWidthForItem(grid, el, width) {
  const containerWidth = gridWidth(grid)
  if (containerWidth > 0) {
    const itemMin = parseFloat(el.getAttribute("data-min-width")) || 0
    if (itemMin > 0) {
      const minPct = (itemMin / containerWidth) * 100
      if (width < minPct) { width = Math.min(100, minPct) }
    }
    const itemMax = parseFloat(el.getAttribute("data-max-width")) || 0
    if (itemMax > 0) {
      const maxPct = (itemMax / containerWidth) * 100
      if (width > maxPct) { width = maxPct }
    }
  }
  return width
}

// A width fitted to the tile's row (see `fitRows`) replaces raising the tile
// to its minimum on its own, which would push the row past the container.
function applyDisplayWidth(grid, el, minColWidth) {
  const containerWidth = gridWidth(grid)
  const fitted = parseFloat(el.getAttribute("data-fit-width"))
  let display = fitted || parseFloat(el.getAttribute("data-width")) || 100
  if (containerWidth > 0) {
    const itemMin = parseFloat(el.getAttribute("data-min-width")) || 0
    const effectiveMin = Math.max(minColWidth || 0, itemMin)
    if (effectiveMin > 0 && !fitted) {
      const minPct = (effectiveMin / containerWidth) * 100
      if (display < minPct) { display = Math.min(100, minPct) }
    }
    const itemMax = parseFloat(el.getAttribute("data-max-width")) || 0
    if (itemMax > 0) {
      const maxPct = (itemMax / containerWidth) * 100
      if (display > maxPct) { display = maxPct }
    }
  }
  const width = `calc(${display}% - 20px)`
  if (el.style.width === width) { return false }
  el.style.width = width
  return true
}

// A layout entry may leave out a tile's width or height; the tile then keeps
// the size measured from its content. Clearing the height instead would leave
// it to CSS, and content that stretches to its tile collapses at auto height.
function resizeToSpec(grid, el, spec, minColWidth) {
  const autoWidth = parseFloat(el.getAttribute("data-auto-width")) || 100
  const autoHeight = parseFloat(el.getAttribute("data-auto-height")) || null
  resizeItem(grid, el, spec?.width ?? autoWidth, spec?.height ?? autoHeight, minColWidth, false)
}

function resizeItem(grid, el, width, height, minColWidth, notify=true) {
  setAuthoredWidth(el, width)
  applyDisplayWidth(grid, el, minColWidth)
  if (height == null) { el.style.height = "" } else { el.style.height = `${height}px` }
  if (notify) { grid.refreshItems(); grid.layout() }
}

function restoreFit(el, fit) {
  if (fit != null) { el.setAttribute("data-fit-width", fit) }
}

function parsePixelValue(value) {
  const match = /^([\d.]+)px$/.exec((value || "").trim())
  return match ? parseFloat(match[1]) : null
}

function getExplicitPixelWidth(el) {
  let width = parsePixelValue(el.style.width)
  for (const child of el.querySelectorAll("*")) {
    width = Math.max(width || 0, parsePixelValue(child.style.width) || 0)
  }
  return width || null
}

function getExplicitPixelHeight(el) {
  let height = parsePixelValue(el.style.height)
  for (const child of el.querySelectorAll("*")) {
    height = Math.max(height || 0, parsePixelValue(child.style.height) || 0)
  }
  return height || null
}

function getHorizontalMargin(child_model) {
  const m = child_model?.margin
  if (m == null) { return 0 }
  if (typeof m === "number") { return m * 2 }
  if (Array.isArray(m)) {
    if (m.length === 2) { return (m[1] || 0) * 2 }
    if (m.length >= 4) { return (m[1] || 0) + (m[3] || 0) }
  }
  return 0
}

function getInitialWidth(model, container, child_el, child_model, item_el) {
  const screenWidth = model.width || container.clientWidth || container.getBoundingClientRect().width
  if (!screenWidth) { return 100 }

  const configured = child_model?.width
  let child_width
  if (configured != null) {
    child_width = configured + getHorizontalMargin(child_model)
  } else {
    child_width = getExplicitPixelWidth(child_el)
    if (!child_width && item_el) {
      child_width = child_el.getBoundingClientRect().width || child_el.scrollWidth
    }
  }

  if (!child_width) { return 100 }
  return Math.max(((child_width + 45) / screenWidth) * 100, (100/screenWidth) * 100)
}

function getInitialHeight(child_el, child_model, item_el) {
  const configured_height = child_model?.height
  if (configured_height != null && Number.isFinite(configured_height) && configured_height > 0) {
    return configured_height + 20
  }
  const explicit = getExplicitPixelHeight(child_el)
  if (explicit) { return explicit }
  if (item_el) {
    const item_height = item_el.scrollHeight || item_el.clientHeight
    return item_height ? (item_height + 20) : null
  }
  const child_height = (
    child_el.getBoundingClientRect().height ||
      child_el.clientHeight ||
      child_el.scrollHeight
  )
  return child_height ? child_height + 20 : null
}

// The tiles' own views, not `view.root.ready`: the root's promise chains
// every pending render on the page, and a single one that never settles
// (e.g. a view removed mid-render elsewhere in the app) would keep the grid
// from ever showing its tiles.
function childrenReady(view) {
  const promises = []
  const collect = (v) => {
    promises.push(v.ready)
    for (const child of v.child_views ?? []) { collect(child) }
  }
  for (const child of view.child_views ?? []) { collect(child) }
  return Promise.all(promises)
}

const SNAP_RANGE = 50
// interact's `restrictSize` minimum for a tile's border box.
const MIN_TILE_WIDTH = 100
const RESIZE_NOTIFY_MS = 100

function outerSize(item) {
  const m = item.getMargin()
  return {width: item.getWidth() + m.left + m.right, height: item.getHeight() + m.top + m.bottom}
}

/** Muuri `layout` option placing items with `packRows`; `onRows` receives the rows with their items. */
function rowLayout(onRows) {
  return (grid, id, items, width, height, callback) => {
    const {rects, rows, height: total} = packRows(items.map(outerSize), width)
    onRows({rows, rects, items})
    const borders = grid._boxSizing === "border-box" ? grid._borderTop + grid._borderBottom : 0
    callback({id, items, slots: rects.flatMap(r => [r.x, r.y]), styles: {height: `${total + borders}px`}})
  }
}

/** Nearest grid line of `step` from `origin` to `x`, offset by `offset`. */
function nearestStep(x, origin, step, offset, max = Infinity) {
  const n = Math.max(1, Math.round((x + offset - origin) / step))
  return Math.min(max, origin + n * step) - offset
}

function scrollTargets(el) {
  const targets = [{element: window, priority: 0}]
  let node = el.parentNode
  while (node && node !== document.body && node !== document.documentElement && node !== document) {
    if (node instanceof ShadowRoot) { node = node.host; continue }
    if (node instanceof Element) {
      const style = getComputedStyle(node)
      if (/auto|scroll|overlay/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        targets.push({element: node, priority: 1})
        break
      }
    }
    node = node.parentNode
  }
  return targets
}

function make_editable(model, container, grid, state, onCommit, onSelect) {
  const undo_stack = []
  let resizeStart = null
  // A press on a resize handle, tracked from raw pointer events: interact
  // reports snapped coordinates and fires no move while the snapped size is
  // unchanged, as when a tile already filling its row is dragged past the end.
  let press = null
  let interaction = null
  const minColWidth = () => model.min_col_width || null
  const tolerance = () => model.overflow_tolerance ?? 0
  let notified = 0
  // Tile content follows window resizes; notifying on every pointer move re-lays out every plot in the tile.
  function notifyResize(force = false) {
    const now = performance.now()
    if (!force && now - notified < RESIZE_NOTIFY_MS) { return }
    notified = now
    window.dispatchEvent(new Event("resize"))
  }

  const marker = document.createElement("div")
  marker.className = "muuri-row-marker"
  const ghost = document.createElement("div")
  ghost.className = "muuri-resize-ghost"

  function rowPlan(el) {
    const items = grid.getItems().filter(item => item.isVisible())
    const index = items.findIndex(item => item.getElement() === el)
    if (index === -1) { return null }
    const boxes = items.map(item => {
      const {left, top} = item.getPosition()
      const m = item.getMargin()
      return {left, top, width: item.getWidth() + m.left + m.right, height: item.getHeight() + m.top + m.bottom}
    })
    let plan = planRowResize(boxes, index, gridWidth(grid))
    // A tile that already overflows its row has no remaining space to fill.
    if (plan.fill < boxes[index].width - 0.5) { return null }
    if (model.layout_mode === "rows" && model.row_resize === "split") {
      const mins = items.map(item => {
        const el = item.getElement()
        const m = item.getMargin()
        return Math.max(MIN_TILE_WIDTH + m.left + m.right, parseFloat(el.getAttribute("data-min-width")) || 0, minColWidth() || 0)
      })
      const maxes = items.map(item => parseFloat(item.getElement().getAttribute("data-max-width")) || Infinity)
      plan = planRowSplit(plan, boxes, mins, maxes)
    }
    const elements = items.map(item => item.getElement())
    const widths = elements.map(el => parseFloat(el.getAttribute("data-width")) || 100)
    const fits = elements.map(el => el.getAttribute("data-fit-width"))
    return {...plan, top: boxes[index].top, elements, widths, fits}
  }

  // The neighbours take the width the resized tile gives up or gains past its
  // base, in authored percentages so a full row stays exactly full.
  function applySplit(plan, decision, width) {
    const {split} = plan
    const base = split.full ? plan.widths[plan.index] : widthPercent(split.base, gridWidth(grid))
    // While an overflow is pending the neighbours stay at the width they were held at.
    const shift = decision.shift ? width - base : 0
    for (const {index} of split.neighbors) {
      const el = plan.elements[index]
      const pct = shift ? Math.floor((plan.widths[index] - shift) * 1e4) / 1e4 : plan.widths[index]
      setAuthoredWidth(el, pct)
      if (!shift) { restoreFit(el, plan.fits[index]) }
      applyDisplayWidth(grid, el, minColWidth())
    }
  }

  const resolvePlan = (plan, desired) => plan.split ? resolveRowSplit(plan, desired) : resolveRowResize(plan, desired, tolerance())

  function showResizeState(el, decision, height) {
    const {plan} = resizeStart
    const margin = grid.getItem(el).getMargin()
    container.dataset.resizeState = decision.state
    el.dataset.resizeState = decision.state
    for (const other of plan.elements) {
      other.classList.toggle("muuri-will-move", other !== el && decision.moving.includes(plan.elements.indexOf(other)))
    }
    el.classList.toggle("muuri-will-move", decision.moving.includes(plan.index))
    if (decision.state === "free") {
      marker.remove()
      ghost.remove()
      return
    }
    if (!marker.isConnected) { container.append(marker, ghost) }
    const top = `${plan.top + margin.top}px`
    const edge = decision.state === "split" ? plan.left + decision.width : plan.end
    marker.style.left = `${edge - margin.right / 2 - 1}px`
    marker.style.top = top
    marker.style.height = `${height}px`
    ghost.style.left = `${plan.left + margin.left}px`
    ghost.style.top = top
    ghost.style.width = `${decision.final - margin.left - margin.right}px`
    ghost.style.height = `${height}px`
  }

  function clearResizeState() {
    delete container.dataset.resizeState
    for (const item of container.querySelectorAll("[data-resize-state]")) { delete item.dataset.resizeState }
    for (const item of container.querySelectorAll(".muuri-will-move")) { item.classList.remove("muuri-will-move") }
    marker.remove()
    ghost.remove()
  }

  // Ends a resize without a release: the tile keeps and commits the size it
  // reached, without the pending row fill or overflow.
  function stopResize() {
    if (resizeStart) { resizeStart.decision = null }
    if (interaction?.interacting()) {
      interaction.end()
    } else if (resizeStart?.raw) {
      clearResizeState()
      resizeStart = null
    }
    press = null
  }

  function reset() {
    stopResize()
    clearResizeState()
    container.classList.remove("muuri-no-select")
  }

  function sync_layout() {
    // grid.move() emits "move" while a resolved layout is being applied.
    if (state.applying) { return }
    onCommit()
  }

  function onPointerDown(e) {
    const handle = e.composedPath().find(n => n.classList?.contains("muuri-handle") && n.classList.contains("resize"))
    const el = handle?.closest(".muuri-grid-item")
    if (!el || el.parentElement !== container) { return }
    const item = grid.getItem(el)
    const margin = item.getMargin()
    press = {
      el, pointerId: e.pointerId, x: e.clientX, moved: false, plan: rowPlan(el),
      border: el.getBoundingClientRect().width, outer: item.getWidth() + margin.left + margin.right,
    }
  }

  function onPointerMove(e) {
    if (!press || Math.abs(e.clientX - press.x) < 1) { return }
    press.moved = true
    const {el, plan} = press
    // Once the size changes interact's move handler takes over; a split never holds the size at the row end.
    if (!plan || plan.split || Math.abs(el.getBoundingClientRect().width - press.border) > 0.5) { return }
    const raw = press.outer + e.clientX - press.x
    const snapped = snapEdge(raw, [], {range: SNAP_RANGE, fill: plan.fill, tolerance: tolerance()})
    const decision = resolveRowResize(plan, snapped ?? raw, tolerance())
    if (decision.state !== "fill") { return }
    if (resizeStart?.el !== el) {
      resizeStart = {el, rectWidth: press.border, width: parseFloat(el.getAttribute("data-width")) || 100, plan, decision: null, raw: true}
    }
    resizeStart.decision = decision
    showResizeState(el, decision, el.getBoundingClientRect().height)
  }

  function onPointerUp() {
    if (resizeStart?.raw && !state.interacting) {
      clearResizeState()
      resizeStart = null
    }
    press = null
  }

  function onPointerLost(e) {
    if (press && e.pointerId === press.pointerId) { stopResize() }
  }

  const pointerListeners = {
    pointerdown: onPointerDown, pointermove: onPointerMove,
    pointerup: onPointerUp, pointercancel: onPointerLost, lostpointercapture: onPointerLost,
  }
  for (const [type, listener] of Object.entries(pointerListeners)) { window.addEventListener(type, listener, true) }
  // Scoped to this grid: a selector interactable is shared page-wide, so the
  // last grid rendered would otherwise handle every grid's resizes.
  const resizable = interact(".muuri-grid-item", {context: container})
  model.on("remove", () => {
    for (const [type, listener] of Object.entries(pointerListeners)) { window.removeEventListener(type, listener, true) }
    resizable.unset()
  })

  resizable.resizable({
    edges: {right: ".muuri-handle.resize", bottom: ".muuri-handle.resize"},
    listeners: {
      start(event) {
        state.interacting = true
        interaction = event.interaction
        const el = event.target
        onSelect(el)
        resizeStart = {
          el, rectWidth: event.rect.width, width: parseFloat(el.getAttribute("data-width")) || 100,
          fit: el.getAttribute("data-fit-width"), plan: press?.el === el ? press.plan : rowPlan(el), decision: null,
        }
        const item = grid.getItem(el);
        let height = el.style.height.slice(null, -2);
        if (!height) {
          const {top, bottom} = item.getMargin();
          height = item.getHeight()-top-bottom;
        } else {
          height = parseFloat(height);
        }
        const width = parseFloat(el.getAttribute("data-width")) || 100
        undo_stack.push({action: "resize", item, width, height})
      },
      move(ev) {
        container.classList.add("muuri-no-select")
        const item = grid.getItem(ev.target)
        const {left, right} = item.getMargin()
        const ours = resizeStart?.el === ev.target
        const h = ev.rect.height
        let outer = ev.rect.width + left + right
        // The pointer, not the snapped rect, tells a sideways drag from a height-only one:
        // a tile already filling its row snaps straight back to its own width.
        if (ours && resizeStart.plan && press?.el === ev.target && press.moved) {
          const decision = resolvePlan(resizeStart.plan, outer)
          resizeStart.decision = decision
          outer = decision.width
          showResizeState(ev.target, decision, h)
        }
        // ev.rect is the border box; a drag that ends at the starting width keeps the authored width exactly.
        const unchanged = ours && Math.abs(outer - left - right - resizeStart.rectWidth) < 0.5
        const w = unchanged ? resizeStart.width : clampWidthForItem(grid, ev.target, widthPercent(outer, gridWidth(grid)))
        ev.target.style.zIndex = 100
        if (unchanged) {
          // Back at its starting width, a tile fitted to its row keeps that fit, so the row stays together.
          setAuthoredWidth(ev.target, w)
          restoreFit(ev.target, resizeStart.fit)
          applyDisplayWidth(grid, ev.target, minColWidth())
          ev.target.style.height = `${h}px`
        } else {
          resizeItem(grid, ev.target, w, h, minColWidth(), false)
        }
        const split = ours && !!resizeStart.plan?.split
        if (split && resizeStart.decision) { applySplit(resizeStart.plan, resizeStart.decision, w) }
        // A neighbour's width applies at once, so an animated move would let its right edge swing in and back out.
        grid.refreshItems(); grid.layout(split)
        notifyResize()
      },
      end(ev) {
        state.interacting = false
        interaction = null
        const decision = resizeStart?.el === ev.target ? resizeStart.decision : null
        const plan = decision ? resizeStart.plan : null
        resizeStart = null
        clearResizeState()
        if (decision?.state === "overflow") {
          // Neighbours moving to the next row keep the widths they started with.
          if (plan.split) { applySplit(plan, {shift: 0}, 0) }
          setAuthoredWidth(ev.target, clampWidthForItem(grid, ev.target, widthPercent(decision.final, gridWidth(grid))))
          applyDisplayWidth(grid, ev.target, minColWidth())
        }
        container.classList.remove("muuri-no-select")
        ev.target.style.removeProperty("z-index")
        grid.refreshItems(); grid.layout()
        sync_layout()
        notifyResize(true)
      }
    },
    modifiers: [
      interact.modifiers.restrictSize({
        min: {width: MIN_TILE_WIDTH, height: 50}
      }),
      interact.modifiers.snapEdges({
        offset: "parent",
        targets: [
          function(x, y, interaction) {
            const resized = grid.getItem(interaction.element)
            if (!resized) { return {} }
            const gridBox = grid.getElement().getBoundingClientRect()
            const margin = resized.getMargin()
            const plan = resizeStart?.el === interaction.element ? resizeStart.plan : null
            // Targets are border-box edges that put the outer edges flush.
            const xs = [gridWidth(grid) - margin.right]
            const ys = []
            for (const item of grid.getItems()) {
              const el = item.getElement()
              if (el === interaction.element || !item.isVisible()) { continue }
              const box = el.getBoundingClientRect()
              const itemMargin = item.getMargin()
              xs.push(box.right - gridBox.left + itemMargin.right - margin.right)
              ys.push(box.bottom - gridBox.top + itemMargin.bottom - margin.bottom)
            }
            // Filling the row's remaining space is the strongest horizontal target,
            // unless the row is split: then it is an ordinary target, and none in a full row.
            let fill = plan ? plan.left + plan.fill - margin.right : null
            if (plan?.split) {
              if (!plan.split.full) { xs.push(fill) }
              // Reaching the row end takes the whole row.
              xs.push(plan.limit - margin.right)
              fill = null
            }
            const {top} = resized.getPosition()
            const width = gridWidth(grid)
            const columns = model.columns > 0 ? width / model.columns : null
            const rowHeight = model.row_height > 0 ? model.row_height : null
            if (columns) {
              for (let k = 1; k <= model.columns; k++) { xs.push(k * columns - margin.right) }
            }
            if (rowHeight) {
              for (let k = 1; top + k * rowHeight - margin.bottom < y + SNAP_RANGE; k++) { ys.push(top + k * rowHeight - margin.bottom) }
            }
            let sx = snapEdge(x, xs, {range: SNAP_RANGE, fill, tolerance: tolerance()})
            let sy = snapEdge(y, ys, {range: SNAP_RANGE})
            // Columns and rows hold the edge on a grid line even out of snapping range.
            if (sx === undefined && columns) { sx = nearestStep(x, 0, columns, margin.right, width) }
            if (sy === undefined && rowHeight) { sy = nearestStep(y, top, rowHeight, margin.bottom) }
            // Each axis is range-checked here, so interact must not apply its own radial range.
            return {x: sx, y: sy, range: Infinity}
          }
        ]
      })
    ]
  })

  // Committing on "move" would send a layout for every slot a tile passes through mid-drag.
  grid
    .on("dragInit", () => container.classList.remove("muuri-no-select"))
    .on("dragStart", item => onSelect(item.getElement()))
    .on("dragEnd", () => {
      container.classList.remove("muuri-no-select")
      sync_layout()
    })
  return {sync: sync_layout, reset}
}

function createBreakpointToolbar(breakpoints, container, onSelect, onReset) {
  const bands = getBreakpointBands(breakpoints)
  if (!bands.length) { return null }

  const toolbar = document.createElement("div")
  toolbar.className = "muuri-breakpoint-toolbar"

  const chips = []
  for (const band of bands) {
    const chip = document.createElement("button")
    chip.className = "muuri-breakpoint-chip"
    chip.dataset.band = band.label
    let desc = band.label.toUpperCase()
    if (band.max && !band.min) { desc += ` <${band.max}px` } else if (band.min && !band.max) { desc += ` >${band.min}px` } else if (band.min && band.max) { desc += ` ${band.min}-${band.max}px` }
    chip.textContent = desc
    chip.addEventListener("click", () => onSelect(band.label))
    toolbar.appendChild(chip)
    chips.push(chip)
  }

  // "Full width" chip to exit constrained preview
  const fullChip = document.createElement("button")
  fullChip.className = "muuri-breakpoint-chip"
  fullChip.dataset.band = "__full__"
  fullChip.textContent = "AUTO"
  fullChip.addEventListener("click", () => onSelect(null))
  toolbar.appendChild(fullChip)
  chips.push(fullChip)

  const reset = document.createElement("button")
  reset.className = "muuri-breakpoint-reset"
  reset.textContent = "Reset"
  reset.title = "Discard the custom layout for this size and regenerate it"
  reset.style.display = "none"
  reset.addEventListener("click", () => onReset())
  toolbar.appendChild(reset)

  function setActive(label) {
    for (const c of chips) {
      c.classList.toggle("active", label === null ? c.dataset.band === "__full__" : c.dataset.band === label)
    }
  }

  function update({baseBand, overrides, source}) {
    for (const c of chips) {
      const band = c.dataset.band
      const isBase = band === baseBand
      const isCustom = !isBase && !!overrides?.[band]?.length
      c.classList.toggle("muuri-chip-base", isBase)
      c.classList.toggle("muuri-chip-custom", isCustom)
      if (band !== "__full__") {
        c.title = isBase ? "Authored layout" : isCustom ? "Custom layout" : "Generated from the authored layout"
      }
    }
    reset.style.display = source === "custom" ? "" : "none"
  }

  return {toolbar, setActive, update}
}

export async function render({model, el, view}) {
  const container = document.createElement("div")
  container.className = "muuri-grid"
  if (!model.card) { container.classList.add("muuri-no-card") }
  if (!model.editable) { container.classList.add("muuri-no-handles") }
  el.append(container)

  function applyElevation(level) {
    const root = getComputedStyle(document.documentElement)
    const shadow = root.getPropertyValue(`--mui-shadows-${level}`).trim()
    const overlay = root.getPropertyValue(`--mui-overlays-${level}`).trim()
    if (shadow) { container.style.setProperty("--tile-shadow", shadow) } else { container.style.removeProperty("--tile-shadow") }
    if (overlay) { container.style.setProperty("--tile-overlay", overlay) } else { container.style.removeProperty("--tile-overlay") }
  }
  applyElevation(model.elevation)
  model.on("elevation", () => applyElevation(model.elevation))
  model.on("card", () => container.classList.toggle("muuri-no-card", !model.card))

  let nextId = 0
  const ids = []
  const child_to_item = new Map()
  const model_id_to_item = new Map()
  // Items added while the grid was hidden, still to be sized from their content.
  const unsized = new Map()
  let last_children = []

  const rowsMode = () => model.layout_mode === "rows"
  let packed = null
  const layoutRows = rowLayout(result => { packed = result })

  // Direction of the drag per axis, only flipped after a clear move back so jitter can't swap the leading edge.
  const DIRECTION_SLACK = 6
  const MINOR_AXIS = 0.5
  let heading = null

  function startHeading(event) {
    return {x: 0, y: 0, ax: event.clientX, ay: event.clientY, sx: event.clientX, sy: event.clientY}
  }

  // An axis the drag barely moves along doesn't lead, so a tile dragged up
  // and slightly right is placed by the pointer, not by its far right edge.
  function updateHeading(event) {
    if (!heading) { heading = startHeading(event) }
    const dx = event.clientX - heading.ax
    const dy = event.clientY - heading.ay
    if (Math.abs(dx) > DIRECTION_SLACK) { heading.x = Math.sign(dx); heading.ax = event.clientX }
    if (Math.abs(dy) > DIRECTION_SLACK) { heading.y = Math.sign(dy); heading.ay = event.clientY }
    const tx = Math.abs(event.clientX - heading.sx)
    const ty = Math.abs(event.clientY - heading.sy)
    return {x: tx < ty * MINOR_AXIS ? 0 : heading.x, y: ty < tx * MINOR_AXIS ? 0 : heading.y}
  }

  function rowSortPredicate(item, event) {
    if (!packed || !event) { return null }
    const box = container.getBoundingClientRect()
    const style = getComputedStyle(container)
    const left = box.left + (parseFloat(style.borderLeftWidth) || 0)
    const top = box.top + (parseFloat(style.borderTopWidth) || 0)
    const el = item.getElement().getBoundingClientRect()
    const rect = {x: el.left - left, y: el.top - top, w: el.width, h: el.height}
    const pointer = {x: event.clientX - left, y: event.clientY - top}
    const dir = updateHeading(event)
    const dragged = packed.items.indexOf(item)
    const {x, y, lead} = dragProbe(packed.rows, rect, pointer, dir, {rects: packed.rects, dragged, width: gridWidth(grid)})
    // Below every tile is judged by the pointer, so a tall tile in the last row doesn't jump to the end.
    const below = packed.rows.length && pointer.y >= packed.rows[packed.rows.length - 1].bottom
    const target = dropTarget(packed.rows, packed.rects, dragged, x, below ? pointer.y : y, lead)
    if (!target) { return null }
    const all = grid.getItems()
    const current = all.indexOf(item)
    const index = target.end ? all.length - 1 : moveIndex(current, all.indexOf(packed.items[target.ref]), target.side)
    return {index, action: "move"}
  }

  const grid = new Muuri(container, {
    dragEnabled: !!model.editable,
    dragHandle: ".muuri-handle.drag",
    layout: (...args) => {
      if (rowsMode()) { return layoutRows(...args) }
      packed = null
      Muuri.defaultPacker.setOptions({fillGaps: model.fill_gaps})
      return Muuri.defaultPacker.createLayout(...args)
    },
    // The ResizeObserver below lays the grid out when its width changes.
    layoutOnResize: false,
    dragSortPredicate: (item, event) => (
      rowsMode() ? rowSortPredicate(item, event) : Muuri.ItemDrag.defaultSortPredicate(item, {threshold: 50, action: "move"})
    ),
    // The pointer predicate is stable, so the default bounce-back guard would only block valid moves back.
    dragSortHeuristics: {minBounceBackAngle: rowsMode() ? 0 : 1},
    dragPlaceholder: {
      enabled: true,
      createElement: () => {
        const el = document.createElement("div")
        el.className = "muuri-drag-placeholder"
        return el
      },
    },
    dragAutoScroll: {
      targets: () => scrollTargets(container),
      handle: Muuri.AutoScroller.pointerHandle(40),
      sortDuringScroll: true,
    },
    sortData: {
      id: (_, el) => {
        const index = ids.indexOf(el.getAttribute("data-id"))
        return index === -1 ? Infinity : index
      }
    }
  })

  const minColWidth = () => model.min_col_width || null

  // Fits tile widths to their rows at the current container width and
  // returns whether any tile's displayed width changed.
  function fitDisplayWidths() {
    const items = grid.getItems()
    const width = gridWidth(grid)
    if (!items.length || !(width > 0)) { return false }
    if (!state.interacting) {
      const layout = exportLayout(grid, ids)
      const minWidths = []
      for (let i = 0; i < ids.length; i++) {
        const itemEl = itemElement(i)
        const min = Math.max(model.min_col_width || 0, parseFloat(itemEl?.getAttribute("data-min-width")) || 0)
        minWidths[i] = (min / width) * 100
      }
      const fitted = fitRows(layout, {minWidths, packing: model.layout_mode})
      for (let i = 0; i < ids.length; i++) {
        const itemEl = itemElement(i)
        if (!itemEl) { continue }
        if (fitted?.[i] == null) {
          itemEl.removeAttribute("data-fit-width")
        } else {
          itemEl.setAttribute("data-fit-width", fitted[i].toString())
        }
      }
    }
    let changed = false
    for (const item of items) {
      changed = applyDisplayWidth(grid, item.getElement(), minColWidth()) || changed
    }
    return changed
  }

  function reclampAll() {
    if (fitDisplayWidths()) {
      grid.refreshItems()
      grid.layout()
    }
  }

  const flags = {layout_from_client: false, responsive_from_client: false}
  const state = {applying: false, interacting: false}
  let activeBreakpoint = null
  let toolbarUI = null
  let displayed = {band: null, source: "base", sig: null}

  function referenceWidth() {
    if (model.reference_width) { return model.reference_width }
    // Legacy layouts carry no reference width; assume they were authored on a large screen.
    return model.breakpoints?.length ? Math.max(...model.breakpoints) : DEFAULT_REFERENCE_WIDTH
  }

  function baseBand() {
    return getBandForWidth(model.breakpoints, referenceWidth())?.label ?? null
  }

  function viewBand(width) {
    return activeBreakpoint ?? getBandForWidth(model.breakpoints, width)?.label ?? null
  }

  // A previewed band is laid out and edited at a width inside it, so an edit
  // to the base band keeps `reference_width` there however narrow the grid is.
  function layoutWidth() {
    const band = getBreakpointBands(model.breakpoints).find(b => b.label === activeBreakpoint)
    return bandWidth(container.clientWidth, band, referenceWidth())
  }

  function itemElement(i) {
    return container.querySelector(`[data-id="${ids[i]}"]`)
  }

  function measure() {
    const minWidths = []
    const heights = []
    for (let i = 0; i < ids.length; i++) {
      const itemEl = itemElement(i)
      minWidths[i] = Math.max(model.min_col_width || 0, parseFloat(itemEl?.getAttribute("data-min-width")) || 0)
      heights[i] = itemEl ? itemEl.getBoundingClientRect().height || null : null
    }
    return {minWidths, heights}
  }

  function resolveCurrent() {
    const width = layoutWidth()
    const band = viewBand(width)
    const resolved = resolveLayout({
      layout: model.layout,
      overrides: model.responsive_layouts,
      band,
      baseBand: baseBand(),
      width,
      referenceWidth: referenceWidth(),
      mode: model.responsive_mode,
      packing: model.layout_mode,
      shrink: model.wrap_shrink ?? 0.5,
      ...measure(),
    })
    return {...resolved, band}
  }

  function updateToolbar() {
    if (toolbarUI) {
      toolbarUI.update({baseBand: baseBand(), overrides: model.responsive_layouts, source: displayed.source})
    }
  }

  function refreshLayout(force = false) {
    if (!ids.length || state.interacting || !container.clientWidth) { return false }
    const resolved = resolveCurrent()
    const sig = JSON.stringify(resolved.layout)
    const changed = force || sig !== displayed.sig
    displayed = {band: resolved.band, source: resolved.source, sig}
    const apply = changed && !!resolved.layout?.length
    if (apply) { applyLayoutToGrid(resolved.layout) }
    updateToolbar()
    return apply
  }

  let resizeFrame = null
  let lastWidth = null
  let widthChanged = false
  const onResize = (resized = false) => {
    reclampAll()
    widthChanged = widthChanged || resized
    if (resizeFrame !== null) { return }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null
      const relayout = widthChanged
      widthChanged = false
      // Tile widths are percentages that follow the container, but Muuri keeps
      // the positions it computed at the old width until it lays out again.
      if (!refreshLayout() && relayout && !state.interacting && container.clientWidth) {
        grid.refreshItems()
        grid.layout(true)
      }
    })
  }
  // Only a change in the container's width forces a layout; interactions dispatch synthetic window resizes.
  const onWindowResize = () => onResize()
  window.addEventListener("resize", onWindowResize, true)
  // Width can change without a window resize, e.g. when a sidebar collapses.
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth
    if (width === lastWidth) { return }
    const shown = !lastWidth && width > 0
    lastWidth = width
    if (shown) { onShown() } else { onResize(true) }
  })
  observer.observe(container)
  model.on("remove", () => {
    window.removeEventListener("resize", onWindowResize, true)
    observer.disconnect()
  })
  // Anchored at the press, since a fast drag may reach its target by the first sort check.
  grid.on("dragStart", (_, event) => { heading = event ? startHeading(event) : null })
  model.on("min_col_width", () => { reclampAll(); refreshLayout() })
  model.on("layout_mode", () => {
    grid._settings.dragSortHeuristics.minBounceBackAngle = rowsMode() ? 0 : 1
    if (!refreshLayout()) { grid.layout() }
  })
  model.on("fill_gaps", () => grid.layout())
  model.on("wrap_shrink", () => refreshLayout())
  model.on("responsive_mode", () => refreshLayout())
  model.on("reference_width", () => {
    if (!flags.layout_from_client) { refreshLayout() }
  })
  model.on("responsive_layouts", () => {
    if (!flags.responsive_from_client) { refreshLayout() }
  })

  model.on("layout", async (_) => {
    if (flags.layout_from_client) { return }
    if (model.local_save) { saveToLS(model.name, model.layout) }
    refreshLayout(true)
  })

  function setOverrides(layouts) {
    flags.responsive_from_client = true
    model.responsive_layouts = layouts
    flags.responsive_from_client = false
    if (model.local_save) { saveToLS(`${model.name}::responsive`, layouts) }
  }

  function commitEdit() {
    const layout = exportLayout(grid, ids)
    const width = layoutWidth()
    const band = viewBand(width)
    const editsBase = (
      !band || band === baseBand() ||
      // Until a reference width exists the first AUTO edit defines the base.
      (!model.reference_width && activeBreakpoint === null)
    )
    if (editsBase) {
      flags.layout_from_client = true
      model.layout = layout
      model.reference_width = width
      flags.layout_from_client = false
      if (model.local_save) {
        saveToLS(model.name, layout)
        saveToLS(`${model.name}::reference_width`, width)
      }
    } else {
      setOverrides({...(model.responsive_layouts || {}), [band]: layout})
      model.send_msg({action: "update_responsive_layout", band, layout})
    }
    displayed = {band, source: editsBase ? "base" : "custom", sig: JSON.stringify(layout)}
    updateToolbar()
    reclampAll()
  }

  function resetOverride() {
    const band = displayed.band
    if (!band || !model.responsive_layouts?.[band]) { return }
    const layouts = {...model.responsive_layouts}
    delete layouts[band]
    setOverrides(layouts)
    model.send_msg({action: "delete_responsive_layout", band})
    refreshLayout(true)
  }

  function itemIndex(item_el) {
    const models = model.objects || []
    for (const [mid, it] of model_id_to_item.entries()) {
      if (it === item_el) { return models.findIndex(m => m?.id === mid) }
    }
    return -1
  }

  function onSelect(item_el) {
    const index = itemIndex(item_el)
    if (index !== -1 && model.selected !== index) { model.selected = index }
  }

  function showSelected() {
    const models = model.objects || []
    const selected = models[model.selected ?? -1]?.id
    for (const [mid, item_el] of model_id_to_item.entries()) {
      item_el.classList.toggle("muuri-selected", selected !== undefined && mid === selected)
    }
  }

  // Capture phase, so content that stops propagation still selects its tile.
  // Closing a tile is not interacting with it, so the close handle selects nothing.
  function selectFromEvent(e) {
    const path = e.composedPath()
    if (path.some(n => n.classList?.contains("close") && n.classList.contains("muuri-handle"))) { return }
    const tile = path.find(n => n.parentElement === container && n.classList?.contains("muuri-grid-item"))
    if (tile) { onSelect(tile) }
  }
  container.addEventListener("pointerdown", selectFromEvent, true)
  container.addEventListener("focusin", selectFromEvent, true)
  model.on("selected", showSelected)

  const editing = model.editable ? make_editable(model, container, grid, state, commitEdit, onSelect) : null
  const sync = editing?.sync
  model.on("editable", () => {
    container.classList.toggle("muuri-no-handles", !model.editable)
    if (!model.editable) { editing?.reset() }
  })

  function applyLayoutToGrid(layout) {
    if (!layout || !layout.length || !ids.length) { return }
    state.applying = true
    try {
      for (let i = 0; i < Math.min(ids.length, layout.length); i++) {
        const itemEl = itemElement(i)
        if (!itemEl) { continue }
        const item = grid.getItem(itemEl)
        if (!item) { continue }
        const spec = layout[i] || {}
        resizeToSpec(grid, itemEl, spec, minColWidth())
        if (spec.visible === false && item.isVisible()) {
          grid.hide([item], {layout: false})
        } else if (spec.visible !== false && !item.isVisible()) {
          grid.show([item], {layout: false})
        }
      }
      // Move in target index order so earlier moves don't displace later ones.
      const order = layout
        .map((spec, i) => ({i, index: spec?.index}))
        .filter(({i, index}) => index != null && i < ids.length)
        .sort((a, b) => a.index - b.index)
      for (const {i, index} of order) {
        const itemEl = itemElement(i)
        const item = itemEl && grid.getItem(itemEl)
        if (item) { grid.move(item, index, {layout: false}) }
      }
      fitDisplayWidths()
      grid.refreshItems()
      grid.layout()
    } finally {
      state.applying = false
    }
  }

  function switchToBreakpoint(label) {
    const breakpoints = model.breakpoints
    if (!breakpoints || !breakpoints.length) { return }
    const band = label === null ? null : getBreakpointBands(breakpoints).find(b => b.label === label)
    label = band ? label : null
    activeBreakpoint = label
    if (band?.max) {
      container.style.maxWidth = `${band.max}px`
    } else {
      container.style.removeProperty("max-width")
    }
    container.classList.toggle("muuri-constrained", label !== null)
    refreshLayout(true)
    window.dispatchEvent(new Event("resize"))
    if (toolbarUI) { toolbarUI.setActive(label) }
  }

  function selectBand(label) {
    model.preview_band = label
    if (activeBreakpoint !== label) { switchToBreakpoint(label) }
  }

  if (model.breakpoints?.length) {
    toolbarUI = createBreakpointToolbar(model.breakpoints, container, selectBand, resetOverride)
    if (toolbarUI) {
      el.insertBefore(toolbarUI.toolbar, container)
      toolbarUI.setActive(null)
      updateToolbar()
      const showToolbar = () => {
        toolbarUI.toolbar.style.display = model.editable && model.show_breakpoint_toolbar ? "" : "none"
      }
      showToolbar()
      model.on("editable", showToolbar)
      model.on("show_breakpoint_toolbar", showToolbar)
    }
  }
  if (model.preview_band != null) { switchToBreakpoint(model.preview_band) }
  model.on("preview_band", () => {
    const label = model.preview_band ?? null
    if (label !== activeBreakpoint) { switchToBreakpoint(label) }
  })

  function create_item(child) {
    const item = document.createElement("div")
    item.className = "muuri-grid-item"
    const id = `item-${nextId++}-${Math.random().toString(36).slice(2)}`
    item.setAttribute("data-id", id)

    const drag = document.createElement("div")
    drag.className = "muuri-handle drag"
    drag.title = "Drag to move"
    item.appendChild(drag)

    if (model.close_action) {
      const close = document.createElement("div")
      close.className = "muuri-handle close"
      close.title = "Close"
      close.addEventListener("click", (e) => {
        e.stopPropagation()
        const idx = itemIndex(item)
        if (idx === -1) { return }
        if (model.close_action === "hide") {
          const muuri_item = grid.getItem(item)
          if (muuri_item) {
            grid.hide([muuri_item], {layout: true})
            if (model.selected === idx) { model.selected = null }
            if (sync) { sync() }
          }
        } else {
          model.send_msg({action: "remove", index: idx})
        }
      })
      item.appendChild(close)
    }

    const resize = document.createElement("div")
    resize.className = "muuri-handle resize"
    resize.title = "Drag to resize"
    item.appendChild(resize)

    const slot = document.createElement("div")
    slot.style.display = "contents"
    item.appendChild(slot)
    slot.replaceChildren(child)
    child_to_item.set(child, item)
    return item
  }

  function isHidden() {
    return !container.clientWidth
  }

  function sizeFromContent(item_el, child, child_model, spec) {
    // Measure the height at the width the tile will have, without a height
    // applied from the layout.
    if (spec?.width != null) {
      resizeItem(grid, item_el, spec.width, null, minColWidth(), false)
    } else {
      item_el.style.height = ""
    }
    const width = getInitialWidth(model, container, child, child_model, item_el)
    const height = getInitialHeight(child, child_model, item_el)
    item_el.setAttribute("data-auto-width", width.toString())
    if (height) { item_el.setAttribute("data-auto-height", height.toString()) }
    resizeToSpec(grid, item_el, spec, minColWidth())
  }

  // Muuri measures items when it lays out, and while the grid is hidden (an
  // inactive tab, a hidden parent) every item measures zero, so the layout
  // it computed then stacks all tiles at the origin until something forces
  // it to measure again.
  function onShown() {
    for (const [item_el, {child, child_model, spec}] of unsized) {
      if (item_el.isConnected) { sizeFromContent(item_el, child, child_model, spec) }
    }
    unsized.clear()
    reclampAll()
    grid.refreshItems()
    grid.layout(true)
    refreshLayout(true)
  }

  async function reconcile(children, initial=false) {
    const next_children = Array.isArray(children) ? children : []
    const next_models = model.objects || []
    const next_model_ids = new Set(next_models.map(m => m?.id))

    // Remove stale items by model id
    for (const [mid, item] of model_id_to_item.entries()) {
      if (next_model_ids.has(mid)) { continue }
      model_id_to_item.delete(mid)
      unsized.delete(item)
      for (const [child, it] of child_to_item.entries()) {
        if (it === item) { child_to_item.delete(child); break }
      }
      const muuri_item = grid.getItem(item)
      if (muuri_item) {
        grid.remove([muuri_item], {removeElements: true, layout: false})
      } else {
        item.remove()
      }
    }

    // Add new items or reuse existing by model id
    const added = []
    const added_models = []
    const added_indices = []
    for (let i = 0; i < next_children.length; i++) {
      const child = next_children[i]
      if (!child) { continue }
      const child_model = next_models[i]
      const cv = view.get_child_view(child_model)
      const mid = child_model?.id
      const existing = mid ? model_id_to_item.get(mid) : child_to_item.get(child)
      if (existing) {
        const slot = existing.lastElementChild
        if (slot && slot.firstChild !== child) {
          slot.replaceChildren(child)
        }
        if (child_model?.min_width) {
          existing.setAttribute("data-min-width", child_model.min_width.toString())
        } else {
          existing.removeAttribute("data-min-width")
        }
        if (child_model?.max_width) {
          existing.setAttribute("data-max-width", child_model.max_width.toString())
        } else {
          existing.removeAttribute("data-max-width")
        }
        child_to_item.set(child, existing)
        continue
      }
      const item = create_item(child)
      item.style.opacity = "0"
      if (child_model?.min_width) {
        item.setAttribute("data-min-width", child_model.min_width.toString())
      }
      if (child_model?.max_width) {
        item.setAttribute("data-max-width", child_model.max_width.toString())
      }
      container.appendChild(item)
      if (mid) { model_id_to_item.set(mid, item) }
      added.push(item)
      added_models.push(child_model)
      added_indices.push(i)
      if (initial && cv) {
        // A tile that fails to render must not keep the others out of the grid.
        try {
          cv.rerender_ ? cv.rerender_() : cv.rerender()
          // Panel's `render_children` re-renders every child missing from
          // `_child_rendered` whenever `objects` changes.
          view._child_rendered?.set(cv, true)
        } catch (e) {
          console.error(e)
        }
      }
    }

    if (added.length) {
      grid.add(added, {layout: false})
    }

    // Rebuild id order
    ids.length = 0
    next_children.forEach((child) => {
      const item = child_to_item.get(child)
      if (!item) { return }
      ids.push(item.getAttribute("data-id"))
    })

    try {
      // Wait for entire child view tree to finish rendering. Panel renders
      // children added by an `objects` change only after notifying us, and
      // ESM children register their render once their module resolves, so
      // collecting the ready promises right away would miss that render.
      if (added.length) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        await childrenReady(view)
        await new Promise(resolve => requestAnimationFrame(resolve))
      }

      // Size only genuinely new items
      const currentLayout = model.layout || []
      for (const i of added_indices) {
        const child = next_children[i]
        const item_el = child_to_item.get(child)
        if (!item_el) { continue }
        const spec = currentLayout[i]
        if (isHidden()) {
          // Content has no size while the grid is hidden, so measuring now
          // would size the tile from nothing; size it once it is shown.
          if (spec?.width != null && spec?.height != null) { resizeToSpec(grid, item_el, spec, minColWidth()) }
          unsized.set(item_el, {child, child_model: next_models[i], spec})
        } else {
          // Measured even when the entry sets both sizes, so a later layout
          // that leaves one out falls back to the content size.
          sizeFromContent(item_el, child, next_models[i], spec)
        }
        if (spec?.visible === false) {
          const muuri_item = grid.getItem(item_el)
          if (muuri_item) { grid.hide([muuri_item], {layout: false}) }
        }
      }

      grid.refreshSortData()
      grid.sort("id", {layout: false})
      fitDisplayWidths()
      grid.refreshItems()
      grid.layout()
      // Resolve before revealing new tiles so narrow screens never flash the base layout.
      if (added.length) { refreshLayout(true) }
      showSelected()
    } finally {
      for (const item_el of added) {
        item_el.style.opacity = ""
      }
    }
  }

  model.on("msg:custom", (msg) => {
    if (msg.action === "clear_local_save") {
      if (window.localStorage) {
        window.localStorage.removeItem(getLSKey(model.name))
        window.localStorage.removeItem(getLSKey(`${model.name}::responsive`))
        window.localStorage.removeItem(getLSKey(`${model.name}::reference_width`))
      }
    }
  })

  model.on("objects", async () => {
    const children = model.get_child("objects")
    if (last_children == view.model.data.objects) { return }
    last_children = view.model.data.objects
    await reconcile(children)
  })

  // Access children before rAF so Panel registers them for rendering
  model.get_child("objects")

  requestAnimationFrame(async () => {
    // Restore saved layout from localStorage if available
    if (model.local_save) {
      const saved = getFromLS(model.name)
      if (saved && Array.isArray(saved) && saved.length) {
        flags.layout_from_client = true
        model.layout = saved
        flags.layout_from_client = false
      }
      const savedReference = getFromLS(`${model.name}::reference_width`)
      if (typeof savedReference === "number" && savedReference > 0) {
        flags.layout_from_client = true
        model.reference_width = savedReference
        flags.layout_from_client = false
      }
      // Restore responsive layouts
      if (model.breakpoints?.length) {
        const savedResponsive = getFromLS(`${model.name}::responsive`)
        if (savedResponsive && typeof savedResponsive === "object") {
          flags.responsive_from_client = true
          model.responsive_layouts = savedResponsive
          flags.responsive_from_client = false
        }
      }
    }

    const expected = (model.objects || []).length
    if (expected > 0) {
      await childrenReady(view)
    }

    const children = model.get_child("objects")
    if (children && children.length && children.some(c => c != null)) {
      last_children = view.model.data.objects
      await reconcile(children, true)
      window.dispatchEvent(new Event("resize"))
    }
  })
}
