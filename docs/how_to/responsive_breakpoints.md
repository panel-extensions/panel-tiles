# How To: Create Responsive Layouts

Arrange tiles once, at whatever width you are working at, and let the grid adapt the arrangement to narrower screens. Tiles keep their authored size relative to the width they were arranged at and wrap onto new lines instead of shrinking indefinitely. Breakpoints let you preview each screen size and, where the generated arrangement isn't what you want, replace it with a custom one.

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
        pn.pane.Markdown("# Churn\n\n2.1%"),
        pn.pane.Markdown("# Chart\n\nTrend data here."),
        pn.pane.Markdown("# Notes"),
    ],
    layout=[
        {"index": 0, "width": 25, "height": 120, "visible": True},
        {"index": 1, "width": 25, "height": 120, "visible": True},
        {"index": 2, "width": 25, "height": 120, "visible": True},
        {"index": 3, "width": 25, "height": 120, "visible": True},
        {"index": 4, "width": 66.67, "height": 320, "visible": True},
        {"index": 5, "width": 33.33, "height": 320, "visible": True},
    ],
    reference_width=1400,
    breakpoints=[768, 1200],
    sizing_mode="stretch_width",
)

grid.servable()
```

At 1400px and wider the grid shows `layout` as written. Below that, each tile may shrink to half its authored pixel width before it wraps:

- At 1000px nothing changes, since every tile still has at least half its authored width.
- At 600px the four KPI tiles form a 2x2 grid, and the chart and notes stack at full width.
- On a phone every tile gets its own line once `min_col_width` is larger than half the screen.

The authored `layout` is never modified by viewing the grid at a smaller size.

## How Layouts Are Generated

The grid reconstructs how the tiles are arranged at `reference_width`, i.e. which tiles sit side by side in a row and which are stacked in a column, and snaps them to a 12-column grid. For a narrower container, each row keeps its authored proportions as long as every tile in it stays above its shrink limit. Otherwise the row is split into as few evenly balanced lines as needed: four equal tiles become 2+2 rather than 3+1, and a tile alone on a line takes the full width. Tiles stacked beside a larger tile stay together as a group when they wrap.

The shrink limit of a tile is the largest of:

- `wrap_shrink` (default `0.5`) times its authored pixel width
- `min_col_width`
- the tile's own `min_width`

Set `responsive_mode="scale"` to keep authored percentages at every width instead.

## The Reference Width

`reference_width` records the container width at which `layout` was arranged. It is set automatically whenever tiles are edited in the authored layout. If it's unset, the largest breakpoint is assumed, or 1200px when there are no breakpoints. Generation works without breakpoints; breakpoints are only needed for previewing and custom layouts.

## Previewing and Customizing Breakpoints

With `breakpoints=[768, 1200]` the grid has three bands: **xs** (< 768px), **sm** (768 - 1200px) and **md** (> 1200px). When `editable=True`, a toolbar shows a chip for each band plus "AUTO":

- The band containing `reference_width` is marked **base**. Editing while it's shown edits `layout` and updates `reference_width`.
- Clicking another band constrains the grid to that band's maximum width and shows the generated layout. Editing it saves a custom layout for that band to `responsive_layouts`, and the chip is marked **custom**.
- While a custom band is shown, **Reset** discards its custom layout so it's generated again.
- "AUTO" returns to the natural width.

Custom layouts can also be provided up front:

```python
grid = TileGrid(
    objects=[...],
    breakpoints=[768, 1200],
    layout=[...],
    reference_width=1400,
    responsive_layouts={
        "xs": [
            {"index": 0, "width": 100, "height": 120, "visible": True},
            ...
        ],
    },
)
```

`grid.reset_responsive_layout("xs")` removes one custom layout, and `grid.reset_responsive_layout()` removes all of them. Custom layouts for the base band are ignored, since that band always shows `layout`.

## Persisting Responsive Layouts

When `local_save=True`, the reference width and custom layouts are persisted to `localStorage` alongside `layout`, and `grid.clear_local_save()` removes all of them.

```python
grid = TileGrid(
    objects=[...],
    breakpoints=[768, 1200],
    local_save=True,
    name="my-dashboard",
    sizing_mode="stretch_width",
)
```
