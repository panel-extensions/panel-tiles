# How To: Create Responsive Layouts

Use the `breakpoints` parameter to define viewport-width thresholds and author different tile arrangements for each screen size.

## Basic Usage

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Revenue\n\n$1.2M"),
        pn.pane.Markdown("# Users\n\n14,302"),
        pn.pane.Markdown("# Growth\n\n+12%"),
        pn.pane.Markdown("# Chart\n\nTrend data here."),
    ],
    breakpoints=[768, 1200],
    sizing_mode="stretch_width",
    height=600,
)

grid.servable()
```

This creates three responsive bands:

- **xs** (< 768px): phones and narrow tablets
- **sm** (768 - 1200px): tablets and small laptops
- **md** (> 1200px): desktops

## Authoring Layouts Per Breakpoint

When `editable=True` (the default), a toolbar appears above the grid with chips for each breakpoint plus an "AUTO" button. To author a responsive layout:

1. Click a breakpoint chip (e.g. "XS <768px")
2. The grid constrains to that max width, showing you exactly how it will look at that viewport
3. Drag and resize tiles to arrange them for that screen size
4. Click another breakpoint to switch and arrange that view
5. Click "AUTO" to return to natural width with automatic breakpoint switching

Each breakpoint's layout is saved independently. When the viewport resizes, the grid automatically applies the matching breakpoint's layout.

## Pre-configuring Responsive Layouts

You can provide responsive layouts programmatically instead of (or in addition to) interactive authoring:

```python
grid = TileGrid(
    objects=[...],
    breakpoints=[768, 1200],
    layout=[
        {"width": 33, "height": 150, "visible": True},
        {"width": 33, "height": 150, "visible": True},
        {"width": 33, "height": 150, "visible": True},
        {"width": 100, "height": 300, "visible": True},
    ],
    responsive_layouts={
        "xs": [
            {"width": 100, "height": 120, "visible": True},
            {"width": 100, "height": 120, "visible": True},
            {"width": 100, "height": 120, "visible": True},
            {"width": 100, "height": 250, "visible": True},
        ],
        "sm": [
            {"width": 50, "height": 150, "visible": True},
            {"width": 50, "height": 150, "visible": True},
            {"width": 50, "height": 150, "visible": True},
            {"width": 100, "height": 300, "visible": True},
        ],
    },
    sizing_mode="stretch_width",
    height=600,
)
```

The `layout` parameter serves as the default (used for the largest breakpoint or when no responsive layout exists for a band).

## Persisting Responsive Layouts

When `local_save=True`, responsive layouts are persisted to `localStorage` alongside the default layout. Users' breakpoint-specific arrangements survive page refreshes.

```python
grid = TileGrid(
    objects=[...],
    breakpoints=[768, 1200],
    local_save=True,
    name="my-dashboard",
    sizing_mode="stretch_width",
    height=600,
)
```

Calling `grid.clear_local_save()` removes both the default and all responsive saved layouts.

## Fallback Behavior

When a user resizes their browser into a breakpoint that has no authored layout, the grid falls back to the nearest larger breakpoint's layout. If no larger breakpoint has a layout either, it uses the default `layout`. This means you can author just the desktop and mobile layouts, and intermediate sizes will gracefully inherit from the larger one.

## Combining with min_col_width

The `min_col_width` parameter works alongside breakpoints. Within any breakpoint's layout, tiles are still clamped to the minimum width if the container is narrower than expected:

```python
grid = TileGrid(
    objects=[...],
    breakpoints=[768, 1200],
    min_col_width=200,
    sizing_mode="stretch_width",
    height=600,
)
```
