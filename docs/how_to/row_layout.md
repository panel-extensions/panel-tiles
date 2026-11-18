# How To: Lay Out Tiles in Rows

By default `TileGrid` packs tiles like a masonry wall: each tile goes into the highest free slot, so a short tile further down the list can fill a gap anywhere above it. That makes good use of space, but rows don't really exist, and resizing or moving one tile can make unrelated tiles jump. Set `layout_mode="rows"` for a more grid-like arrangement.

## Rows Mode

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Chart"),
        pn.pane.Markdown("# Revenue"),
        pn.pane.Markdown("# Users"),
        pn.pane.Markdown("# Table"),
    ],
    layout=[
        {"width": 66.67, "height": 400, "visible": True},
        {"width": 33.33, "height": 190, "visible": True},
        {"width": 33.33, "height": 190, "visible": True},
        {"width": 100, "height": 300, "visible": True},
    ],
    layout_mode="rows",
    sizing_mode="stretch_width",
)

grid.servable()
```

Tiles fill each row from left to right in list order. A row is as tall as its tallest tile, and the next row starts below it, so all tiles in a row share the same top edge. Once a tile no longer fits on a row, it may still drop into space left beside a taller tile in the same row: here the two cards stack beside the chart. A tile never moves up into an earlier row.

The `layout` format is the same in both modes, so you can switch an existing app to rows mode without changing its saved layouts. The arrangement may differ, since tiles that used to backfill gaps now stay in their own row.

## Dragging

In rows mode a dragged tile is placed by the edge leading the drag rather than by how much it overlaps other tiles, so large tiles move as easily as small ones:

- Dragging sideways, the tile passes a neighbour once its leading edge reaches a quarter of the way into it.
- Dragging up or down, the tile moves into another row once its top or bottom edge reaches a quarter of the way into that row.
- To the right of a row's last tile, the dragged tile goes to the end of that row.
- With the pointer below all tiles, the dragged tile moves to the end of the grid.

Tiles always keep their list order, so a tile placed before the first tile of a row stays at the end of the previous row if it still fits there.

A dashed placeholder shows where the tile will land while you drag, in both modes. Dragging near the edge of the window or of a scrolling container scrolls it.

## Resizing Within a Row

In rows mode, resizing a tile's width moves the boundary between it and the tile to its right, like dragging the divider of a split pane. Widening the tile shrinks its neighbour and narrowing it widens the neighbour, so the row stays full, the neighbour's right edge stays where it is, and no tile moves to another row:

- If the row has spare room, the tile grows into it first, pushing the tiles after it along. The neighbour only starts to shrink once the row is full.
- Tiles stacked on top of one another beside the resized tile shrink or grow together, so they stay aligned.
- The resize stops when the neighbour reaches its minimum width (100 pixels, or the `min_width` of its content or `min_col_width` if either is larger) or its maximum width.
- Pulling the edge all the way to the end of the row still reflows it: a dashed preview shows the tile filling the whole row and outlines the tiles that will move, and on release they move to the next row with their original widths.
- The last tile in a row has no neighbour to its right, so widening it past the end of the row reflows the row on release, as described in [Resizing and Snapping](basic_grid.md#resizing-and-snapping).

While the boundary is moving, the resized tile is outlined and a marker shows the shared edge.

Set `row_resize="wrap"` to let tiles grow past the end of their row instead, so the tiles that no longer fit move to the next row on release:

```python
grid = TileGrid(objects=[...], layout_mode="rows", row_resize="wrap")
```

`row_resize` has no effect in masonry mode, which has no fixed rows to split.

## Snapping to Columns and Rows

Resized tiles snap to the edges of their neighbours and to the end of their row. Set `columns` to also snap widths to a column grid, and `row_height` to snap heights to a fixed step:

```python
grid = TileGrid(objects=[...], layout_mode="rows", columns=12, row_height=50)
```

With `columns=12` a tile's right edge always lands on one of twelve column lines, and its width is still stored as a percentage. `row_height` counts the tile's margins, so a tile two steps tall lines up with two tiles of one step stacked beside it. Both options also work in masonry mode.

## Tracking the Selected Tile

`selected` holds the index into `objects` of the tile that was last clicked, focused, dragged or resized:

```python
grid = TileGrid(objects=[...])

def on_select(event):
    print("Selected tile", event.new)

grid.param.watch(on_select, "selected")
```

Setting `selected` from Python highlights that tile with a subtle outline. The index follows its tile when tiles are added or removed before it, and becomes `None` when the tile itself is removed or hidden with the close button. Values outside the range of `objects` raise a `ValueError`.
