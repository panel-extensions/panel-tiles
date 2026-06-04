# How To: Configure Close Buttons

The `close_action` parameter controls whether tiles show a close button and what happens when it is clicked.

## No Close Button (Default)

```python
grid = TileGrid(objects=[...], close_action=None)
```

No close button is rendered. This is the default.

## Hide Mode

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Tile A\n\nClick X to hide me."),
        pn.pane.Markdown("# Tile B\n\nI can be hidden too."),
        pn.pane.Markdown("# Tile C\n\nHidden tiles stay in objects."),
    ],
    close_action="hide",
    sizing_mode="stretch_width",
    height=400,
)

grid.servable()
```

Hidden tiles remain in `grid.objects` but are not visible. Their `visible` flag in the layout is set to `False`. You can restore hidden tiles by updating the layout:

```python
grid.layout = [{"width": 50, "height": 200, "visible": True} for _ in grid.objects]
```

## Remove Mode

```python
grid = TileGrid(
    objects=[
        pn.pane.Markdown("# Tile 1\n\nClick X to remove me."),
        pn.pane.Markdown("# Tile 2\n\nRemoved tiles are gone."),
    ],
    close_action="remove",
    sizing_mode="stretch_width",
    height=400,
)
```

Clicking the close button removes the tile from `grid.objects` on the server. This is permanent for that session.
