# How To: Add and Remove Tiles Dynamically

`TileGrid` supports adding and removing tiles at runtime using the same list-like API as other Panel layouts.

## Adding Tiles

Use `append` or `insert` to add tiles dynamically:

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension()

grid = TileGrid(
    objects=[pn.pane.Markdown("# Initial Tile")],
    close_action="remove",
    sizing_mode="stretch_width",
    height=500,
)

counter = [1]

def add_tile(event):
    counter[0] += 1
    grid.append(pn.pane.Markdown(f"# Tile {counter[0]}\n\nDynamically added."))

add_button = pn.widgets.Button(name="Add Tile", button_type="primary")
add_button.on_click(add_tile)

pn.Column(add_button, grid).servable()
```

New tiles appear at the end of the grid and auto-size to their content. If a `layout` is set, new tiles beyond the layout spec length will auto-size.

## Removing Tiles

Remove tiles programmatically with `pop`:

```python
def remove_last(event):
    if len(grid.objects) > 0:
        grid.pop(-1)
```

Or let users remove tiles via the close button by setting `close_action="remove"`.
