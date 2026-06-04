# Reference: TileGrid

`TileGrid` is a draggable, resizable grid layout component for Panel applications. It wraps [Muuri](https://muuri.dev/) for drag-and-drop reordering and [interact.js](https://interactjs.io/) for resize handles, giving users full control over tile arrangement.

```python
from panel_tiles import TileGrid
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `objects` | `list` | `[]` | Panel components displayed as tiles in the grid. |
| `editable` | `bool` | `True` | Whether tiles can be dragged and resized by the user. |
| `layout` | `list[dict]` | `[]` | Layout specification for each tile. Each entry is a dict with keys `width` (percent), `height` (pixels), `visible` (bool), and `index` (position). Applied on initial render and when updated programmatically. |
| `close_action` | `None \| "hide" \| "remove"` | `None` | Controls the close button behavior. `None` hides the close button entirely. `"hide"` hides the tile visually (it remains in `objects`). `"remove"` deletes the tile from `objects` on the server. |
| `fill_gaps` | `bool` | `True` | Whether Muuri should fill gaps in the grid layout when items are different sizes. |
| `local_save` | `bool` | `False` | Persist user layout changes to `localStorage` so they survive page refreshes. Requires `name` to be set for unique identification. |
| `name` | `str` | `""` | Unique identifier for the grid, used as the `localStorage` key when `local_save=True`. Required when multiple grids exist on the same page. |

## Layout Specification

Each entry in the `layout` list corresponds to a tile by position:

```python
layout = [
    {"width": 50, "height": 300, "visible": True},
    {"width": 50, "height": 300, "visible": True},
]
```

- **`width`** (float): Percentage of the grid container width (1-100).
- **`height`** (float | None): Height in pixels. If omitted or `None`, the tile auto-sizes to its content.
- **`visible`** (bool): Whether the tile is shown. Hidden tiles remain in `objects` but are not rendered in the grid.
- **`index`** (int): The sort position of the tile.

When `layout` is empty, tiles auto-size based on their content dimensions and the `width`/`height` parameters of child components.

## Layout Precedence

When `local_save=True`, the priority on page load is:

1. Saved layout from `localStorage` (user customizations)
2. Explicit `layout` parameter (developer default)
3. Auto-sizing from content

A programmatic update to `layout` (from the server) overwrites the saved `localStorage` value, resetting user customizations.

## Methods

`TileGrid` inherits from `ListLike`, so you can manipulate tiles dynamically:

- `grid.append(component)` - Add a tile to the end
- `grid.insert(index, component)` - Insert a tile at a position
- `grid.pop(index)` - Remove and return a tile
- `grid[index]` - Access a tile by index
- `grid.clear_local_save()` - Clear the saved layout from the browser's `localStorage`

## Sizing

The grid container itself accepts standard Panel sizing parameters (`width`, `height`, `sizing_mode`, `min_height`, `max_height`, etc.). Tiles within the grid are sized either by the `layout` spec or by intrinsic content dimensions.

When no `layout` is provided, tiles compute their initial width from:

1. The child component's `width` parameter (if set)
2. Explicit pixel widths in the child's inline styles
3. The rendered bounding box width

Similarly for height. The tile width is expressed as a percentage of the container, while height is always in pixels.
