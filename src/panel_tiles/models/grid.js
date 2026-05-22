// @ts-check
import Muuri from "https://esm.sh/muuri@0.9.5"
import interact from "https://esm.sh/interactjs@1.10.27"

function getLSKey() {
  return window.location.origin + window.location.pathname
}

function saveToLS(key, value) {
  if (!window.localStorage) { return }
  const existing = JSON.parse(window.localStorage.getItem(getLSKey())) || {}
  existing[key] = value
  window.localStorage.setItem(getLSKey(), JSON.stringify(existing))
}

function getFromLS(key) {
  if (!window.localStorage) { return null }
  try {
    const ls = JSON.parse(window.localStorage.getItem(getLSKey())) || {}
    return ls[key] ?? null
  } catch { return null }
}

function exportLayout(grid) {
  const layout = []
  const items = grid.getItems()
  const ids = items.map(it => it.getElement().getAttribute("data-id"))
  for (const item of items) {
    const el = item.getElement()
    let height = el.style.height.slice(0, -2)
    if (!height) {
      const {top, bottom} = item.getMargin()
      height = item.getHeight() - top - bottom
    } else {
      height = parseFloat(height)
    }
    let width
    if (el.style.width.length) {
      // `calc( XX% - 30px )`
      width = parseFloat(el.style.width.split("(")[1].split("%")[0])
    } else { width = 100 }
    layout.push({
      index: ids.indexOf(el.getAttribute("data-id")),
      width, height, visible: item.isVisible()
    })
  }
  return layout
}

