# How To: Create a Basic Tile Grid

This guide shows how to create a simple draggable and resizable tile grid.

## Minimal Example

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Tile 1\n\nDrag me around!"),
        pn.pane.Markdown("# Tile 2\n\nResize from the corner."),
        pn.pane.Markdown("# Tile 3\n\nRearrange the grid."),
    ],
    sizing_mode="stretch_width",
    height=400,
)

grid.servable()
```

The grid renders each object as a tile with drag and resize handles. Tiles auto-size based on their content and can be freely rearranged by the user.

## With a Fixed Layout

To control the initial size and arrangement, provide a `layout`:

```python
grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Wide Tile"),
        pn.pane.Markdown("# Narrow Left"),
        pn.pane.Markdown("# Narrow Right"),
    ],
    layout=[
        {"width": 100, "height": 150, "visible": True},
        {"width": 50, "height": 200, "visible": True},
        {"width": 50, "height": 200, "visible": True},
    ],
    sizing_mode="stretch_width",
    height=500,
)
```

The first tile spans the full width at 150px tall, while the other two split the second row at 50% each.

## Resizing and Snapping

Drag a tile's corner handle to resize it. While resizing, the tile's edges snap to the edges of nearby tiles and of the grid, and stored widths are rounded so a snapped tile always fits next to its neighbours.

Widening a tile to fill the rest of its row is forgiving: if you drag slightly past the end of the row, the tile snaps back to fill the remaining space exactly and nothing moves. A thin outline and a marker at the row end show this. Only when you drag further than `overflow_tolerance` pixels (56 by default) past the row end does the grid reflow on release. A dashed preview shows the tile's new size, and the tiles that will move to the next row are outlined in the warning colour.

```python
grid = TileGrid(objects=[...], overflow_tolerance=80)
```

Set `overflow_tolerance=0` to reflow as soon as the row overflows.

In [rows mode](row_layout.md#resizing-within-a-row) a tile with a neighbour to its right moves the boundary between them instead, so the neighbour shrinks or grows and the row never reflows.
