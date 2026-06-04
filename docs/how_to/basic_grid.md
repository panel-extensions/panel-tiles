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
