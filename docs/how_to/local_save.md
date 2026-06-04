# How To: Persist Layout with localStorage

Enable `local_save` to let users' layout changes (drag, resize, hide) survive page refreshes using the browser's `localStorage`.

## Basic Usage

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Section A\n\nProject overview."),
        pn.pane.Markdown("# Section B\n\nRecent activity."),
        pn.pane.Markdown("# Section C\n\nKey metrics."),
    ],
    layout=[
        {"width": 50, "height": 200, "visible": True},
        {"width": 50, "height": 200, "visible": True},
        {"width": 100, "height": 200, "visible": True},
    ],
    local_save=True,
    name="my-dashboard",
    sizing_mode="stretch_width",
    height=500,
)

grid.servable()
```

## Important: Set a Name

When `local_save=True`, always provide a unique `name`. This is used as the `localStorage` key to avoid collisions when multiple grids exist on the same page. A warning is emitted if `local_save=True` without a name.

## How It Works

- On first load with no saved state, the explicit `layout` is used.
- When the user drags, resizes, or hides tiles, the layout is saved to `localStorage`.
- On subsequent page loads, the saved layout takes priority over the explicit `layout`.
- A programmatic update to `layout` from the server overwrites the saved state, effectively resetting user customizations.

## Clearing Saved State

Call `clear_local_save()` to remove the saved layout from the browser's `localStorage`:

```python
grid.clear_local_save()
```

This sends a message to the frontend that deletes the stored layout. The next page refresh will fall back to the explicit `layout` parameter (or auto-sizing if none is set).

You can also reset the layout and clear saved state in one step by updating `layout`, which overwrites `localStorage` with the new value:

```python
grid.layout = [
    {"width": 50, "height": 200, "visible": True},
    {"width": 50, "height": 200, "visible": True},
    {"width": 100, "height": 200, "visible": True},
]
```
