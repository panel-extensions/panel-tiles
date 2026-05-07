# panel-tiles

**panel-tiles** provides [`TileGrid`](reference/panel-tiles.md#panel_tiles.TileGrid), a draggable and resizable grid layout for Panel apps.

Install with pip:

```bash
pip install panel-tiles
```

```python
import panel as pn
from panel_tiles import TileGrid

pn.extension("panel-tiles")

TileGrid(objects=[pn.pane.Markdown("Hello")]).servable()
```

See the [API reference](reference/panel-tiles.md) for parameters and behavior.