function resizeItem(grid, el, width, height, notify=true) {
  const screenWidth = grid.getElement().clientWidth
  if (((width/100) * screenWidth) < 100) { width = (100/screenWidth) * 100 }
  width = Math.min(100, width)
  el.style.width = `calc(${width}% - 20px)`
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

function getInitialWidth(model, container, child_el, child_model) {
  const screenWidth = model.width || container.clientWidth || container.getBoundingClientRect().width
  if (!screenWidth) { return 100 }

  const configured = child_model?.width
  const child_width = configured != null
    ? configured + getHorizontalMargin(child_model)
    : getExplicitPixelWidth(child_el) ||
      child_el.getBoundingClientRect().width ||
	child_el.clientWidth

  if (!child_width) { return 100 }
  return Math.max(((child_width + 30) / screenWidth) * 100, (100/screenWidth) * 100)
}

function getInitialHeight(child_el, child_model) {
  const configured_height = child_model?.height
  if (configured_height != null && Number.isFinite(configured_height) && configured_height > 0) {
    return configured_height
  }
  const measured_height =
    getExplicitPixelHeight(child_el) ||
    child_el.getBoundingClientRect().height ||
    child_el.clientHeight ||
    child_el.scrollHeight
  return measured_height || null
}

function getRequiredItemContentHeight(item_el) {
  const slot = item_el.lastElementChild
  if (!(slot instanceof HTMLElement)) { return null }
  const child = slot.firstElementChild
  const slot_height = Math.max(
    slot.getBoundingClientRect().height || 0,
    slot.clientHeight || 0,
    slot.scrollHeight || 0
  )
  if (!(child instanceof HTMLElement)) { return slot_height || null }
  const styles = window.getComputedStyle(child)
  const margin_top = parseFloat(styles.marginTop) || 0
  const margin_bottom = parseFloat(styles.marginBottom) || 0
  const child_height = Math.max(
    child.getBoundingClientRect().height || 0,
    child.clientHeight || 0,
    child.scrollHeight || 0
  )
  return Math.max(slot_height, child_height + margin_top + margin_bottom) || null
}

function growItemToFitContent(item_el) {
  const required = getRequiredItemContentHeight(item_el)
  if (required == null) { return false }
  const current = parsePixelValue(item_el.style.height) || 0
  if (required <= current + 1) { return false }
  item_el.style.height = `${Math.ceil(required)}px`
  return true
}

function make_editable(model, container, grid) {
  let updating = false
  const undo_stack = []

  function sync_layout() {
    const layout = exportLayout(grid)
    updating = true
    model.layout = layout
    updating = false
    if (model.local_save) { saveToLS("grid-layout", layout) }
  }

  interact(".muuri-grid-item").resizable({
    edges: {right: ".muuri-handle.resize", bottom: ".muuri-handle.resize"},
    listeners: {
      start(event) {
        const el = event.target
        const item = grid.getItem(el);
        let height = el.style.height.slice(null, -2);
        if (!height) {
          const {top, bottom} = item.getMargin();
          height = item.getHeight()-top-bottom;
        } else {
          height = parseFloat(height);
        }
        let width;
        if (el.style.width.length) {
          width = parseFloat(el.style.width.split("(")[1].split("%")[0]);
        } else {
          width = 100;
        }
        undo_stack.push({action: "resize", item, width, height})
      },
      move(ev) {
        container.classList.add("muuri-no-select")
        const item = grid.getItem(ev.target)
        const {top, bottom} = item.getMargin()
        const screenW = grid.getElement().clientWidth
        const w = (ev.rect.width / screenW) * 100
        const h = ev.rect.height - top - bottom
        ev.target.style.zIndex = 100
        resizeItem(grid, ev.target, w, h, false)
        grid.refreshItems(); grid.layout()
        window.dispatchEvent(new Event("resize"))
      },
      end(ev) {
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

export function render({model, el, view}) {
  const container = document.createElement("div")
  container.className = "muuri-grid"
  el.append(container)

  let nextId = 0
  const ids = []
  const child_to_item = new Map()
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

  const onResize = () => { grid.refreshItems(); grid.layout() }
  window.addEventListener("resize", onResize, true)
  model.on("remove", () => { window.removeEventListener("resize", onResize) })

  model.on("layout", async (_) => {
    const next = model.layout
    const items = grid.getItems()
    for (let i = 0; i < Math.min(items.length, next.length); i++) {
      const el = items[i].getElement()
      const spec = next[i] || {}
      resizeItem(grid, el, spec.width ?? 100, spec.height ?? null, false)
    }
    grid.refreshItems()
    grid.layout()
  })

  let sync = null
  if (model.editable) {
    sync = make_editable(model, container, grid)
  }

  function create_item(child) {
    const item = document.createElement("div")
    item.className = "muuri-grid-item"
    const id = `item-${nextId++}-${Math.random().toString(36).slice(2)}`
    item.setAttribute("data-id", id)

    const drag = document.createElement("div")
    drag.className = "muuri-handle drag"
    item.appendChild(drag)

    const resize = document.createElement("div")
    resize.className = "muuri-handle resize"
    item.appendChild(resize)

    const slot = document.createElement("div")
    slot.style.display = "flow-root"
    item.appendChild(slot)
    slot.replaceChildren(child)
    child_to_item.set(child, item)
    return item
  }

  async function reconcile(children) {
    const next_children = Array.isArray(children) ? children : []
    const next_set = new Set(next_children)

    // Remove stale items
    for (const [child, item] of child_to_item.entries()) {
      if (next_set.has(child)) { continue }
      child_to_item.delete(child)
      const muuri_item = grid.getItem(item)
      if (muuri_item) {
        grid.remove([muuri_item], {removeElements: true, layout: false})
      } else {
        item.remove()
      }
    }

    // Add new items
    const added = []
    const added_indices = []
    for (let i = 0; i < next_children.length; i++) {
      const child = next_children[i]
      const existing = child_to_item.get(child)
      if (existing) {
        const slot = existing.lastElementChild
        if (slot && slot.firstChild !== child) {
          slot.replaceChildren(child)
        }
        continue
      }
      const item = create_item(child)
      container.appendChild(item)
      added.push(item)
      added_indices.push(i)
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

    // Wait for entire child view tree to finish rendering
    if (added.length) {
      await view.root.ready
    }

    // Size items
    for (const i of added_indices) {
      const child = next_children[i]
      const item_el = child_to_item.get(child)
      if (!item_el) { continue }
      const child_model = model.objects?.[i]
      const width = getInitialWidth(model, container, child, child_model)
      const height = getInitialHeight(child, child_model)
      resizeItem(grid, item_el, width, height, false)
    }

    for (const item of grid.getItems()) {
      growItemToFitContent(item.getElement())
    }

    grid.refreshSortData()
    grid.sort("id", {layout: false})
    grid.refreshItems()
    grid.layout()
  }

  model.on("objects", async () => {
    const children = model.get_child("objects")
    if (last_children == view.model.data.objects) { return }
    last_children = view.model.data.objects
    await reconcile(children)
  })

  requestAnimationFrame(async () => {
    const children = model.get_child("objects")
    if (children && !children.length) {
      last_children = view.model.data.objects
      await reconcile(children)
    }
  })
}
