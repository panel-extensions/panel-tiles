// @ts-check
import Muuri from 'https://esm.sh/muuri@0.9.5'
import interact from 'https://esm.sh/interactjs@1.10.27'

function getLSKey() {
  return window.location.origin + window.location.pathname
}

function saveToLS(key, value) {
  if (!window.localStorage) return
  const existing = JSON.parse(window.localStorage.getItem(getLSKey())) || {}
  existing[key] = value
  window.localStorage.setItem(getLSKey(), JSON.stringify(existing))
}

function getFromLS(key) {
  if (!window.localStorage) return null
  try {
    const ls = JSON.parse(window.localStorage.getItem(getLSKey())) || {}
    return ls[key] ?? null
  } catch { return null }
}

function exportLayout(grid) {
  const layout = []
  const items = grid.getItems()
  const ids = items.map(it => it.getElement().getAttribute('data-id'))
  for (const item of items) {
    const el = item.getElement()
    let height = el.style.height.slice(0, -2)
    if (!height) {
      const {top} = item.getMargin()
      height = item.getHeight() - top
    } else {
      height = parseFloat(height)
    }
    let width
    if (el.style.width.length) {
      // `calc( XX% - 30px )`
      width = parseFloat(el.style.width.split('(')[1].split('%')[0])
    } else { width = 100 }
    layout.push({
      index: ids.indexOf(el.getAttribute('data-id')),
      width, height, visible: item.isVisible()
    })
  }
  return layout
}

function resizeItem(grid, el, width, height, notify=true) {
  const screenWidth = grid.getElement().clientWidth
  if (((width/100) * screenWidth) < 100) width = (100/screenWidth) * 100
  width = Math.min(100, width)
  el.style.width = `calc(${width}% - 20px)`
  if (height == null) el.style.height = ''
  else el.style.height = `${height}px`
  if (notify) { grid.refreshItems(); grid.layout() }
}

function parsePixelValue(value) {
  const match = /^([\d.]+)px$/.exec((value || '').trim())
  return match ? parseFloat(match[1]) : null
}

function getExplicitPixelWidth(el) {
  let width = parsePixelValue(el.style.width)
  for (const child of el.querySelectorAll('*')) {
    width = Math.max(width || 0, parsePixelValue(child.style.width) || 0)
  }
  return width || null
}

function getInitialWidth(model, container, child_el, child_model) {
  const screenWidth = model.width || container.clientWidth || container.getBoundingClientRect().width
  if (!screenWidth) return 100

  const child_width =
    child_model?.width ||
    getExplicitPixelWidth(child_el) ||
    child_el.getBoundingClientRect().width ||
    child_el.clientWidth

  if (!child_width) return 100
  const ret = Math.max((child_width / screenWidth) * 100, (100/screenWidth) * 100)
  return ret
}

