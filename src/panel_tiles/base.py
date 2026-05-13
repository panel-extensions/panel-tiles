import hashlib
import os
from pathlib import Path
from typing import Literal

import param
from bokeh.embed.bundle import extension_dirs
from panel.config import config
from panel.custom import Children, JSComponent
from panel.io import state
from panel.layout.base import ListLike
from panel.util import classproperty

BASE_PATH = Path(__file__).parent
DIST_PATH = BASE_PATH / "dist"

extension_dirs["panel-tiles"] = DIST_PATH


class TileGrid(JSComponent, ListLike):
    """
    A drag+resize grid wrapper around Muuri + interactjs.
    """

    editable = param.Boolean(default=True)

    fill_gaps = param.Boolean(default=True)

    initial_layout = param.List(default=[])

    local_save = param.Boolean(default=False)

    layout = param.List(default=[])

    objects = Children(doc="Items in the grid.")

    _bundle = DIST_PATH / "panel-tiles.bundle.js"
    _esm = BASE_PATH / "models" / "grid.js"
    _stylesheets = [DIST_PATH / "css" / "grid.css"]

    @classmethod
    def _esm_path(cls, compiled: bool | Literal["compiling"] = True) -> os.PathLike | None:
        return super()._esm_path(compiled or True)

    @classmethod
    def _render_esm(cls, compiled: bool | Literal["compiling"] = True, server: bool = False):
        esm_path = cls._esm_path(compiled=compiled)
        if compiled != "compiling" and server:
            # Generate relative path to handle apps served on subpaths
            esm = ("" if state.rel_path else "./") + cls._component_resource_path(esm_path, compiled)
            if config.autoreload:
                modified = hashlib.sha256(str(esm_path.stat().st_mtime).encode("utf-8")).hexdigest()
                esm += f"?{modified}"
        else:
            esm = esm_path.read_text(encoding="utf-8")
        return esm

    @classproperty
    def _bundle_path(cls) -> os.PathLike | None:
        return cls._bundle


__all__ = ["TileGrid"]
