# How To: Create a Read-Only Grid

Set `editable=False` to present a fixed layout where users cannot drag or resize tiles. This is useful for dashboards intended for viewing only.

## Example

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Welcome\n\nThis is a fixed layout grid."),
        pn.pane.Markdown("# Info\n\nTiles cannot be moved or resized."),
        pn.pane.Markdown("# Details\n\nSet editable=False to lock the grid."),
    ],
    layout=[
        {"width": 100, "height": 150, "visible": True},
        {"width": 50, "height": 200, "visible": True},
        {"width": 50, "height": 200, "visible": True},
    ],
    editable=False,
    sizing_mode="stretch_width",
    height=500,
)

grid.servable()
```

## What Changes

When `editable=False`:

- Drag handles are not active (tiles cannot be reordered)
- Resize handles are not active (tiles cannot be resized)
- The layout is fully controlled by the `layout` parameter

The close button still works if `close_action` is set, allowing users to hide or remove tiles from a read-only grid.

## Toggling Editability

You can toggle `editable` at runtime, though this requires a page refresh to take effect since it controls whether Muuri's drag system and interact.js resize listeners are initialized.