function make_editable(model, container, grid) {
  let updating = false
  const undo_stack = []

  function sync_layout() {
    const layout = exportLayout(grid)
    updating = true
    model.layout = layout
    updating = false
    if (model.local_save) saveToLS('grid-layout', layout)
  }

  interact('.muuri-grid-item').resizable({
    edges: { right: '.muuri-handle.resize', bottom: '.muuri-handle.resize' },
    listeners: {
      start (event) {
        const el = event.target
        const item = grid.getItem(el);
        let height = el.style.height.slice(null, -2);
        if (!height) {
          const {top} = item.getMargin();
          height = item.getHeight()-top;
        } else {
          height = parseFloat(height);
        }
        let width;
        if (el.style.width.length) {
          width = parseFloat(el.style.width.split('(')[1].split('%')[0]);
        } else {
          width = 100;
        }
        undo_stack.push({action: "resize", item, width, height})
      },
      move (ev) {
        container.classList.add('muuri-no-select')
        const item = grid.getItem(ev.target)
        const { top, bottom } = item.getMargin()
        const screenW = grid.getElement().clientWidth
        const w = (ev.rect.width / screenW) * 100
        const h = ev.rect.height - top - bottom
        ev.target.style.zIndex = 100
        resizeItem(grid, ev.target, w, h, false)
        grid.refreshItems(); grid.layout()
        window.dispatchEvent(new Event('resize'))
      },
      end (ev) {
        container.classList.remove('muuri-no-select')
        ev.target.style.removeProperty('z-index')
        grid.refreshItems(); grid.layout()
        sync_layout()
        window.dispatchEvent(new Event('resize'))
      }
    },
    modifiers: [
      interact.modifiers.restrictSize({
        min: { width: 100, height: 50 }
      }),
      interact.modifiers.snapEdges({
        offset: 'parent',
        targets: [
          // Snap to other items or right edge if within 25 pixels
          function (x, y, interaction) {
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
                target.x = right
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
    .on('dragInit', () => container.classList.remove('muuri-no-select'))
    .on('move', () => sync_layout())
    .on('dragEnd', () => {
      container.classList.remove('muuri-no-select')
      sync_layout()
    })
}

function init(model, container, child_els, ids) {
  // Initial layout: localStorage > initial_layout > measured widths
  let seed = null
  const child_models = model.objects || []
  if (model.local_save) seed = getFromLS('grid-layout')
  if (!seed || !Array.isArray(seed) || seed.length !== child_models.length) {
    seed = (model.initial_layout && model.initial_layout.length)
      ? model.initial_layout
      : child_models.map((child_model, i) => {
        const width = getInitialWidth(model, container, child_els[i], child_model)
        return ({ index: i, width: width, height: null, visible: true })
      })
  }

  const grid = new Muuri(container, {
    dragEnabled: !!model.editable,
    dragHandle: '.muuri-handle.drag',
    layout: { fillGaps: model.fill_gaps },
    sortData: {
      id: (_, el) => {
        const index = ids.indexOf(el.getAttribute('data-id'))
        return index === -1 ? Infinity : index
      }
    }
  })

  // Apply seed sizes
  for (const spec of seed) {
    const el = container.querySelectorAll('[data-id]')[spec.index]
    if (!el) continue
    resizeItem(grid, el, spec.width ?? 100, spec.height ?? null, false)
  }
  grid.refreshSortData()
  grid.sort('id', { layout: false })
  grid.layout({ instant: true })

  const onResize = () => { grid.refreshItems(); grid.layout() }
  window.addEventListener('resize', onResize, true)
  model.on('remove', () => { window.removeEventListener('resize', onResize) })
  model.on('layout', (_) => {
    const next = model.layout
    const items = grid.getItems()
    for (let i=0; i<Math.min(items.length, next.length); i++) {
      const el = items[i].getElement()
      const spec = next[i] || {}
      resizeItem(grid, el, spec.width ?? 100, spec.height ?? null, false)
    }
    grid.refreshItems();
    grid.layout()
  })

  if (model.editable) {
    make_editable(model, container, grid)
  }
}

export function render({ model, el }) {
  // Root container
  const container = document.createElement('div')
  container.className = 'muuri-grid'
  el.append(container)

  const ids = []
  function build_items(children) {
    container.replaceChildren()
    ids.length = 0
    children.forEach((child, i) => {
      const item = document.createElement('div')
      item.className = 'muuri-grid-item'
      const id = `item-${i}-${Math.random().toString(36).slice(2)}`
      item.setAttribute('data-id', id)
      ids.push(id)

      // Handles
      const drag = document.createElement('div')
      drag.className = 'muuri-handle drag'
      item.appendChild(drag)

      const resize = document.createElement('div')
      resize.className = 'muuri-handle resize'
      item.appendChild(resize)

      // Child mount point
      const slot = document.createElement('div')
      slot.style.height = '100%'
      item.appendChild(slot)
      slot.append(child)

      container.appendChild(item)
    })
  }

  let initialized = false
  const initialize_grid = () => {
    if (initialized) return
    const children = model.get_child('objects')
    if (!children || !children.length) return
    build_items(children)
    init(model, container, children, ids)
    initialized = true
    window.dispatchEvent(new Event('resize'))
  }

  initialize_grid()
  model.on('after_layout', initialize_grid)
}
