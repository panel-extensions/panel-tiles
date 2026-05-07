from pathlib import Path

import param
from bokeh.embed.bundle import extension_dirs
from panel.custom import Children, JSComponent
from panel.layout.base import ListLike

BASE_PATH = Path(__file__).parent
DIST_PATH = BASE_PATH / 'dist'

extension_dirs['panel-tiles'] = DIST_PATH


class TileGrid(JSComponent, ListLike):
    """
    A drag+resize grid wrapper around Muuri + interactjs.
    """

    editable = param.Boolean(default=True)

    fill_gaps = param.Boolean(default=True)

    initial_layout = param.List(default=[])

    local_save = param.Boolean(default=True)

    layout = param.List(default=[])

    objects = Children(doc="Items in the grid.")

    _bundle = DIST_PATH / "panel-tiles.bundle.js"
    _esm = BASE_PATH / "models" / "grid.js"
    _stylesheets = [DIST_PATH / "css" / "grid.css"]


__all__ = ["TileGrid"]
