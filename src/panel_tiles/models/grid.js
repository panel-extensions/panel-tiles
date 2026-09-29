// @ts-check
import Muuri from "https://esm.sh/muuri@0.9.5"
import interact from "https://esm.sh/interactjs@1.10.27"

import {DEFAULT_REFERENCE_WIDTH, resolveLayout} from "./responsive.js"

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
    layout[modelIdx] = {
      index: visualIdx, width, height, visible: item.isVisible()
    }
  }
  return layout.filter(Boolean)
}

function setAuthoredWidth(el, width) {
  width = Math.min(100, Math.max(width, 1))
  el.setAttribute("data-width", width.toString())
}

function clampWidthForItem(grid, el, width) {
  const containerWidth = grid.getElement().clientWidth
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

function applyDisplayWidth(grid, el, minColWidth) {
  const containerWidth = grid.getElement().clientWidth
  const authored = parseFloat(el.getAttribute("data-width")) || 100
  let display = authored
  if (containerWidth > 0) {
    const itemMin = parseFloat(el.getAttribute("data-min-width")) || 0
    const effectiveMin = Math.max(minColWidth || 0, itemMin)
    if (effectiveMin > 0) {
      const minPct = (effectiveMin / containerWidth) * 100
      if (display < minPct) { display = Math.min(100, minPct) }
    }
    const itemMax = parseFloat(el.getAttribute("data-max-width")) || 0
    if (itemMax > 0) {
      const maxPct = (itemMax / containerWidth) * 100
      if (display > maxPct) { display = maxPct }
    }
  }
  el.style.width = `calc(${display}% - 20px)`
}

function resizeItem(grid, el, width, height, minColWidth, notify=true) {
  setAuthoredWidth(el, width)
  applyDisplayWidth(grid, el, minColWidth)
  if (height == null) { el.style.height = "" } else { el.style.height = `${height}px` }
  if (notify) { grid.refreshItems(); grid.layout() }
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

function make_editable(model, container, grid, state, onCommit) {
  const undo_stack = []
  const minColWidth = () => model.min_col_width || null

  function sync_layout() {
    // grid.move() emits "move" while a resolved layout is being applied.
    if (state.applying) { return }
    onCommit()
  }

  interact(".muuri-grid-item").resizable({
    edges: {right: ".muuri-handle.resize", bottom: ".muuri-handle.resize"},
    listeners: {
      start(event) {
        state.interacting = true
        const el = event.target
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
        const {top, bottom} = item.getMargin()
        const screenW = grid.getElement().clientWidth
        const w = clampWidthForItem(grid, ev.target, (ev.rect.width / screenW) * 100)
        const h = ev.rect.height - top - bottom
        ev.target.style.zIndex = 100
        resizeItem(grid, ev.target, w, h, minColWidth(), false)
        grid.refreshItems(); grid.layout()
        window.dispatchEvent(new Event("resize"))
      },
      end(ev) {
        state.interacting = false
        container.classList.remove("muuri-no-select")
        ev.target.style.removeProperty("z-index")
        grid.refreshItems(); grid.layout()
        sync_layout()
        window.dispatchEvent(new Event("resize"))
      }
    },
    modifiers: [
      interact.modifiers.restrictSize({
        min: {width: 100, height: 50}
      }),
      interact.modifiers.snapEdges({
        offset: "parent",
        targets: [
          // Snap to other items or right edge if within 25 pixels
          function(x, y, interaction) {
            const target = {range: 50}
            const grid_bbox = grid.getElement().getBoundingClientRect()
            const resized_item = grid.getItem(interaction.element)
            if (!resized_item) { return target }
            const resized_margin = resized_item.getMargin()
            for (const item of grid.getItems()) {
              const item_el = item.getElement()
              if ((item_el === interaction.element) || !item.isVisible()) {
                continue
              }
              const item_bbox = item_el.getBoundingClientRect()
              const bottom = item_bbox.bottom - grid_bbox.top
              const right = item_bbox.right - grid_bbox.left

              if (Math.abs(right - x) < target.range) {
                target.x = right + resized_margin.left + resized_margin.right
              }
              if (Math.abs(bottom - y) < target.range) {
                target.y = bottom + resized_margin.top + resized_margin.bottom
              }
            }
            if ((grid_bbox.width - x) < target.range) {
              target.x = grid_bbox.width
            }
            return target
          }
        ]
      })
    ]
  })

  grid
    .on("dragInit", () => container.classList.remove("muuri-no-select"))
    .on("move", () => sync_layout())
    .on("dragEnd", () => {
      container.classList.remove("muuri-no-select")
      sync_layout()
    })
  return sync_layout
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
  model.on("editable", () => container.classList.toggle("muuri-no-handles", !model.editable))

  let nextId = 0
  const ids = []
  const child_to_item = new Map()
  const model_id_to_item = new Map()
  let last_children = []

  const grid = new Muuri(container, {
    dragEnabled: !!model.editable,
    dragHandle: ".muuri-handle.drag",
    layout: {fillGaps: model.fill_gaps},
    sortData: {
      id: (_, el) => {
        const index = ids.indexOf(el.getAttribute("data-id"))
        return index === -1 ? Infinity : index
      }
    }
  })

  const minColWidth = () => model.min_col_width || null

  function reclampAll() {
    if (!model.min_col_width) { return }
    for (const item of grid.getItems()) {
      applyDisplayWidth(grid, item.getElement(), minColWidth())
    }
    grid.refreshItems()
    grid.layout()
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
    const width = container.clientWidth
    const band = viewBand(width)
    const resolved = resolveLayout({
      layout: model.layout,
      overrides: model.responsive_layouts,
      band,
      baseBand: baseBand(),
      width,
      referenceWidth: referenceWidth(),
      mode: model.responsive_mode,
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
    if (!ids.length || state.interacting || !container.clientWidth) { return }
    const resolved = resolveCurrent()
    const sig = JSON.stringify(resolved.layout)
    const changed = force || sig !== displayed.sig
    displayed = {band: resolved.band, source: resolved.source, sig}
    if (changed && resolved.layout?.length) { applyLayoutToGrid(resolved.layout) }
    updateToolbar()
  }

  let resizeFrame = null
  let lastWidth = null
  const onResize = () => {
    reclampAll()
    if (resizeFrame !== null) { return }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null
      refreshLayout()
    })
  }
  window.addEventListener("resize", onResize, true)
  // Width can change without a window resize, e.g. when a sidebar collapses.
  const observer = new ResizeObserver(() => {
    const width = container.clientWidth
    if (width === lastWidth) { return }
    lastWidth = width
    onResize()
  })
  observer.observe(container)
  model.on("remove", () => {
    window.removeEventListener("resize", onResize, true)
    observer.disconnect()
  })
  model.on("min_col_width", () => { reclampAll(); refreshLayout() })
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
    const width = container.clientWidth
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

  let sync = null
  if (model.editable) {
    sync = make_editable(model, container, grid, state, commitEdit)
  }

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
        resizeItem(grid, itemEl, spec.width ?? 100, spec.height ?? null, minColWidth(), false)
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
      grid.refreshItems()
      grid.layout()
    } finally {
      state.applying = false
    }
  }

  function switchToBreakpoint(label) {
    const breakpoints = model.breakpoints
    if (!breakpoints || !breakpoints.length) { return }
    activeBreakpoint = label
    const band = label === null ? null : getBreakpointBands(breakpoints).find(b => b.label === label)
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

  if (model.breakpoints?.length) {
    toolbarUI = createBreakpointToolbar(model.breakpoints, container, switchToBreakpoint, resetOverride)
    if (toolbarUI) {
      el.insertBefore(toolbarUI.toolbar, container)
      toolbarUI.setActive(null)
      updateToolbar()
      if (!model.editable) { toolbarUI.toolbar.style.display = "none" }
      model.on("editable", () => {
        toolbarUI.toolbar.style.display = model.editable ? "" : "none"
      })
    }
  }

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
        const models = model.objects || []
        let idx = -1
        for (const [mid, it] of model_id_to_item.entries()) {
          if (it === item) {
            idx = models.findIndex(m => m?.id === mid)
            break
          }
        }
        if (idx === -1) { return }
        if (model.close_action === "hide") {
          const muuri_item = grid.getItem(item)
          if (muuri_item) {
            grid.hide([muuri_item], {layout: true})
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

  async function reconcile(children, initial=false) {
    const next_children = Array.isArray(children) ? children : []
    const next_models = model.objects || []
    const next_model_ids = new Set(next_models.map(m => m?.id))

    // Remove stale items by model id
    for (const [mid, item] of model_id_to_item.entries()) {
      if (next_model_ids.has(mid)) { continue }
      model_id_to_item.delete(mid)
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
        cv.rerender_ ? cv.rerender_() : cv.rerender()
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
      // Wait for entire child view tree to finish rendering
      if (added.length) {
        await view.root.ready
        await new Promise(resolve => requestAnimationFrame(resolve))
      }

      // Size only genuinely new items
      const currentLayout = model.layout || []
      for (const i of added_indices) {
        const child = next_children[i]
        const item_el = child_to_item.get(child)
        if (!item_el) { continue }
        const spec = currentLayout[i]
        if (spec && (spec.width != null || spec.height != null)) {
          resizeItem(grid, item_el, spec.width ?? 100, spec.height ?? null, minColWidth(), false)
          if (spec.visible === false) {
            const muuri_item = grid.getItem(item_el)
            if (muuri_item) { grid.hide([muuri_item], {layout: false}) }
          }
        } else {
          const child_model = next_models[i]
          const width = getInitialWidth(model, container, child, child_model, item_el)
          const height = getInitialHeight(child, child_model, item_el)
          resizeItem(grid, item_el, width, height, minColWidth(), false)
        }
      }

      grid.refreshSortData()
      grid.sort("id", {layout: false})
      grid.refreshItems()
      grid.layout()
      // Resolve before revealing new tiles so narrow screens never flash the base layout.
      if (added.length) { refreshLayout(true) }
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
      await view.root.ready
    }

    const children = model.get_child("objects")
    if (children && children.length && children.some(c => c != null)) {
      last_children = view.model.data.objects
      await reconcile(children, true)
      window.dispatchEvent(new Event("resize"))
    }
  })
}
